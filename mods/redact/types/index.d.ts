// redact —— 类别集合与会话状态契约的唯一家（single home）。RedactCategory 是六个
// 脱敏类别（顺序即 /redact 报告顺序）；Hits 是全覆盖计数记录；PluginState['redact']
// 是命中计数的存放形态，对应 atom({ plugin: 'redact', key: 'hits' }, ZERO_HITS)。
// 规则表与 doors 政策见 hooks/register.ts，设计结论见 README.md。
export type RedactCategory = 'email' | 'ipv4' | 'ipv6' | 'credential' | 'address' | 'phone'

export type Hits = Record<RedactCategory, number>

declare module 'claude-code' {
  interface PluginState {
    redact: { hits: Hits }
  }
}
