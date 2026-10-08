// redact 的测试，按可观察行为分层。
// 纯矩阵直接驱动 redactRow：每个类别一例（PEM 多行私钥块、JWT、已知前缀、带标签
// 赋值、.env 行、email、ipv4、ipv6 及时钟戳不误报、街道与中国格式地址）、doors 矩阵、
// delivery×origin（本人仅 composer/bridge，未知类别向保护侧失败）、scrubPrompt 开关、
// 洗两遍幂等、逐类别命中计数、tool_result 形态行（字符串与块两种 content，钉死
// tool_use_id）、readConfig 对缺失与非法选项的归一。
// 真实分派能走通的是 /redact：command.run 经真实钩子链读取会话状态并回报。
// 本构建 claude plugin test 的 harness 无法把任何改写送进 session.append，以下为实测
// 结论（探针核实后按设计文档的降级条款处理，不为测试伪造门）：
// 1) $.session.append 无法完成——测试侧 beneath 钩子 next(e) 落到 kit 底部抛
//    HooksError "no implementation for session.append"；直接返回应答则被引擎按
//    "returned an answer without next" 跳过；两种形态均无存储发生。
// 2) $.tool.call 可以运行、应答形状 { result: { stdout, stderr } } 有效，但其结果行
//    不经 session.append 分派（beneath 钩子观测 0 次追加），tool-result 门、命中
//    toast 与 quiet 抑制因此不可观察。
// 3) 测试 $ 上无 $.session.messages，状态原子也无法从测试侧写入。
// 故改写经真实分派的存储与 toast/quiet 臂由 tier-1 的 tool_result 形态断言覆盖改写
// 本身，状态写与 toast 调用由 validate 的静态调用清单覆盖（calls: $.ui.toast、
// state writes: redact.hits）。
import { expect, test } from 'claude-code/testing'
import type {
  SessionAppendDoor,
  SessionAppendMessage,
  SessionAppendOrigin,
} from 'claude-code'
import { compileRules, readConfig, redactRow } from './register'

type Rules = ReturnType<typeof compileRules>

const DEFAULT_RULES = compileRules(readConfig({}))
const SCRUB_RULES = compileRules(readConfig({ scrubPrompt: true }))

const TOOL_ORIGIN: SessionAppendOrigin = { kind: 'tool', tool: 'Bash' }
const PLANTED_KEY = 'ghp_0123456789abcdefghijklmnopqrstuv'

function rowOf(text: string): SessionAppendMessage {
  return { type: 'user', content: [{ type: 'text', text }] }
}

function textOf(message: SessionAppendMessage): string {
  const block = message.content[0]
  return block && block.type === 'text' && typeof block.text === 'string' ? block.text : ''
}

function wash(
  input: string,
  door: SessionAppendDoor = 'tool-result',
  origin: SessionAppendOrigin = TOOL_ORIGIN,
  rules: Rules = DEFAULT_RULES,
): string {
  return textOf(redactRow(door, origin, rowOf(input), rules).message)
}

test('readConfig normalizes absent and garbage options to the manifest defaults', () => {
  const defaults = readConfig({})
  expect([...defaults.wash]).toEqual(['email', 'ipv4', 'ipv6', 'credential', 'address'])
  expect(defaults.doors).not.toBe('scrub')
  expect(defaults.quiet).toBe(false)

  const garbage = readConfig({ emails: 'yes', quiet: 'no' } as never)
  expect(garbage.wash.has('email')).toBe(true)
  expect(garbage.quiet).toBe(false)

  expect(compileRules(readConfig({ quiet: true })).quiet).toBe(true)
})

test('an email is rewritten', () => {
  expect(wash('mail bob@corp.io now')).toBe('mail [redact:email] now')
})

test('an ipv4 address is rewritten', () => {
  expect(wash('host at 10.0.0.7 up')).toBe('host at [redact:ipv4] up')
})

test('an ipv6 address is rewritten and clock stamps are not', () => {
  expect(wash('at 2001:db8::1 ok')).toBe('at [redact:ipv6] ok')
  expect(wash('at 12:34:56 ok')).toBe('at 12:34:56 ok')
  expect(wash('at 12:34:56.789 ok')).toBe('at 12:34:56.789 ok')
})

test('a known key prefix is rewritten', () => {
  expect(wash('key AKIAIOSFODNN7EXAMPLE end')).toBe('key [redact:credential] end')
})

test('a jwt is rewritten', () => {
  expect(
    wash(
      'auth eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c next',
    ),
  ).toBe('auth [redact:credential] next')
})

test('a labeled assignment is rewritten', () => {
  expect(wash('password=correct-horse-battery-staple ok')).toBe('[redact:credential] ok')
})

test('an env-style line is rewritten and a plain setting is not', () => {
  expect(wash('DATABASE_PASSWORD=supersecretvalue99\nLOGLEVEL=info')).toBe(
    '[redact:credential]\nLOGLEVEL=info',
  )
})

test('a private key block spanning lines is rewritten whole', () => {
  expect(
    wash(
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA bob@corp.io\n-----END RSA PRIVATE KEY-----\nafter bob@corp.io',
    ),
  ).toBe('[redact:credential]\nafter [redact:email]')
})

test('a street address is rewritten', () => {
  expect(wash('office: 350 Fifth Avenue, NYC')).toBe('office: [redact:address], NYC')
})

test('a chinese address is rewritten', () => {
  expect(wash('寄到北京市海淀区中关村大街27号')).toBe('寄到北京市海淀区中关村大街[redact:address]')
})

test('a row counts its hits per category', () => {
  const washed = redactRow(
    'tool-result',
    TOOL_ORIGIN,
    rowOf('mail a@b.io key AKIAIOSFODNN7EXAMPLE'),
    DEFAULT_RULES,
  )
  expect(washed.hits).toEqual({ email: 1, credential: 1 })
})

test('washing a washed row changes nothing', () => {
  const input = `TOKEN=${PLANTED_KEY}\nip 10.0.0.7\nmail a@b.io\nMY_API_KEY=abc123def456ghi789`
  const once = redactRow('tool-result', TOOL_ORIGIN, rowOf(input), DEFAULT_RULES)
  const twice = redactRow('tool-result', TOOL_ORIGIN, once.message, DEFAULT_RULES)
  expect(twice.hits).toEqual({})
  expect(twice.message).toBe(once.message)
})

test('doors gate the rewrite', () => {
  const byDoor = (door: SessionAppendDoor) => wash('key AKIAIOSFODNN7EXAMPLE', door)
  expect(byDoor('tool-result')).toBe('key [redact:credential]')
  expect(byDoor('tool-message')).toBe('key [redact:credential]')
  expect(byDoor('attachment')).toBe('key [redact:credential]')
  expect(byDoor('notice')).toBe('key [redact:credential]')
  expect(byDoor('hook-context')).toBe('key [redact:credential]')
  expect(byDoor('response')).toBe('key AKIAIOSFODNN7EXAMPLE')
  expect(byDoor('note')).toBe('key AKIAIOSFODNN7EXAMPLE')
  expect(byDoor('compaction')).toBe('key AKIAIOSFODNN7EXAMPLE')
  expect(byDoor('prompt')).toBe('key AKIAIOSFODNN7EXAMPLE')
  expect(byDoor('command')).toBe('key AKIAIOSFODNN7EXAMPLE')
})

test('delivery washes unless the origin names the person', () => {
  const byOrigin = (origin: SessionAppendOrigin) => wash('key AKIAIOSFODNN7EXAMPLE', 'delivery', origin)
  expect(byOrigin({ kind: 'composer' })).toBe('key AKIAIOSFODNN7EXAMPLE')
  expect(byOrigin({ kind: 'bridge' })).toBe('key AKIAIOSFODNN7EXAMPLE')
  expect(byOrigin({ kind: 'sdk' })).toBe('key [redact:credential]')
  expect(byOrigin({ kind: 'unclassified' })).toBe('key [redact:credential]')
  expect(byOrigin({ kind: 'tool', tool: 'Bash' })).toBe('key [redact:credential]')
  expect(byOrigin({ kind: 'model', model: 'test-model' })).toBe('key [redact:credential]')
})

test('scrubPrompt adds the typed rows and nothing else', () => {
  const input = 'key AKIAIOSFODNN7EXAMPLE'
  const byDoor = (door: SessionAppendDoor, rules: Rules) =>
    textOf(redactRow(door, { kind: 'composer' }, rowOf(input), rules).message)
  expect(byDoor('prompt', DEFAULT_RULES)).toBe(input)
  expect(byDoor('command', DEFAULT_RULES)).toBe(input)
  expect(byDoor('prompt', SCRUB_RULES)).toBe('key [redact:credential]')
  expect(byDoor('command', SCRUB_RULES)).toBe('key [redact:credential]')
  expect(byDoor('delivery', SCRUB_RULES)).toBe('key [redact:credential]')
  expect(byDoor('note', SCRUB_RULES)).toBe(input)
  expect(byDoor('response', SCRUB_RULES)).toBe(input)
  expect(byDoor('compaction', SCRUB_RULES)).toBe(input)
})

test('a tool_result row washes string and block content, pinning tool_use_id', () => {
  const message: SessionAppendMessage = {
    type: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 't1',
        content: `TOKEN=${PLANTED_KEY}`,
      },
      {
        type: 'tool_result',
        tool_use_id: 't2',
        content: [{ type: 'text', text: 'mail a@b.io' }],
      },
    ],
  }
  const washed = redactRow('tool-result', TOOL_ORIGIN, message, DEFAULT_RULES)
  expect(washed.hits).toEqual({ credential: 1, email: 1 })
  expect(washed.message.content[0]).toMatchObject({
    tool_use_id: 't1',
    content: 'TOKEN=[redact:credential]',
  })
  expect(washed.message.content[1]).toMatchObject({
    tool_use_id: 't2',
    content: [{ type: 'text', text: 'mail [redact:email]' }],
  })
})

test('/redact reports zeros before anything is washed', async $ => {
  const { text } = await $.command.run({
    command: 'redact',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(text).toBe('redact: nothing rewritten this session')
})
