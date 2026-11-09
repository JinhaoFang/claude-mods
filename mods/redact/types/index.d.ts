// redact: the category set and the session-state contract. RedactCategory is
// the six categories, in the order /redact reports them; Hits counts each one;
// `paused` is the session switch /redact off and /redact on flip.
export type RedactCategory = 'email' | 'ipv4' | 'ipv6' | 'credential' | 'address' | 'phone'

export type Hits = Record<RedactCategory, number>

declare module 'claude-code' {
  interface PluginState {
    redact: { hits: Hits; paused: boolean }
  }
}
