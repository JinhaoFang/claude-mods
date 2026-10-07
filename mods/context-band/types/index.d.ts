declare module 'claude-code' {
  interface PluginState {
    'context-band': {
      isHidden: boolean
      tracker: {
        loops: Record<string, { fill: number; model: string }>
        names: Record<string, string>
      }
    }
  }
}
