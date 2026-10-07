declare module 'claude-code' {
  interface PluginState {
    'context-band': {
      isHidden: boolean
      isCollapsed: boolean
      tracker: {
        loops: Record<string, { fill: number; model: string }>
        names: Record<string, string>
      }
    }
  }
}
