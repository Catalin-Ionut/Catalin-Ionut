/** A subscription rate-limit window the meter shows. */
export type WindowKind = 'five_hour' | 'seven_day'

/** One rate-limit window of the subscription, as the last API response reported it. */
export type Limit = {
  kind: WindowKind
  percentUsed: number
  /** When the window resets, as an ISO 8601 timestamp; absent once it has reset. */
  resetsAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    meter: {
      limits: Limit[]
      ctx: number
      model: string
      effort: string
      cache: number
      frame: number
      ansi: boolean
    }
  }
}
