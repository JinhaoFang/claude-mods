declare module 'claude-code' {
  interface PluginState {
    'context-band': {
      isHidden: boolean
      mainEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
      tracker: {
        loops: Record<
          string,
          { fill: number; model: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number }
        >
        names: Record<string, string>
      }
    }
  }
}
