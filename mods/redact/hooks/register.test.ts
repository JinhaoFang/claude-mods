// The wiring: which rows are washed (the door policy), the rows the session
// stores through the real `session.append` chain, the write guard on Edit and
// Write, the system-prompt note, and /redact with its off and on switch.
import { expect, mock, test } from 'claude-code/testing'
import type {
  CommandRunInput,
  CommandRunResult,
  On,
  SessionAppendDoor,
  SessionAppendMessage,
  SessionAppendOrigin,
} from 'claude-code'
import { compileRules, readConfig, redactRow, washes } from './register'

const DEFAULT_RULES = compileRules(readConfig({}))
const SCRUB_RULES = compileRules(readConfig({ scrubPrompt: true }))
const TOOL_ORIGIN: SessionAppendOrigin = { kind: 'tool', tool: 'Bash' }
const SECRET = 'mail alice@acme.io'
const WASHED = 'mail [redact:email]'

function rowOf(text: string): SessionAppendMessage {
  return { type: 'user', content: [{ type: 'text', text }] }
}

function textOf(message: SessionAppendMessage): string {
  const block = message.content[0]
  return block && block.type === 'text' && typeof block.text === 'string' ? block.text : ''
}

// The test's `$.command.run` takes the whole input a session stamps.
function redact($: { command: { run: (input: CommandRunInput) => Promise<CommandRunResult> } }, args: string) {
  return $.command.run({
    command: 'redact',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
}

function stubFiles(on: On, files: Record<string, string>) {
  on('fs.exists', (_$, e) => ({ value: e.path in files }))
  on('fs.read', (_$, e) => ({ value: files[e.path] ?? '' }))
}

test('readConfig turns every category on by default and reads garbage as the default', () => {
  const defaults = readConfig({})
  expect([...defaults.categories]).toEqual(['email', 'ipv4', 'ipv6', 'credential', 'address', 'phone'])
  expect(defaults.scrubPrompt).toBe(false)
  expect(defaults.quiet).toBe(false)

  const garbage = readConfig({ emails: 'yes', phoneNumbers: false, quiet: 'no' } as never)
  expect(garbage.categories.has('email')).toBe(true)
  expect(garbage.categories.has('phone')).toBe(false)
  expect(garbage.quiet).toBe(false)
})

test('the door policy washes tool output always and the person only with scrubPrompt', () => {
  const always: SessionAppendDoor[] = ['tool-result', 'tool-message', 'attachment', 'notice', 'hook-context']
  const typed: SessionAppendDoor[] = ['prompt', 'command', 'queue']
  const never: SessionAppendDoor[] = ['response', 'note', 'compaction']
  for (const door of always) expect(washes(door, TOOL_ORIGIN, DEFAULT_RULES)).toBe(true)
  for (const door of typed) {
    expect(washes(door, { kind: 'composer' }, DEFAULT_RULES)).toBe(false)
    expect(washes(door, { kind: 'composer' }, SCRUB_RULES)).toBe(true)
  }
  for (const door of never) expect(washes(door, TOOL_ORIGIN, SCRUB_RULES)).toBe(false)
})

test('a delivery is washed unless a person sent it', () => {
  expect(washes('delivery', { kind: 'composer' }, DEFAULT_RULES)).toBe(false)
  expect(washes('delivery', { kind: 'bridge' }, DEFAULT_RULES)).toBe(false)
  expect(washes('delivery', { kind: 'plugin', name: 'x' } as SessionAppendOrigin, DEFAULT_RULES)).toBe(true)
  expect(washes('delivery', { kind: 'composer' }, SCRUB_RULES)).toBe(true)
})

test('a tool_result row is rewritten in both content forms, its id kept', () => {
  const asString: SessionAppendMessage = {
    type: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'tu1', content: SECRET }],
  }
  const washed = redactRow('tool-result', TOOL_ORIGIN, asString, DEFAULT_RULES).message.content[0]
  expect(washed).toEqual({ type: 'tool_result', tool_use_id: 'tu1', content: WASHED })

  const asBlocks: SessionAppendMessage = {
    type: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'tu2', content: [{ type: 'text', text: SECRET }] }],
  }
  const nested = redactRow('tool-result', TOOL_ORIGIN, asBlocks, DEFAULT_RULES).message.content[0]
  expect(nested).toEqual({ type: 'tool_result', tool_use_id: 'tu2', content: [{ type: 'text', text: WASHED }] })
})

test('a row with nothing to rewrite is passed on as the same object', () => {
  const row = rowOf('cite 10.1371/journal.pone.0123456')
  expect(redactRow('tool-result', TOOL_ORIGIN, row, DEFAULT_RULES).message).toBe(row)
})

test('a row appended through the session is stored washed', async ($, on) => {
  const session = mock.session(on)
  await $.session.append({ message: rowOf(SECRET), door: 'tool-result', origin: TOOL_ORIGIN, uuid: 'u1' })
  const stored = session.appended().at(-1)
  expect(stored && textOf(stored.message)).toBe(WASHED)
})

test('/redact reports the counts, /redact off pauses and /redact on resumes', async ($, on) => {
  const session = mock.session(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => (toasts.push(String(e.text)), { value: undefined }) as never)
  await $.session.append({ message: rowOf(SECRET), door: 'tool-result', origin: TOOL_ORIGIN, uuid: 'u1' })
  expect(toasts).toEqual(['redact: 1 email'])
  expect((await redact($, '')).text).toContain('1 email')

  await redact($, 'off')
  await $.session.append({ message: rowOf(SECRET), door: 'tool-result', origin: TOOL_ORIGIN, uuid: 'u2' })
  const paused = session.appended().at(-1)
  expect(paused && textOf(paused.message)).toBe(SECRET)
  expect((await redact($, '')).text).toContain('paused')

  await redact($, 'on')
  await $.session.append({ message: rowOf(SECRET), door: 'tool-result', origin: TOOL_ORIGIN, uuid: 'u3' })
  const resumed = session.appended().at(-1)
  expect(resumed && textOf(resumed.message)).toBe(WASHED)
})

test('the system prompt gains a note on placeholders', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  const { sections } = await $.prompt.compose({
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['terminal'],
    tools: ['Edit', 'Write'],
    outputStyle: null,
    traits: [],
  })
  expect(sections[0]?.id).toBe('intro')
  const note = sections.find(s => s.id === 'redact:placeholders')
  expect(note?.text).toContain('[redact:email]')
  expect(note?.scope).toBe('session')
})

test('an Edit that adds a placeholder is refused; one that keeps the count passes', async ($, on) => {
  on('tool.call', { tool: 'Edit' }, () => ({ result: { ok: true } }) as never)

  const adding = await $.tool.call({
    tool: 'Edit',
    file_path: '/w/a.env',
    old_string: 'EMAIL=',
    new_string: 'EMAIL=[redact:email]',
  })
  expect('deny' in adding && adding.deny).toContain('placeholder')

  const keeping = await $.tool.call({
    tool: 'Edit',
    file_path: '/w/a.md',
    old_string: 'see [redact:email]',
    new_string: 'write to [redact:email]',
  })
  expect('deny' in keeping).toBe(false)
})

test('a Write is refused only when it holds more placeholders than the file', async ($, on) => {
  stubFiles(on, { '/w/doc.md': 'placeholders look like [redact:phone]' })
  on('tool.call', { tool: 'Write' }, () => ({ result: { ok: true } }) as never)

  const overwrite = await $.tool.call({ tool: 'Write', file_path: '/w/config.yml', content: 'mail: [redact:email]' })
  expect('deny' in overwrite).toBe(true)

  const same = await $.tool.call({ tool: 'Write', file_path: '/w/doc.md', content: 'now: [redact:phone]' })
  expect('deny' in same).toBe(false)

  const plain = await $.tool.call({ tool: 'Write', file_path: '/w/new.txt', content: 'hello' })
  expect('deny' in plain).toBe(false)
})

test('/redact off lets a placeholder write through', async ($, on) => {
  on('tool.call', { tool: 'Edit' }, () => ({ result: { ok: true } }) as never)
  await redact($, 'off')
  const written = await $.tool.call({
    tool: 'Edit',
    file_path: '/w/README.md',
    old_string: 'e.g.',
    new_string: 'e.g. [redact:email]',
  })
  expect('deny' in written).toBe(false)
})
