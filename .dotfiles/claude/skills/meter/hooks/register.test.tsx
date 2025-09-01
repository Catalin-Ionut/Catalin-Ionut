import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionRateLimit, SessionUsage, TurnUsage } from 'claude-code'

const NOW = Date.parse('2026-11-02T10:00:00Z')
const HOUR = 3_600_000
const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 58, resetsAt: new Date(NOW + HOUR).toISOString() },
  { kind: 'seven_day', percentUsed: 22, resetsAt: new Date(NOW + 25 * HOUR).toISOString() }
]

type World = {
  effortLevel?: string
  modelSettings?: Record<string, { effortLevel: string }>
  theme?: string
  model?: string
  rateLimits?: SessionRateLimit[]
  store?: Record<string, unknown>
  usageFails?: boolean
}

function world (on: On, { effortLevel = 'high', modelSettings = undefined, theme = undefined, model = 'claude-opus-5-5[1m]', rateLimits = LIMITS, store = {}, usageFails = false }: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  const session: { model: string; usage: TurnUsage | null; gate?: Promise<void> } = { model, usage: null }
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.model', async () => {
    await session.gate
    return { value: session.model }
  })
  on('turn.step', async function * ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: session.usage }
  })
  on('settings.read', () => ({ value: { effortLevel, modelSettings, theme } }))
  on('session.usage', () => {
    if (usageFails) throw new Error('usage unavailable')
    const value: SessionUsage = { startedAt: NOW, context: { window: 200_000, tokens: 62_000, percent: 31 }, rateLimits }
    return { value }
  })
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    if ('hint' in e.props) return <Text>{e.props.hint}</Text>
    return 'modes' in e.props && e.props.modes.length > 0 ? <Box key="engine" /> : ({ type: 'engine', ref: 0 } as const)
  })
  return { clock, store, session }
}

const start = ($: Engine) => $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
const footer = ($: Engine, columns?: number) =>
  $.ui.mount({
    plugin: 'meter',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes: [] },
    viewport: columns === undefined ? undefined : { columns, rows: 30 }
  })
const promptHint = ($: Engine, hint: string) =>
  $.ui.mount({ plugin: 'meter', surface: 'terminal', component: 'PromptHint', props: { hint, isDraft: false, isWorking: true } })
const step = async ($: Engine, model: string, effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max') => {
  for await (const chunk of $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1 })) void chunk
}
const text = async ($: Engine, value: string) => (await footer($)).find({ type: 'Text', text: value })
const LABELS = ['opus 5.5', 'cache', 'ctx', '5h', 'wk']
const labels = async ($: Engine, columns?: number) =>
  (await (await footer($, columns)).findAll({ type: 'Text' })).map(t => t.text).filter(t => LABELS.includes(t))
const usage = (read: number, written: number, input: number): TurnUsage =>
  ({ model: 'claude-opus-5-5', input_tokens: input, output_tokens: 500, cache_read_input_tokens: read, cache_creation_input_tokens: written })
const end = ($: Engine, reason: 'clear' | 'prompt_input_exit') => $.session.end({ reason, sessionId: 's1', resume: { id: 's1' } })
const dots = async ($: Engine) => (await (await footer($)).findAll({ type: 'Text', text: '●' })).map(t => t.props.color)

test('model, effort dots, ctx bar and both windows', async ($, on) => {
  world(on)
  await start($)
  const ui = await footer($)
  expect(await ui.find({ type: 'Text', text: 'opus 5.5' })).toBeDefined()
  expect(await dots($)).toHaveLength(3)
  expect(await ui.find({ type: 'Text', text: '○○' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ctx' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 31%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '5h' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 58%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'wk' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 22%' })).toBeDefined()
})

test('effort dots take the /effort picker colors: yellow, green, then blue', async ($, on) => {
  const w = world(on, { effortLevel: '' })
  await start($)
  const cases = [['low', ['warning']], ['medium', ['success', 'success']], ['high', ['permission', 'permission', 'permission']]] as const
  for (const [level, colors] of cases) {
    await step($, 'claude-opus-5-5', level)
    await w.clock.advance(8000)
    expect(await dots($)).toEqual([...colors])
  }
})

test('xhigh sweeps a shimmer over autoAccept dots, one dot per frame', async ($, on) => {
  const w = world(on, { effortLevel: '' })
  await start($)
  await step($, 'claude-opus-5-5', 'xhigh')
  const seen: number[] = []
  for (let i = 0; i < 8; i++) {
    const colors = await dots($)
    expect(colors).toHaveLength(4)
    expect(colors.every(c => c === 'autoAccept' || c === '#d0b4ff')).toBe(true)
    seen.push(colors.indexOf('#d0b4ff'))
    await w.clock.advance(100)
  }
  expect([...seen].sort()).toEqual([-1, -1, -1, -1, 0, 1, 2, 3])
})

test('max runs a rainbow that shifts one color per frame, and stops below xhigh', async ($, on) => {
  const w = world(on, { effortLevel: '' })
  await start($)
  await step($, 'claude-opus-5-5', 'max')
  const before = await dots($)
  expect(new Set(before).size).toBe(5)
  await w.clock.advance(100)
  expect((await dots($)).slice(0, 4)).toEqual(before.slice(1))
  const shifted = await dots($)
  await step($, 'claude-opus-5-5', 'high')
  await w.clock.advance(1000)
  await step($, 'claude-opus-5-5', 'max')
  expect(await dots($)).toEqual(shifted)
})

test('the dots stand still in a session nobody watches', async ($, on) => {
  const w = world(on, { effortLevel: '' })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: false })
  await step($, 'claude-opus-5-5', 'max')
  const before = await dots($)
  await w.clock.advance(1000)
  expect(await dots($)).toEqual(before)
})

test('the rainbow pauses while the row has no room for the dots', async ($, on) => {
  const w = world(on, { effortLevel: '' })
  await start($)
  await step($, 'claude-opus-5-5', 'max')
  const before = await dots($)
  expect(await (await footer($, 40)).findAll({ type: 'Text', text: '●' })).toHaveLength(0)
  await w.clock.advance(1000)
  expect(await dots($)).toEqual(before)
})

test('an ansi theme draws the rainbow in ansi colors', async ($, on) => {
  world(on, { effortLevel: '', theme: 'dark-ansi' })
  await start($)
  await step($, 'claude-opus-5-5', 'max')
  const colors = await dots($)
  expect(colors.every(c => ['red', 'redBright', 'yellow', 'green', 'cyan', 'blue', 'magenta'].includes(c as string))).toBe(true)
})

test('opusplan shows the model each request used and keeps its effort', async ($, on) => {
  const w = world(on, { effortLevel: '', model: 'Opus Plan' })
  await start($)
  expect(await text($, 'opus plan')).toBeDefined()
  await step($, 'claude-sonnet-5-5', 'high')
  await w.clock.advance(8000)
  expect(await text($, 'sonnet 5.5')).toBeDefined()
  expect(await dots($)).toHaveLength(3)
  await step($, 'claude-opus-5-5', 'max')
  await w.clock.advance(8000)
  expect(await text($, 'opus 5.5')).toBeDefined()
  expect(await dots($)).toHaveLength(5)
})

test('a /model change drops what the last request reported', async ($, on) => {
  const w = world(on, { effortLevel: '', model: 'Opus Plan' })
  await start($)
  await step($, 'claude-sonnet-5-5', 'high')
  w.session.model = 'claude-haiku-5-5'
  await w.clock.advance(8000)
  expect(await text($, 'haiku 5.5')).toBeDefined()
  expect(await dots($)).toHaveLength(0)
})

test('a short row drops the bars, then cache, wk, 5h and ctx, then the model', async ($, on) => {
  const w = world(on)
  await start($)
  w.session.usage = usage(95_000, 4_000, 1_000)
  await step($, 'claude-opus-5-5', 'high')
  expect(await (await footer($, 116)).find({ type: 'Text', text: ' ━━' })).toBeDefined()
  expect(await (await footer($, 115)).find({ type: 'Text', text: ' ━━' })).toBeUndefined()
  expect(await labels($, 84)).toEqual(['opus 5.5', 'cache', 'ctx', '5h', 'wk'])
  expect(await labels($, 80)).toEqual(['opus 5.5', 'ctx', '5h', 'wk'])
  expect(await dots($)).toHaveLength(3)
  expect(await labels($, 63)).toEqual(['opus 5.5', 'ctx', '5h'])
  expect(await labels($, 54)).toEqual(['opus 5.5', 'ctx'])
  expect(await labels($, 44)).toEqual(['opus 5.5'])
  expect(await labels($, 37)).toEqual(['ctx'])
  expect(await labels($, 36)).toEqual([])
})

test('display session keeps the 5-hour window', { options: { display: 'session' } }, async ($, on) => {
  const w = world(on)
  await start($)
  await w.clock.advance(8000)
  expect(await text($, '5h')).toBeDefined()
  expect(await text($, 'wk')).toBeUndefined()
})

test('display week keeps the weekly window', { options: { display: 'week' } }, async ($, on) => {
  world(on)
  await start($)
  expect(await text($, 'wk')).toBeDefined()
  expect(await text($, '5h')).toBeUndefined()
})

test('bars are green up to 50%, yellow up to 75% and red above', { options: { display: 'session' } }, async ($, on) => {
  world(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 50 }] })
  await start($)
  expect((await text($, ' 31%'))?.props.color).toBe('success')
  expect((await text($, ' ━━'))?.props.color).toBe('success')
  const colorAt = async (percent: number) => {
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: percent }], changed: [] })
    return (await text($, ` ${percent}%`))?.props.color
  }
  expect((await text($, ' 50%'))?.props.color).toBe('success')
  expect(await colorAt(51)).toBe('warning')
  expect(await colorAt(75)).toBe('warning')
  expect(await colorAt(76)).toBe('error')
  expect((await text($, ' ━━━━━'))?.props.color).toBe('error')
  expect(await colorAt(95)).toBe('error')
})

test('a measure updates the context and the window', async ($, on) => {
  world(on)
  await start($)
  await $.session.measure({
    context: { window: 200_000, percent: 47 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 63 }],
    changed: []
  })
  expect(await text($, ' 47%')).toBeDefined()
  expect(await text($, ' 63%')).toBeDefined()
})

test('a measure that changes nothing writes nothing to the store', async ($, on) => {
  const w = world(on)
  await start($)
  const at = w.store.at
  await w.clock.advance(1000)
  await $.session.measure({ context: { window: 200_000, percent: 31 }, rateLimits: LIMITS, changed: [] })
  expect(w.store.at).toBe(at)
})

test('a saved window past its reset reads 0%', async ($, on) => {
  world(on, {
    rateLimits: [],
    store: { at: NOW - 6 * HOUR, limits: [{ kind: 'five_hour', percentUsed: 92, resetsAt: new Date(NOW - HOUR).toISOString() }] }
  })
  await start($)
  expect(await text($, ' 0%')).toBeDefined()
  expect(await text($, ' 92%')).toBeUndefined()
})

test('a window that resets during the session reads 0%', { options: { display: 'session' } }, async ($, on) => {
  const w = world(on)
  await start($)
  expect(await text($, ' 58%')).toBeDefined()
  await w.clock.advance(HOUR + 8000)
  expect(await text($, ' 0%')).toBeDefined()
})

test('a failing usage read still starts the session with the saved windows', async ($, on) => {
  world(on, { usageFails: true, store: { at: NOW - 1000, limits: [{ kind: 'five_hour', percentUsed: 40 }] } })
  await start($)
  expect(await text($, ' 40%')).toBeDefined()
  expect(await text($, 'opus 5.5')).toBeDefined()
})

test('takes the windows another session saved', { options: { display: 'session' } }, async ($, on) => {
  const w = world(on)
  await start($)
  w.store.limits = [{ kind: 'five_hour', percentUsed: 71 }]
  w.store.at = NOW + 1000
  await w.clock.advance(8000)
  expect(await text($, ' 71%')).toBeDefined()
})

test('hides the cycle and interrupt hints', async ($, on) => {
  world(on)
  await start($)
  const ui = await promptHint($, 'esc to interrupt · ctrl+t to show todos (shift+tab to cycle)')
  expect(await ui.find({ type: 'Text', text: 'ctrl+t to show todos' })).toBeDefined()
})

test('keeps the hints when told to', { options: { hideCycleHint: false, hideInterruptHint: false } }, async ($, on) => {
  world(on)
  await start($)
  const hint = 'esc to interrupt · ctrl+t to show todos (shift+tab to cycle)'
  expect(await (await promptHint($, hint)).find({ type: 'Text', text: hint })).toBeDefined()
})

test('a cache bar after the model, green from 80%, yellow from 40% and red below', async ($, on) => {
  const w = world(on)
  await start($)
  expect(await text($, 'cache')).toBeUndefined()
  const cases: Array<[TurnUsage, string, string]> = [
    [usage(50_000, 50_000, 0), ' 50%', 'warning'],
    [usage(0, 99_000, 1_000), ' 0%', 'error'],
    [usage(95_000, 4_000, 1_000), ' 95%', 'success']
  ]
  for (const [value, shown, color] of cases) {
    w.session.usage = value
    await step($, 'claude-opus-5-5', 'high')
    const ui = await footer($)
    expect(await ui.find({ type: 'Text', text: 'cache' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: shown }))?.props.color).toBe(color)
  }
  const ui = await footer($)
  const labels = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => ['opus 5.5', 'cache', 'ctx'].includes(t))
  expect(labels).toEqual(['opus 5.5', 'cache', 'ctx'])
})

test('a step without usage, or with no input, keeps the last cache value', async ($, on) => {
  const w = world(on)
  await start($)
  w.session.usage = usage(95_000, 4_000, 1_000)
  await step($, 'claude-opus-5-5', 'high')
  for (const value of [null, usage(0, 0, 0)]) {
    w.session.usage = value
    await step($, 'claude-opus-5-5', 'high')
    expect(await text($, ' 95%')).toBeDefined()
  }
})

test('a /model switch and a /clear drop the cache bar until the next response', async ($, on) => {
  const w = world(on)
  await start($)
  w.session.usage = usage(95_000, 4_000, 1_000)
  await step($, 'claude-opus-5-5', 'high')
  expect(await text($, 'cache')).toBeDefined()
  w.session.model = 'claude-sonnet-5-5'
  await w.clock.advance(8000)
  expect(await text($, 'cache')).toBeUndefined()
  await step($, 'claude-sonnet-5-5', 'high')
  expect(await text($, 'cache')).toBeDefined()
  await end($, 'clear')
  expect(await text($, 'cache')).toBeUndefined()
})

test('the meter keeps polling after /clear and stops when the session exits', async ($, on) => {
  const w = world(on)
  await start($)
  await end($, 'clear')
  w.session.model = 'claude-haiku-5-5'
  await w.clock.advance(8000)
  expect(await text($, 'haiku 5.5')).toBeDefined()
  await end($, 'prompt_input_exit')
  w.session.model = 'claude-sonnet-5-5'
  await w.clock.advance(8000)
  expect(await text($, 'haiku 5.5')).toBeDefined()
})

for (const model of ['Default (Opus 5.5)', 'Opus 5.5', 'claude-opus-5-5[1m]', 'claude-opus-5-5-20261001', 'us.anthropic.claude-opus-5-5-v1:0']) {
  test(`modelSettings holds the effort for "${model}"`, async ($, on) => {
    world(on, { effortLevel: '', model, modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } } })
    await start($)
    expect(await dots($)).toEqual(['warning'])
  })
}

test('a /model switch shows the effort modelSettings holds for the new model before any request', async ($, on) => {
  const w = world(on, {
    effortLevel: '',
    modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' }, 'claude-sonnet-5-5': { effortLevel: 'medium' } }
  })
  await start($)
  expect(await dots($)).toHaveLength(3)
  await step($, 'claude-opus-5-5', 'high')
  w.session.model = 'Sonnet 5.5'
  await w.clock.advance(8000)
  expect(await text($, 'sonnet 5.5')).toBeDefined()
  expect(await dots($)).toHaveLength(2)
})

test('a model read still in flight when the session exits starts no animation', async ($, on) => {
  const w = world(on, { effortLevel: 'max' })
  await start($)
  const before = await dots($)
  let release = () => {}
  w.session.gate = new Promise(resolve => { release = resolve })
  await w.clock.advance(8000)
  await end($, 'prompt_input_exit')
  const stopped = await dots($)
  release()
  await w.clock.advance(1000)
  expect(await dots($)).toEqual(stopped)
  expect(before).toHaveLength(5)
})
