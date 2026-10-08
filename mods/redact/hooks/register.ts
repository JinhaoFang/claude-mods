// redact —— 在会话行存入上下文之前脱敏改写的入口。
// 挂 session.append：doors 政策先门控（BASE_DOORS 默认洗 tool-result/tool-message/
// attachment/notice/hook-context；response/note/compaction 永不洗；prompt/command 随
// scrubPrompt；delivery 随 scrubPrompt 或非本人 origin——本人仅 origin.kind 为
// composer 与 bridge，未知类别向保护侧失败），再经 washBlocks→washText 按固定顺序
// 折叠规则表（PATTERN_LIBRARY：PEM→JWT→已知前缀→带标签赋值→.env→email→ipv6→ipv4→
// 街道地址→中文地址→电话），命中计入 atom 'redact.hits'，toast 逐行提示（quiet 可关），
// /redact 汇报本会话分类计数。改写抛错时该行原样放行并只记一次日志，注册级 .catch 兜底。
// 类别集合与会话状态契约在 ../types；规则顺序、类别开关与占位符格式见 README.md。
import { atom, read, update } from 'claude-code'
import type {
  ApiContentBlock,
  PluginOptions,
  Register,
  SessionAppendDoor,
  SessionAppendOrigin,
  SessionAppendMessage,
} from 'claude-code'
import type { Hits, RedactCategory } from '../types'

type Category = RedactCategory
type RowHits = Partial<Record<Category, number>>
type DoorPolicy = (door: SessionAppendDoor, origin: SessionAppendOrigin) => boolean

interface Pattern {
  category: Category
  regex: RegExp
}

interface Config {
  wash: ReadonlySet<Category>
  doors: ReadonlySet<SessionAppendDoor> | 'scrub'
  quiet: boolean
}

interface Rules {
  doors: DoorPolicy
  patterns: readonly Pattern[]
  quiet: boolean
}

interface Washed {
  message: SessionAppendMessage
  hits: RowHits
}

const ZERO_HITS: Hits = { email: 0, ipv4: 0, ipv6: 0, credential: 0, address: 0, phone: 0 }

const CATEGORIES = Object.keys(ZERO_HITS) as Category[]

const CONFIG_DEFAULTS = {
  emails: true,
  ipAddresses: true,
  credentials: true,
  addresses: true,
  phoneNumbers: false,
  scrubPrompt: false,
  quiet: false,
} as const

const CATEGORY_SWITCHES = [
  ['email', 'emails'],
  ['ipv4', 'ipAddresses'],
  ['ipv6', 'ipAddresses'],
  ['credential', 'credentials'],
  ['address', 'addresses'],
  ['phone', 'phoneNumbers'],
] as const satisfies readonly (readonly [Category, keyof typeof CONFIG_DEFAULTS])[]

const DOORS = [
  'prompt',
  'command',
  'response',
  'tool-result',
  'tool-message',
  'delivery',
  'attachment',
  'hook-context',
  'note',
  'compaction',
  'notice',
] as const satisfies readonly SessionAppendDoor[]

const BASE_DOORS: Record<SessionAppendDoor, boolean> = {
  'tool-result': true,
  'tool-message': true,
  attachment: true,
  notice: true,
  'hook-context': true,
  prompt: false,
  command: false,
  delivery: false,
  response: false,
  note: false,
  compaction: false,
}

const ALWAYS_WASH: ReadonlySet<SessionAppendDoor> = new Set(
  DOORS.filter(door => BASE_DOORS[door]),
)

const NEVER_WASHED: ReadonlySet<SessionAppendDoor> = new Set<SessionAppendDoor>([
  'response',
  'note',
  'compaction',
])

const PERSON_ORIGIN_KINDS: ReadonlySet<string> = new Set(['composer', 'bridge'])

const HITS = atom({ plugin: 'redact', key: 'hits' } as const, ZERO_HITS)

const PATTERN_LIBRARY: readonly Pattern[] = [
  {
    category: 'credential',
    regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    category: 'credential',
    regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g,
  },
  {
    category: 'credential',
    regex: /\b(?:AKIA[A-Z0-9]{16}|gh[posu]_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9_-]{10,})/g,
  },
  {
    category: 'credential',
    regex: /(?:api[_-]?key|token|secret|password)\s*[=:]\s*["']?[A-Za-z0-9+/_=-]{16,}/g,
  },
  {
    category: 'credential',
    regex: /^[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*[ \t]*=[ \t]*[^\[\s]\S{7,}$/gm,
  },
  {
    category: 'email',
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  },
  {
    category: 'ipv6',
    regex: /\b(?:[A-Fa-f0-9]{1,4}:){1,6}:[A-Fa-f0-9]{1,4}(?::[A-Fa-f0-9]{1,4}){0,5}\b(?!\.\d)|\b::[A-Fa-f0-9]{1,4}(?::[A-Fa-f0-9]{1,4}){0,5}\b(?!\.\d)|\b(?:[A-Fa-f0-9]{1,4}:){3,7}[A-Fa-f0-9]{1,4}\b/g,
  },
  {
    category: 'ipv4',
    regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\b/g,
  },
  {
    category: 'address',
    regex: /\b\d{1,5}(?:\s+[A-Za-z][a-z]+){1,4}\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter|Parkway|Pkwy|Highway|Hwy)\b\.?(?:\s+(?:Apt|Unit|Suite|Ste)\s*[A-Za-z0-9-]+)?/g,
  },
  {
    category: 'address',
    regex: /\d{1,4}(?:省|市|区|县|路|街|巷|号)(?:[一-鿿]{1,12}(?:楼|室|栋))?/g,
  },
  {
    category: 'phone',
    regex: /\b\d{7,15}\b/g,
  },
]

export function readConfig(options: PluginOptions): Config {
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback
  return {
    wash: new Set<Category>(
      CATEGORY_SWITCHES
        .filter(([, option]) => bool(options[option], CONFIG_DEFAULTS[option]))
        .map(([category]) => category),
    ),
    doors: bool(options.scrubPrompt, false) ? 'scrub' : ALWAYS_WASH,
    quiet: bool(options.quiet, false),
  }
}

function isPersonOrigin(origin: SessionAppendOrigin): boolean {
  return PERSON_ORIGIN_KINDS.has(origin.kind)
}

export function compileRules(config: Config): Rules {
  const doors = config.doors
  const policy: DoorPolicy =
    doors === 'scrub'
      ? door => !NEVER_WASHED.has(door)
      : (door, origin) =>
          door === 'delivery' ? !isPersonOrigin(origin) : doors.has(door)
  return {
    doors: policy,
    patterns: PATTERN_LIBRARY.filter(pattern => config.wash.has(pattern.category)),
    quiet: config.quiet,
  }
}

function washText(text: string, patterns: readonly Pattern[], hits: RowHits): string {
  let out = text
  for (const pattern of patterns) {
    out = out.replace(pattern.regex, () => {
      hits[pattern.category] = (hits[pattern.category] ?? 0) + 1
      return `[redact:${pattern.category}]`
    })
  }
  return out
}

function washBlock(
  block: ApiContentBlock,
  patterns: readonly Pattern[],
  hits: RowHits,
): ApiContentBlock {
  if (block.type === 'text' && typeof block.text === 'string') {
    const text = washText(block.text, patterns, hits)
    return text === block.text ? block : { ...block, text }
  }
  if (block.type === 'tool_result' && typeof block.content === 'string') {
    const text = washText(block.content, patterns, hits)
    return text === block.content ? block : { ...block, content: text }
  }
  if (block.type === 'tool_result' && Array.isArray(block.content)) {
    const inner: readonly ApiContentBlock[] = block.content
    const content = washBlocks(inner, patterns, hits)
    return content.every((after, index) => after === inner[index]) ? block : { ...block, content }
  }
  return block
}

function washBlocks(
  blocks: readonly ApiContentBlock[],
  patterns: readonly Pattern[],
  hits: RowHits,
): ApiContentBlock[] {
  return blocks.map(block => washBlock(block, patterns, hits))
}

function hasHits(hits: RowHits): boolean {
  return CATEGORIES.some(category => (hits[category] ?? 0) > 0)
}

export function redactRow(
  door: SessionAppendDoor,
  origin: SessionAppendOrigin,
  message: SessionAppendMessage,
  rules: Rules,
): Washed {
  if (!rules.doors(door, origin)) return { message, hits: {} }
  const hits: RowHits = {}
  const content = washBlocks(message.content, rules.patterns, hits)
  if (!hasHits(hits)) return { message, hits }
  return { message: { ...message, content }, hits }
}

function addHits(prev: Hits | undefined, hits: RowHits): Hits {
  const next = { ...(prev ?? ZERO_HITS) }
  for (const category of CATEGORIES) next[category] += hits[category] ?? 0
  return next
}

function formatHits(hits: RowHits): string {
  return CATEGORIES.filter(category => (hits[category] ?? 0) > 0)
    .map(category => `${hits[category]} ${category}`)
    .join(', ')
}

function formatReport(hits: Hits): string {
  const total = CATEGORIES.reduce((sum, category) => sum + hits[category], 0)
  if (total === 0) return 'redact: nothing rewritten this session'
  const parts = CATEGORIES.map(category => `${hits[category]} ${category}`)
  return `redact: ${parts.join(', ')} (${total} total)`
}

export const register: Register = (on, options) => {
  const rules = compileRules(readConfig(options))
  let logged = false

  on('session.append', async ($, e, next) => {
    let washed: Washed
    try {
      washed = redactRow(e.door, e.origin, e.message, rules)
    } catch {
      if (!logged) {
        logged = true
        $.ui.log('redact: rewrite failed, rows pass unwashed')
      }
      return next(e)
    }
    if (!hasHits(washed.hits)) return next(e)
    await update($, HITS, prev => addHits(prev, washed.hits))
    if (!rules.quiet) $.ui.toast(`redact: ${formatHits(washed.hits)}`)
    return next({ ...e, message: washed.message })
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'redact',
      description: "Show this session's redaction counts",
    })
    return next(e)
  })

  on('command.run', { command: 'redact' }, async $ => ({
    text: formatReport(await read($, HITS)),
  }))
}
