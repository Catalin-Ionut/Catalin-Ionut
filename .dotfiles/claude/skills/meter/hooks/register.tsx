import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, RenderViewport, SessionRateLimit, TurnUsage } from 'claude-code'

import type { Limit, WindowKind } from '../types'

const limits = atom({ plugin: 'meter', key: 'limits' } as const, [] as Limit[])
const ctx = atom({ plugin: 'meter', key: 'ctx' } as const, -1)
const model = atom({ plugin: 'meter', key: 'model' } as const, '')
const effort = atom({ plugin: 'meter', key: 'effort' } as const, '')
const frame = atom({ plugin: 'meter', key: 'frame' } as const, 0)
const ansi = atom({ plugin: 'meter', key: 'ansi' } as const, false)
const cache = atom({ plugin: 'meter', key: 'cache' } as const, -1)

const WINDOWS = ['five_hour', 'seven_day'] as const satisfies readonly WindowKind[]
const LABELS: Record<WindowKind, string> = { five_hour: '5h', seven_day: 'wk' }
const DISPLAYS = ['both', 'session', 'week'] as const
type Display = (typeof DISPLAYS)[number]
const WINDOW_OF: Record<Exclude<Display, 'both'>, WindowKind> = { session: 'five_hour', week: 'seven_day' }
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof EFFORTS)[number]
const POLL_MS = 8000
const FRAME_MS = 100
/** The /effort picker's colors: theme keys up to high, then a shimmer and a rainbow that move every frame. */
const EFFORT_COLORS = { low: 'warning', medium: 'success', high: 'permission' } as const
const SHIMMER = { rgb: '#d0b4ff', ansi: 'magentaBright' } as const
const RAINBOW = {
  rgb: ['#eb5f57', '#f58b57', '#fac35f', '#91c882', '#82aadc', '#9b82c8', '#c882b4'],
  ansi: ['red', 'redBright', 'yellow', 'green', 'cyan', 'blue', 'magenta']
} as const
const ANIMATED: readonly string[] = ['xhigh', 'max']
const CELLS = 7
const GAP = '   '
const SEPARATOR = ' · '
const CYCLE_HINT = /\s*\([^()]+ to cycle\)/
const INTERRUPT_HINT = /\s*esc to interrupt/

// Claude Code does not report how wide the footer's own parts are, so these approximate its
// layout. Adjust them when the footer changes.
/** Columns the footer row uses for its own padding. */
const FOOTER_PADDING = 4
/** Columns between the permission mode and the right side of the row. */
const FOOTER_GAP = 2
/** Columns kept for the permission mode label ("⏵⏵ auto mode on" is 15). */
const MODE_LABEL = 20
/** Columns kept spare when no other plugin shares the row: one space and a separator. */
const AROUND = 1 + SEPARATOR.length
/** Columns kept for another plugin's content on the row before the meter shows the model. */
const BENEATH_FLOOR = 10

/** Code point ranges a terminal draws two columns wide (CJK, Hangul, fullwidth forms, emoji). */
const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd]
]
/** Code point ranges a terminal draws with no width (combining marks, zero-width joiners, variation selectors). */
const ZERO: ReadonlyArray<readonly [number, number]> = [[0x0300, 0x036f], [0x200b, 0x200f], [0xfe00, 0xfe0f]]

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value)

const within = (ranges: typeof WIDE, point: number) => ranges.some(([low, high]) => point >= low && point <= high)

function widthOf (text: string) {
  let width = 0
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0
    width += within(ZERO, point) ? 0 : within(WIDE, point) ? 2 : 1
  }
  return width
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const windowsOf = (rateLimits: readonly SessionRateLimit[]): Limit[] =>
  WINDOWS.flatMap(kind => {
    const found = rateLimits.find(limit => limit.kind === kind)
    if (!found) return []
    return [{ kind, percentUsed: found.percentUsed, ...(found.resetsAt ? { resetsAt: found.resetsAt } : {}) }]
  })

function isLimitList (value: unknown): value is Limit[] {
  return Array.isArray(value) && value.every(item =>
    typeof item === 'object' && item !== null &&
    isOneOf(WINDOWS, item.kind) &&
    typeof item.percentUsed === 'number' &&
    (item.resetsAt === undefined || typeof item.resetsAt === 'string'))
}

/** A window past its reset reads 0%, until a response reports the new window. */
const expire = (all: Limit[], now: number): Limit[] =>
  all.map(limit => (limit.resetsAt !== undefined && Date.parse(limit.resetsAt) <= now
    ? { kind: limit.kind, percentUsed: 0 }
    : limit))

/** "claude-opus-5-5[1m]" or "Opus 5.5 (default)" → "opus 5.5". */
function shortModel (id: string) {
  const name = id.toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim().replace(/^claude[- ]/, '')
  const parts = name.match(/^([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/)
  if (!parts) return name
  return parts[3] ? `${parts[1]} ${parts[2]}.${parts[3]}` : `${parts[1]} ${parts[2]}`
}

const levelOf = (value: unknown): Effort | '' => (isOneOf(EFFORTS, value) ? value : '')

/**
 * The key settings use under modelSettings: "Sonnet 5.5", "Default (Opus 5.5)", "claude-sonnet-5-5[1m]",
 * "claude-haiku-4-5-20251001" and "us.anthropic.claude-opus-5-5-v1:0" give "claude-sonnet-5-5" and so on.
 * An alias without a version ("opus", "Opus Plan") gives undefined.
 */
function settingsKey (id: string) {
  const lower = id.toLowerCase()
  const named = lower.match(/\(([^)]*\d[^)]*)\)/)?.[1] ?? lower
  const name = named.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim().replace(/[\s.]+/g, '-')
  const found = (name.includes('claude-') ? name : `claude-${name}`)
    .match(/claude-([a-z]+-\d+(?:-\d{1,2})?)(?=$|-\d{8}|-v\d|[^a-z0-9])/)
  return found ? `claude-${found[1]}` : undefined
}

/** The effort a settings file sets for the model, else its general effortLevel. */
function settingLevel (id: string, perModel: unknown, general: unknown): Effort | '' {
  const key = settingsKey(id)
  const own = key !== undefined && typeof perModel === 'object' && perModel !== null
    ? (perModel as Record<string, { effortLevel?: unknown } | undefined>)[key]?.effortLevel
    : undefined
  return levelOf(own) || levelOf(general)
}

function isBlank (node: RenderNode | undefined): boolean {
  if (node === undefined || node === null) return true
  if (typeof node === 'string') return node.trim() === ''
  if (node.type === 'engine') return true
  return (node.type === 'Box' || node.type === 'Text') && (node.children ?? []).every(isBlank)
}

function widthOfNode (node: RenderNode | undefined, modes: readonly string[]): number {
  if (node === undefined || node === null) return 0
  if (typeof node === 'string') return widthOf(node)
  if (node.type === 'engine') return widthOf(modes.join(' & '))
  return (node.children ?? []).reduce((sum, child) => sum + widthOfNode(child, modes), 0)
}

function holdsPlugin (node: RenderNode | undefined): boolean {
  if (node === undefined || node === null || typeof node === 'string' || node.type === 'engine') return false
  return 'part' in node || (node.children ?? []).some(holdsPlugin)
}

/** The share of the request's input the prompt cache served, or undefined when it sent none. */
function hitRate (usage: TurnUsage | null): number | undefined {
  if (usage === null) return undefined
  const total = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return total > 0 ? (usage.cache_read_input_tokens / total) * 100 : undefined
}

/**
 * Each filled dot's color, as the /effort picker draws the level: xhigh sweeps a light shimmer
 * over autoAccept, bolding its neighbours; max runs a rainbow that shifts one color per frame.
 */
function effortDots (level: Effort, dots: number, tick: number, palette: 'rgb' | 'ansi') {
  return Array.from({ length: dots }, (_, i) => {
    if (level === 'max') return { color: RAINBOW[palette][(i + tick) % RAINBOW[palette].length], bold: false }
    if (level === 'xhigh') {
      const at = tick % (dots + 4)
      return { color: i === at ? SHIMMER[palette] : 'autoAccept', bold: Math.abs(i - at) <= 1 }
    }
    return { color: EFFORT_COLORS[level], bold: false }
  })
}

const colorFor = (percent: number) => (percent > 75 ? 'error' : percent > 50 ? 'warning' : 'success')
/** A high cache share is good, so its colors run the other way. */
const cacheColorFor = (percent: number) => (percent >= 80 ? 'success' : percent >= 40 ? 'warning' : 'error')

async function setModel ($: EngineInterface, value: string) {
  if ((await read($, model)) !== value) await update($, model, () => value)
}

async function setAnsi ($: EngineInterface, theme: unknown) {
  const value = typeof theme === 'string' && theme.endsWith('-ansi')
  if ((await read($, ansi)) !== value) await update($, ansi, () => value)
}

async function setEffort ($: EngineInterface, value: string) {
  if ((await read($, effort)) !== value) await update($, effort, () => value)
}

async function setCtx ($: EngineInterface, value: number) {
  if ((await read($, ctx)) !== value) await update($, ctx, () => value)
}

function visible (all: Limit[], display: Display): Limit[] {
  if (display === 'both') return all
  return all.filter(limit => limit.kind === WINDOW_OF[display])
}

function bar (label: string, percent: number, color = colorFor(percent)) {
  const filled = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * CELLS)
  const used = ` ${Math.round(percent)}%`
  return { label, color, filled, used, short: widthOf(label + used) }
}

type Meter = ReturnType<typeof bar>

/** Meters a short row gives up first, before the model: the cache, then the weekly and 5-hour windows. */
const DROP_ORDER = ['cache', LABELS.seven_day, LABELS.five_hour, 'ctx']

/**
 * Every way to draw the row, widest first: all bars; then numbers only; then meters dropped one at a
 * time in DROP_ORDER while the model stays; then the same without the model.
 */
function layouts (meters: Meter[], head: number) {
  const gaps = (n: number) => Math.max(0, n - 1) * GAP.length
  const measure = (shown: Meter[], hasModel: boolean, hasBar: boolean) =>
    (hasModel ? head : 0) +
    shown.reduce((sum, m) => sum + m.short + (hasBar ? 1 + CELLS : 0), 0) +
    gaps(shown.length + (hasModel ? 1 : 0))
  const subsets = [meters]
  for (const label of DROP_ORDER) {
    const last = subsets[subsets.length - 1]
    if (last.some(m => m.label === label)) subsets.push(last.filter(m => m.label !== label))
  }
  const hasModel = head > 0
  return [
    { hasModel, hasBar: true, shown: meters },
    ...subsets.map(shown => ({ hasModel, hasBar: false, shown })),
    ...(hasModel ? subsets.map(shown => ({ hasModel: false, hasBar: false, shown })) : [])
  ].map(layout => ({ ...layout, width: measure(layout.shown, layout.hasModel, layout.hasBar) }))
}

const ignore = () => {}

function animate ($: EngineInterface, s: State, level: string) {
  const wanted = s.isInteractive && ANIMATED.includes(level)
  if (wanted && s.animation === undefined) {
    s.animation = $.clock.every(FRAME_MS, () => {
      if (s.dotsShown) void update($, frame, n => n + 1).catch(ignore)
    })
  } else if (!wanted && s.animation !== undefined) {
    s.animation.cancel()
    s.animation = undefined
  }
}

/** What one registration remembers between events. */
type State = {
  hintWidth: number
  lastHint: string
  lastTidied: string
  seenAt: number
  stepEffort: string | undefined
  stepModel: string
  /** The model /model last showed; with opusplan it names the setting, not the model a request uses. */
  sessionModel: string
  settingsEffort: string
  timers: Array<{ cancel: () => void }>
  /** Moves the xhigh shimmer and the max rainbow; runs only in an interactive session at those levels. */
  animation: { cancel: () => void } | undefined
  isInteractive: boolean
  /** Whether the last drawing had room for the effort dots; a hidden animation redraws nothing. */
  dotsShown: boolean
}

function stopTimers (s: State) {
  for (const timer of s.timers) timer.cancel()
  s.timers = []
  s.animation?.cancel()
  s.animation = undefined
}

async function setLimits ($: EngineInterface, next: Limit[]) {
  if (!same(await read($, limits), next)) await update($, limits, () => next)
}

/** Shows windows a response reported, and shares them with other sessions through the store. */
async function remember ($: EngineInterface, s: State, found: Limit[]) {
  if (found.length === 0) return
  if (same(await read($, limits), found)) return
  s.seenAt = await $.clock.now()
  await update($, limits, () => found)
  await $.store.set('limits', found)
  await $.store.set('at', s.seenAt)
}

async function loadSaved ($: EngineInterface, s: State) {
  const [saved, storedAt] = await Promise.all([$.store.get('limits'), $.store.get('at')])
  s.seenAt = Number(storedAt) || 0
  if (isLimitList(saved)) await setLimits($, expire(saved, await $.clock.now()))
}

async function loadUsage ($: EngineInterface, s: State) {
  const usage = await $.session.usage()
  await remember($, s, windowsOf(usage.rateLimits))
  if (usage.context.percent !== undefined) await setCtx($, usage.context.percent)
}

/** Takes windows another session saved since, then zeroes the windows that have reset. */
async function tick ($: EngineInterface, s: State) {
  const at = Number(await $.store.get('at')) || 0
  const saved = at > s.seenAt ? await $.store.get('limits') : undefined
  const fresh = isLimitList(saved)
  if (fresh) s.seenAt = at
  await setLimits($, expire(fresh ? saved : await read($, limits), await $.clock.now()))
}

/**
 * The model the last request used, else the model as /model shows it. The effort: the last one
 * sent, else the setting. A change of the /model setting or of effortLevel drops what the last
 * request reported.
 */
async function refreshModel ($: EngineInterface, s: State) {
  const [current, general, perModel, theme] = await Promise.all([
    $.session.model().catch(() => ''),
    $.settings.read({ key: 'effortLevel' }).catch(() => undefined),
    $.settings.read({ key: 'modelSettings' }).catch(() => undefined),
    $.settings.read({ key: 'theme' }).catch(() => undefined)
  ])
  await setAnsi($, theme)
  const level = settingLevel(current, perModel, general)
  const name = current ? shortModel(current) : ''
  const switched = name !== '' && s.sessionModel !== '' && name !== s.sessionModel
  if (name) s.sessionModel = name
  if (level !== s.settingsEffort || switched) {
    s.settingsEffort = level
    s.stepEffort = undefined
    s.stepModel = ''
  }
  // The cache belongs to one model, so the last hit rate says nothing about the new one.
  if (switched) await update($, cache, () => -1)
  const shown = s.stepModel || name
  if (shown) await setModel($, shown)
  await setEffort($, s.stepEffort ?? s.settingsEffort)
  animate($, s, s.stepEffort ?? s.settingsEffort)
}

function roomOf (s: State, e: { surface: string; viewport?: RenderViewport }) {
  if (e.surface !== 'terminal' || e.viewport === undefined) return Infinity
  return e.viewport.columns - FOOTER_PADDING - FOOTER_GAP - MODE_LABEL - (s.hintWidth > 0 ? 1 + s.hintWidth : 0)
}

export const register: Register = (on, options) => {
  const s: State = {
    hintWidth: 0,
    lastHint: '',
    lastTidied: '',
    seenAt: 0,
    stepEffort: undefined,
    stepModel: '',
    sessionModel: '',
    settingsEffort: '',
    timers: [],
    animation: undefined,
    isInteractive: false,
    dotsShown: false
  }

  const hidden = [
    ...(options.hideCycleHint !== false ? [CYCLE_HINT] : []),
    ...(options.hideInterruptHint !== false ? [INTERRUPT_HINT] : [])
  ]
  const display: Display = isOneOf(DISPLAYS, options.display) ? options.display : 'both'

  function tidy (hint: string) {
    if (!hidden.some(part => part.test(hint))) return hint
    return hidden
      .reduce((line, part) => line.replace(part, ' · '), hint)
      .split('·')
      .map(part => part.trim())
      .filter(Boolean)
      .join(' · ')
  }

  on('session.start', async ($, e, next) => {
    stopTimers(s)
    s.isInteractive = e.isInteractive
    await loadSaved($, s).catch(ignore)
    await loadUsage($, s).catch(ignore)
    await refreshModel($, s).catch(ignore)

    if (e.isInteractive) {
      s.timers.push($.clock.every(POLL_MS, () => {
        void tick($, s).catch(ignore)
        void refreshModel($, s).catch(ignore)
      }))
    }
    return next(e)
  })

  // /clear ends the conversation without a session.start for the next one, so the timers stay and
  // only what described the old conversation goes.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, cache, () => -1).catch(ignore)
      return next(e)
    }
    s.isInteractive = false
    stopTimers(s)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await remember($, s, windowsOf(e.rateLimits)).catch(ignore)
    if (e.context.percent !== undefined) await setCtx($, e.context.percent).catch(ignore)
    return next(e)
  })

  on('turn.step', async function * ($, e, next) {
    if (e.agentId === undefined) {
      s.stepModel = shortModel(e.model)
      // Absent on a model without effort, so the dots go.
      s.stepEffort = levelOf(e.effort)
      void setEffort($, s.stepEffort).catch(ignore)
      animate($, s, s.stepEffort)
      void setModel($, s.stepModel).catch(ignore)
    }
    const result = yield * next(e)
    const rate = e.agentId === undefined ? hitRate(result.usage) : undefined
    if (rate !== undefined) void update($, cache, () => rate).catch(ignore)
    return result
  })

  // Bottom right of the footer: model and effort, prompt cache, context, then the subscription
  // window(s), then whatever is beneath. A short row drops the bars first, then the meters in
  // DROP_ORDER, then the model, then the meter itself.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const [all, ctxPercent, modelName, level, cachePercent, tick, isAnsi, beneath] = await Promise.all([
      read($, limits),
      read($, ctx),
      read($, model),
      read($, effort),
      read($, cache),
      read($, frame),
      read($, ansi),
      next(e)
    ])
    const meters = [
      ...(cachePercent >= 0 ? [bar('cache', cachePercent, cacheColorFor(cachePercent))] : []),
      ...(ctxPercent >= 0 ? [bar('ctx', ctxPercent)] : []),
      ...visible(all, display).map(limit => bar(LABELS[limit.kind], limit.percentUsed))
    ]
    const dots = isOneOf(EFFORTS, level) ? EFFORTS.indexOf(level) + 1 : 0
    const palette = isAnsi ? 'ansi' : 'rgb'
    if (meters.length === 0 && !modelName) return beneath

    const hasBeneath = e.props.modes.length > 0 || !isBlank(beneath)
    const below = widthOfNode(beneath, e.props.modes)
    const hasPlugin = holdsPlugin(beneath)
    const room = roomOf(s, e) - (hasBeneath ? below + SEPARATOR.length : 0) - (hasPlugin ? 0 : AROUND)
    const given = hasPlugin ? Math.max(0, BENEATH_FLOOR - below) : 0

    const head = modelName ? widthOf(modelName) + (dots > 0 ? 1 + EFFORTS.length : 0) : 0
    const fit = layouts(meters, head).find(({ hasModel, shown, width }) =>
      (hasModel || shown.length > 0) && width <= (hasModel ? room - given : room))
    s.dotsShown = fit !== undefined && fit.hasModel && dots > 0
    if (!fit) return beneath

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        {fit.hasModel ? <Text dimColor>{modelName}</Text> : null}
        {fit.hasModel && dots > 0 ? <Text>{' '}</Text> : null}
        {fit.hasModel && dots > 0
          ? effortDots(level as Effort, dots, tick, palette).map(({ color, bold }, i) => (
            <Text key={`dot${i}`} color={color} bold={bold}>●</Text>
          ))
          : null}
        {fit.hasModel && dots > 0 ? <Text dimColor>{'○'.repeat(EFFORTS.length - dots)}</Text> : null}
        {fit.shown.map((m, i) => (
          <Box flexDirection="row" key={m.label}>
            {i > 0 || fit.hasModel ? <Text>{GAP}</Text> : null}
            <Text dimColor>{m.label}</Text>
            {fit.hasBar ? <Text color={m.color}>{' ' + '━'.repeat(m.filled)}</Text> : null}
            {fit.hasBar ? <Text dimColor>{'─'.repeat(CELLS - m.filled)}</Text> : null}
            <Text color={m.color}>{m.used}</Text>
          </Box>
        ))}
        {hasBeneath ? <Text dimColor>{SEPARATOR}</Text> : null}
        {beneath}
      </Box>
    )
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.props.hint !== s.lastHint) {
      s.lastHint = e.props.hint
      s.lastTidied = tidy(e.props.hint)
    }
    const hint = s.lastTidied
    if (e.surface === 'terminal') {
      const width = widthOf(hint)
      if (width !== s.hintWidth) {
        s.hintWidth = width
        $.ui.invalidate('ui.render')
      }
    }
    return hint === e.props.hint ? next(e) : next({ ...e, props: { ...e.props, hint } })
  })
}
