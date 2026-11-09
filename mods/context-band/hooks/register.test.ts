import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type {
  AgentInfo,
  On,
  SessionContextBreakdown,
  SessionCost,
  SessionRateLimit,
  SessionUsage,
  TurnStepInput,
} from 'claude-code'

const BAND = {
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
}

const FIXED_NOW = 1_760_000_000_000
const minutesFromNow = (m: number) => new Date(FIXED_NOW + m * 60_000).toISOString()

function usageOf(opts: {
  percent: number
  tokens: number
  window?: number
  rateLimits?: SessionRateLimit[]
  cost?: SessionCost
  breakdown?: SessionContextBreakdown
}): SessionUsage {
  return {
    startedAt: 0,
    context: {
      tokens: opts.tokens,
      window: opts.window ?? 200_000,
      percent: opts.percent,
      ...(opts.breakdown ? { breakdown: opts.breakdown } : {}),
    },
    rateLimits: opts.rateLimits ?? [],
    ...(opts.cost !== undefined ? { cost: opts.cost } : {}),
  }
}

function plan(kind: string, percentUsed: number, resetsAt?: string): SessionRateLimit {
  return { kind, percentUsed, ...(resetsAt ? { resetsAt } : {}) }
}

const SUBSCRIPTION = [
  plan('five_hour', 23.5, minutesFromNow(133)),
  plan('seven_day', 8, minutesFromNow(5 * 24 * 60)),
]

function stubEnvironment(on: On, model = 'Opus 4.6', cwd = '/root/project/claude-mods', agents: AgentInfo[] = []) {
  mock.clock(on, { now: FIXED_NOW })
  on('session.model', () => ({ value: model }))
  on('session.cwd', () => ({ value: cwd }))
  on('agent.list', () => ({ value: agents }))
}

function agentOf(opts: { id: string; type: string; status?: 'running' | 'idle'; name?: string }): AgentInfo {
  return {
    id: opts.id,
    description: '',
    type: opts.type,
    status: opts.status ?? 'idle',
    ...(opts.name ? { name: opts.name } : {}),
  }
}

function stubSteps(on: On, tokensFor: (e: TurnStepInput) => number = () => 32_000) {
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        input_tokens: tokensFor(e),
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        model: e.model,
      },
    } as const
  })
}

async function runStep(
  $: { turn: { step: (input: TurnStepInput) => AsyncIterable<unknown> } },
  input: Partial<TurnStepInput>,
): Promise<void> {
  for await (const _chunk of $.turn.step({ turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, ...input })) {
  }
}

function breakdownOf(percentage: number, rawMaxTokens: number): SessionContextBreakdown {
  return {
    categories: [],
    totalTokens: Math.round((percentage / 100) * rawMaxTokens),
    maxTokens: rawMaxTokens,
    rawMaxTokens,
    autocompactSource: 'auto',
    percentage,
    gridRows: [],
    model: 'test-model',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    isAutoCompactEnabled: true,
    apiUsage: null,
  }
}

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown }

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!node || typeof node !== 'object') return ''
  return textOf((node as Drawn).children)
}

// The column's two rows, each as the text it draws.
async function rowsOf(ui: { find: (q: { type: string }) => Promise<unknown> }): Promise<string[]> {
  const column = (await ui.find({ type: 'Box' })) as Drawn | undefined
  const rows = ((column?.children ?? []) as Drawn[]).filter(child => child?.type === 'Box')
  return rows.map(textOf)
}

function mountBand(
  $: Engine,
  props: Partial<typeof BAND.props> = {},
  surface: 'terminal' | 'desktop' = 'terminal',
) {
  return $.ui.mount({ plugin: 'context-band', surface, ...BAND, props: { ...BAND.props, ...props } })
}

// ---------------------------------------------------------------- layout

test('the band draws the environment row above the readings row, with no buttons', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({ value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.42 } }) }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, {}, surface)
    const [env, readings] = await rowsOf(ui)
    expect(env).toContain('Opus 4.6')
    expect(env).toContain('/root/project/claude-mods')
    expect(readings).toContain('Context ')
    expect(readings).toContain('34.2%')
    expect(readings).toContain('of 200.0k')
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the band yields when a survey holds it', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({ value: usageOf({ percent: 34.2, tokens: 68_400 }) }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', children: ['the engine band'] }))

  const ui = await mountBand($, { hasSurvey: true })
  expect(await ui.find({ text: /34\.2%/ })).toBeUndefined()
  expect(await ui.find({ text: /the engine band/ })).toBeDefined()
  await ui.unmount()
})

test('the working dot follows the main conversation working flag', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  const busy = await mountBand($, { isWorking: true })
  expect((await rowsOf(busy))[0]).toContain('●')
  await busy.unmount()

  const idle = await mountBand($)
  expect((await rowsOf(idle))[0]).toContain('○')
  await idle.unmount()
})

test('the directory shows dim and shortens to the last two segments, then the last one', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  const wide = await mountBand($, { bodyColumns: 80 })
  const path = await wide.find({ type: 'Text', text: /^\/home\/jh\/work\/client-portal$/ })
  expect(path?.props.dimColor).toBe(true)
  await wide.unmount()

  const medium = await mountBand($, { bodyColumns: 34 })
  expect((await rowsOf(medium))[0]).toMatch(/ work\/client-portal$/)
  await medium.unmount()

  const narrow = await mountBand($, { bodyColumns: 20 })
  expect((await rowsOf(narrow))[0]).toMatch(/ client-portal$/)
  await narrow.unmount()
})

// ---------------------------------------------------------------- effort

test('the effort level shows bare beside the model after a main-loop step', async ($, on) => {
  stubEnvironment(on)
  stubSteps(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  const before = await mountBand($)
  expect((await rowsOf(before))[0]).toMatch(/^Opus 4\.6 ○ /)
  await before.unmount()

  await runStep($, { effort: 'xhigh' })
  const after = await mountBand($)
  const [env] = await rowsOf(after)
  expect(env).toMatch(/^Opus 4\.6 · xhigh ○ /)
  expect(env).not.toContain('effort')
  expect(env).not.toMatch(/[█░]/)
  await after.unmount()
})

test('the effort follows the latest main-loop step and drops when it carries none', async ($, on) => {
  stubEnvironment(on)
  stubSteps(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  const ui = await mountBand($)
  await runStep($, { effort: 'low' })
  expect((await rowsOf(ui))[0]).toMatch(/^Opus 4\.6 · low /)
  await runStep($, { effort: 'max', index: 1 })
  expect((await rowsOf(ui))[0]).toMatch(/^Opus 4\.6 · max /)
  await runStep($, { index: 2 })
  expect((await rowsOf(ui))[0]).toMatch(/^Opus 4\.6 ○ /)
  await ui.unmount()
})

test('a numeric effort is shown as its number', async ($, on) => {
  stubEnvironment(on)
  stubSteps(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  await runStep($, { effort: 16_000 })
  const ui = await mountBand($)
  expect((await rowsOf(ui))[0]).toMatch(/^Opus 4\.6 · 16000 /)
  await ui.unmount()
})

// ---------------------------------------------------------------- quota

test('each plan window is labelled and carries its own reset time right after it', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, rateLimits: SUBSCRIPTION, cost: { usd: 0.42 } }),
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, {}, surface)
    const [, readings] = await rowsOf(ui)
    expect(readings).toBe(
      'Context ████░░░░░░░░ 34.2% of 200.0k │ 5h █░░░░░ 23.5% 2h13m │ 7d █░░░░░ 8% 5d0h',
    )
    await ui.unmount()
  }
})

test('context, 5h and 7d each keep a hue of their own', async ($, on) => {
  stubEnvironment(on)
  const limits = [plan('five_hour', 23.5, minutesFromNow(133)), plan('seven_day', 50, minutesFromNow(600))]
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000, rateLimits: limits }) }))

  const ui = await mountBand($)
  const colorOf = async (text: RegExp) => (await ui.find({ type: 'Text', text }))?.props.color
  const context = await colorOf(/^10\.0%$/)
  const fiveHour = [await colorOf(/^5h $/), await colorOf(/^█░░░░░ $/), await colorOf(/^23\.5%$/)]
  const sevenDay = [await colorOf(/^7d $/), await colorOf(/^███░░░ $/), await colorOf(/^50%$/)]
  expect(context).toBe('success')
  expect(fiveHour).toEqual(['ide', 'ide', 'ide'])
  expect(sevenDay).toEqual(['autoAccept', 'autoAccept', 'autoAccept'])
  await ui.unmount()
})

test('past the thresholds only the percentage turns; label and bar keep the window hue', async ($, on) => {
  stubEnvironment(on)
  const limits = [plan('five_hour', 65, minutesFromNow(60)), plan('seven_day', 90, minutesFromNow(600))]
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000, rateLimits: limits }) }))

  const hot = await mountBand($)
  expect((await hot.find({ type: 'Text', text: /^65%$/ }))?.props.color).toBe('warning')
  expect((await hot.find({ type: 'Text', text: /^90%$/ }))?.props.color).toBe('error')
  expect((await hot.find({ type: 'Text', text: /^5h $/ }))?.props.color).toBe('ide')
  expect((await hot.find({ type: 'Text', text: /^█████░ $/ }))?.props.color).toBe('autoAccept')
  await hot.unmount()
})

test('the band draws no arrow glyph that could overprint its neighbour', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000, rateLimits: SUBSCRIPTION }) }))

  for (const bodyColumns of [160, 80, 50]) {
    const ui = await mountBand($, { bodyColumns })
    expect((await rowsOf(ui)).join('\n')).not.toMatch(/[\u2190-\u21FF\u27F0-\u27FF\u2B00-\u2BFF]/)
    await ui.unmount()
  }
})

test('a reading above zero fills at least one cell; zero fills none', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 0, tokens: 0, rateLimits: [plan('five_hour', 0), plan('seven_day', 1)] }),
  }))

  const ui = await mountBand($)
  expect((await rowsOf(ui))[1]).toBe('Context ░░░░░░░░░░░░ 0.0% of 200.0k │ 5h ░░░░░░ 0% │ 7d █░░░░░ 1%')
  await ui.unmount()
})

test('a window without a reset time draws no countdown', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, rateLimits: [plan('five_hour', 12), plan('seven_day', 3, minutesFromNow(90))] }),
  }))

  const ui = await mountBand($)
  expect((await rowsOf(ui))[1]).toMatch(/5h [█░]+ 12% │ 7d [█░]+ 3% 1h30m$/)
  await ui.unmount()
})

test('an API-key session shows the session cost; a gateway limit is appended', async ($, on) => {
  stubEnvironment(on)
  let limits: SessionRateLimit[] = []
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000, rateLimits: limits, cost: { usd: 1.5 } }) }))

  const plain = await mountBand($)
  expect((await rowsOf(plain))[1]).toMatch(/│ \$1\.50$/)
  await plain.unmount()

  limits = [plan('spend_limit', 42)]
  const gated = await mountBand($)
  expect((await rowsOf(gated))[1]).toMatch(/│ \$1\.50 │ limit [█░]+ 42%$/)
  await gated.unmount()
})

// ---------------------------------------------------------------- width

test('at eighty columns both rows fit whole, the bars shrinking first', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  stubSteps(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, rateLimits: SUBSCRIPTION }),
  }))
  await runStep($, { effort: 'high' })

  const ui = await mountBand($, { bodyColumns: 80 })
  const [env, readings] = await rowsOf(ui)
  expect(env!.length).toBeLessThanOrEqual(80)
  expect(readings!.length).toBeLessThanOrEqual(80)
  expect(readings).toContain('of 200.0k')
  expect(readings).toContain('23.5% 2h13m')
  expect(readings).toContain('8% 5d0h')
  await ui.unmount()
})

test('a narrow terminal drops the window size and the bars but keeps every number', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, rateLimits: SUBSCRIPTION }),
  }))

  const ui = await mountBand($, { bodyColumns: 50 })
  const [, readings] = await rowsOf(ui)
  expect(readings!.length).toBeLessThanOrEqual(50)
  expect(readings).toBe('Context 34.2% │ 5h 23.5% 2h13m │ 7d 8% 5d0h')
  await ui.unmount()
})

// ---------------------------------------------------------------- readings

test('with a breakdown the percent measures the compaction window', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, breakdown: breakdownOf(44.4, 160_000) }),
  }))

  const ui = await mountBand($)
  const [, readings] = await rowsOf(ui)
  expect(readings).toContain('44.4% of 160.0k')
  expect(readings).not.toContain('34.2%')
  await ui.unmount()
})

test('a session.measure redraws the band without a remount', async ($, on) => {
  stubEnvironment(on)
  let usage = usageOf({ percent: 10, tokens: 20_000 })
  on('session.usage', () => ({ value: usage }))
  on('session.measure', ($, e) => ({ changed: e.changed }))

  const ui = await mountBand($)
  expect(await ui.find({ text: /10\.0%/ })).toBeDefined()

  usage = usageOf({ percent: 50, tokens: 100_000 })
  await $.session.measure({ context: usage.context, rateLimits: [], changed: ['context'] })
  expect(await ui.find({ text: /50\.0%/ })).toBeDefined()
  await ui.unmount()
})

test('the context gauge is green, then warning, then error', async ($, on) => {
  stubEnvironment(on)
  let percent = 30
  on('session.usage', () => ({ value: usageOf({ percent, tokens: 1 }) }))

  for (const [p, color] of [[30, 'success'], [70, 'warning'], [90, 'error']] as const) {
    percent = p
    const ui = await mountBand($)
    expect((await ui.find({ type: 'Text', text: new RegExp(`^${p}\\.0%$`) }))?.props.color).toBe(color)
    await ui.unmount()
  }
})

test('the thresholds come from the options', { options: { warningThreshold: 20, errorThreshold: 50 } }, async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({ value: usageOf({ percent: 30, tokens: 1, rateLimits: [plan('five_hour', 55)] }) }))

  const ui = await mountBand($)
  expect((await ui.find({ type: 'Text', text: /^30\.0%$/ }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /55%$/ }))?.props.color).toBe('error')
  await ui.unmount()
})

// ----------------------------------------------------------- agent views

test('an agent view shows the viewed loop: label, model, effort and fill', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [
    agentOf({ id: 'a1', type: 'Explore', name: 'scout', status: 'running' }),
  ])
  stubSteps(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000, rateLimits: SUBSCRIPTION }) }))

  await runStep($, { model: 'claude-haiku-5-5', effort: 'low', agentId: 'a1' })
  const ui = await mountBand($, { view: { agentId: 'a1' } })
  const [env, readings] = await rowsOf(ui)
  expect(env).toMatch(/^scout claude-haiku-5-5 · low ● /)
  expect(readings).toContain('16.0% of 200.0k')
  expect(readings).toContain('5h ')
  expect(readings).toContain('23.5% 2h13m')
  expect(readings).not.toContain('10.0%')
  await ui.unmount()
})

test('an agent view redraws as its loop takes further steps', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  stubSteps(on, e => (e.index === 0 ? 32_000 : 64_000))
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  await runStep($, { agentId: 'a1' })
  const ui = await mountBand($, { view: { agentId: 'a1' } })
  expect(await ui.find({ text: /16\.0%/ })).toBeDefined()
  await runStep($, { agentId: 'a1', index: 1 })
  expect(await ui.find({ text: /32\.0%/ })).toBeDefined()
  await ui.unmount()
})

test('an agent is labelled by name, then type, then short id', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/x', [
    agentOf({ id: 'a1', type: 'Explore', name: 'scout' }),
    agentOf({ id: 'a2', type: 'Plan' }),
    agentOf({ id: 'abcdef0123456789', type: '' }),
  ])
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  for (const [id, label] of [['a1', 'scout'], ['a2', 'Plan'], ['abcdef0123456789', 'abcdef01']] as const) {
    const ui = await mountBand($, { view: { agentId: id } })
    expect((await rowsOf(ui))[0]).toMatch(new RegExp(`^${label} `))
    await ui.unmount()
  }
})

test('an agent with no completed step shows a dim placeholder and no model', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/x', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  const ui = await mountBand($, { view: { agentId: 'a1' } })
  const [env] = await rowsOf(ui)
  expect(env).not.toContain('Opus 4.6')
  expect((await ui.find({ type: 'Text', text: /^0\.0%$/ }))?.props.color).toBe('inactive')
  await ui.unmount()
})

test('a loop on a 1M model is measured against the 1M window', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/x', [agentOf({ id: 'a1', type: 'Explore' })])
  stubSteps(on, () => 300_000)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  await runStep($, { model: 'claude-sonnet-5-5[1m]', agentId: 'a1' })
  const ui = await mountBand($, { view: { agentId: 'a1' } })
  expect((await rowsOf(ui))[1]).toContain('30.0% of 1.0m')
  await ui.unmount()
})

test('the main view is untouched by agent steps', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/x', [agentOf({ id: 'a1', type: 'Explore' })])
  stubSteps(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  await runStep($, { model: 'claude-haiku-5-5', effort: 'low', agentId: 'a1' })
  const ui = await mountBand($)
  const [env, readings] = await rowsOf(ui)
  expect(env).toMatch(/^Opus 4\.6 ○ /)
  expect(readings).toContain('10.0%')
  await ui.unmount()
})

test('a loop the engine no longer lists is pruned but keeps its last-known name', async ($, on) => {
  const roster = [agentOf({ id: 'a1', type: 'Explore', name: 'scout' })]
  stubEnvironment(on, 'Opus 4.6', '/x', roster)
  stubSteps(on)
  on('session.usage', () => ({ value: usageOf({ percent: 10, tokens: 20_000 }) }))

  await runStep($, { agentId: 'a1' })
  roster.splice(0, roster.length)
  await runStep($, { index: 1 })

  const ui = await mountBand($, { view: { agentId: 'a1' } })
  expect((await rowsOf(ui))[0]).toMatch(/^scout /)
  expect(await ui.find({ text: /16\.0%/ })).toBeUndefined()
  await ui.unmount()
})
