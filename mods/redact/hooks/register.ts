// redact: rewrites sensitive data into `[redact:<category>]` placeholders on
// `session.append`, before a row is stored or sent to the model.
//
// Which rows are washed is the door policy (`washes`): tool output,
// attachments, notices and hook context always; the person's own typing
// (prompt, command, queue) only with scrubPrompt; deliveries unless a person
// sent them; the model's own words, notes and compactions never. What is found
// in a washed row is rules.ts's business.
//
// Placeholders are a mask, not the file: a model that read `[redact:email]`
// and writes it back would overwrite the real value. A system-prompt section
// says so, and a guard on Write and Edit refuses a write that would put more
// placeholders into a file than it already holds.
//
// `/redact` reports this session's counts; `/redact off` pauses washing and
// the guard for the session when a rule gets in the way, `/redact on` resumes.
import { atom, read, update } from 'claude-code'
import type {
  ApiContentBlock,
  PluginOptions,
  Register,
  SessionAppendDoor,
  SessionAppendMessage,
  SessionAppendOrigin,
} from 'claude-code'
import type { Hits } from '../types'
import { countPlaceholders, detectorsFor, washText } from './rules'
import type { Category, Detectors, RowHits } from './rules'

interface Config {
  categories: ReadonlySet<Category>
  scrubPrompt: boolean
  quiet: boolean
}

export interface Rules {
  detectors: Detectors
  scrubPrompt: boolean
  quiet: boolean
}

interface Washed {
  message: SessionAppendMessage
  hits: RowHits
}

const ZERO_HITS: Hits = { email: 0, ipv4: 0, ipv6: 0, credential: 0, address: 0, phone: 0 }
const CATEGORIES = Object.keys(ZERO_HITS) as Category[]

const CATEGORY_SWITCHES = [
  ['email', 'emails'],
  ['ipv4', 'ipAddresses'],
  ['ipv6', 'ipAddresses'],
  ['credential', 'credentials'],
  ['address', 'addresses'],
  ['phone', 'phoneNumbers'],
] as const satisfies readonly (readonly [Category, string])[]

// `satisfies Record<SessionAppendDoor, …>` makes a door the engine adds a
// type error here rather than a silent pass.
const DOOR_POLICY = {
  'tool-result': 'always',
  'tool-message': 'always',
  attachment: 'always',
  notice: 'always',
  'hook-context': 'always',
  delivery: 'unless-person',
  prompt: 'scrub',
  command: 'scrub',
  queue: 'scrub',
  response: 'never',
  note: 'never',
  compaction: 'never',
} as const satisfies Record<SessionAppendDoor, 'always' | 'unless-person' | 'scrub' | 'never'>

const PERSON_ORIGIN_KINDS: ReadonlySet<string> = new Set(['composer', 'bridge'])

const HITS = atom({ plugin: 'redact', key: 'hits' } as const, ZERO_HITS)
const PAUSED = atom({ plugin: 'redact', key: 'paused' } as const, false)

const PLACEHOLDER_NOTE = [
  'Some tool results and attachments in this session pass through the redact mod,',
  'which replaces sensitive values with placeholders such as `[redact:email]`,',
  '`[redact:credential]` or `[redact:phone]`. A placeholder stands for a real value',
  'that is still in the file or output; it is not the file content. Never write a',
  'placeholder into a file and never use one inside an Edit `old_string`: edit',
  'around it, and ask the person when the real value is needed.',
].join(' ')

export function readConfig(options: PluginOptions): Config {
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback
  return {
    categories: new Set<Category>(
      CATEGORY_SWITCHES.filter(([, option]) => bool(options[option], true)).map(([category]) => category),
    ),
    scrubPrompt: bool(options.scrubPrompt, false),
    quiet: bool(options.quiet, false),
  }
}

export function compileRules(config: Config): Rules {
  return {
    detectors: detectorsFor(config.categories),
    scrubPrompt: config.scrubPrompt,
    quiet: config.quiet,
  }
}

export function washes(door: SessionAppendDoor, origin: SessionAppendOrigin, rules: Rules): boolean {
  // An unknown door fails toward washing.
  const policy = (DOOR_POLICY as Record<string, string>)[door] ?? 'always'
  if (policy === 'always') return true
  if (policy === 'never') return false
  if (policy === 'scrub') return rules.scrubPrompt
  return rules.scrubPrompt || !PERSON_ORIGIN_KINDS.has(origin.kind)
}

function washBlock(block: ApiContentBlock, detectors: Detectors, hits: RowHits): ApiContentBlock {
  if (block.type === 'text' && typeof block.text === 'string') {
    const text = washText(block.text, detectors, hits)
    return text === block.text ? block : { ...block, text }
  }
  if (block.type === 'tool_result' && typeof block.content === 'string') {
    const content = washText(block.content, detectors, hits)
    return content === block.content ? block : { ...block, content }
  }
  if (block.type === 'tool_result' && Array.isArray(block.content)) {
    const inner: readonly ApiContentBlock[] = block.content
    const content = inner.map(b => washBlock(b, detectors, hits))
    return content.every((after, i) => after === inner[i]) ? block : { ...block, content }
  }
  return block
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
  if (!washes(door, origin, rules)) return { message, hits: {} }
  const hits: RowHits = {}
  const content = message.content.map(block => washBlock(block, rules.detectors, hits))
  if (!hasHits(hits)) return { message, hits }
  return { message: { ...message, content }, hits }
}

function addHits(prev: Hits | undefined, hits: RowHits): Hits {
  const next = { ...ZERO_HITS, ...prev }
  for (const category of CATEGORIES) next[category] += hits[category] ?? 0
  return next
}

function formatHits(hits: RowHits): string {
  return CATEGORIES.filter(category => (hits[category] ?? 0) > 0)
    .map(category => `${hits[category]} ${category}`)
    .join(', ')
}

function formatReport(hits: Hits, paused: boolean): string {
  const total = CATEGORIES.reduce((sum, category) => sum + (hits[category] ?? 0), 0)
  const state = paused ? ' (paused — /redact on resumes)' : ''
  if (total === 0) return `redact: nothing rewritten this session${state}`
  const parts = CATEGORIES.map(category => `${hits[category] ?? 0} ${category}`)
  return `redact: ${parts.join(', ')} (${total} total)${state}`
}

const GUARD_DENY =
  'redact: this write would put a [redact:…] placeholder into the file, overwriting the real value it masks. ' +
  'Leave the placeholder text out and edit around it. If the literal placeholder is really wanted, the person can run /redact off.'

export const register: Register = (on, options) => {
  const rules = compileRules(readConfig(options))
  let logged = false

  on('session.append', async ($, e, next) => {
    if (await read($, PAUSED)) return next(e)
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

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      sections: [...composed.sections, { id: 'redact:placeholders', text: PLACEHOLDER_NOTE, scope: 'session' }],
    }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (await read($, PAUSED)) return next(e)
    return countPlaceholders(e.new_string) > countPlaceholders(e.old_string) ? { deny: GUARD_DENY } : next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (await read($, PAUSED)) return next(e)
    const writing = countPlaceholders(e.content)
    if (writing === 0) return next(e)
    const existing = (await $.fs.exists(e.file_path)) ? countPlaceholders(await $.fs.read(e.file_path)) : 0
    return writing > existing ? { deny: GUARD_DENY } : next(e)
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'redact',
      description: "Show this session's redaction counts; `/redact off` pauses, `/redact on` resumes",
    })
    return next(e)
  })

  on('command.run', { command: 'redact' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'off' || arg === 'pause') {
      await update($, PAUSED, () => true)
      return { text: 'redact: paused for this session. Rows pass unwashed until /redact on.' }
    }
    if (arg === 'on' || arg === 'resume') {
      await update($, PAUSED, () => false)
      return { text: 'redact: washing again.' }
    }
    if (arg !== '') return { text: 'redact: usage — /redact, /redact off, /redact on' }
    return { text: formatReport(await read($, HITS), await read($, PAUSED)) }
  })
}
