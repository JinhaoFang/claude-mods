import { expect, mock, test } from 'claude-code/testing'
import type {
  AgentInfo,
  On,
  SessionBreakdown,
  SessionBreakdownInput,
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
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
}

const FIXED_NOW = 1_760_000_000_000
const minutesFromNow = (m: number) =>
  new Date(FIXED_NOW + m * 60_000).toISOString()

function usageOf(opts: {
  percent: number
  tokens: number
  window?: number
  rateLimits?: SessionRateLimit[]
  cost?: SessionCost
  breakdown?: SessionBreakdown
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

function stubEnvironment(on: On, model = 'Opus 4.6', cwd = '/root/project/claude-mods', agents: AgentInfo[] = []) {
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

function turnStepResultOf(model: string, tokens: { input: number; cacheRead: number; cacheCreation: number }) {
  return {
    turnId: '',
    index: 0,
    answer: '',
    toolUses: [],
    stopReason: 'end_turn',
    usage: {
      input_tokens: tokens.input,
      output_tokens: 500,
      cache_read_input_tokens: tokens.cacheRead,
      cache_creation_input_tokens: tokens.cacheCreation,
      model,
    },
  } as const
}

async function runStep(
  $: { turn: { step: (input: TurnStepInput) => AsyncIterable<unknown> } },
  input: TurnStepInput,
): Promise<void> {
  for await (const _chunk of $.turn.step(input)) {
  }
}

function breakdownOf(percentage: number, rawMaxTokens: number): SessionBreakdown {
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
  }
}

test('the band draws the environment row above the readings row', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.42 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Box' }))?.props.flexDirection).toBe('column')
  expect(await ui.find({ text: /34\.2%/ })).toBeDefined()
  await ui.unmount()
})

test('the model name shows before the first turn completes', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 0, window: 200_000 },
      rateLimits: [],
      cost: { usd: 0 },
    } satisfies SessionUsage,
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeDefined()
  await ui.unmount()
})

test('the working indicator follows the main conversation working flag', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const busy = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, isWorking: true },
  })
  expect(await busy.find({ text: /●/ })).toBeDefined()
  expect(await busy.find({ text: /○/ })).toBeUndefined()
  await busy.unmount()

  const idle = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await idle.find({ text: /○/ })).toBeDefined()
  expect(await idle.find({ text: /●/ })).toBeUndefined()
  await idle.unmount()
})

test('the session directory shows in dim colour', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  const path = await ui.find({ type: 'Text', text: /\/home\/jh\/work\/client-portal/ })
  expect(path).toBeDefined()
  expect(path?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('the directory shortens last-two-segments first, then the last one', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const wide = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, bodyColumns: 80 },
  })
  expect(await wide.find({ type: 'Text', text: /\/home\/jh\/work\/client-portal/ })).toBeDefined()
  await wide.unmount()

  const medium = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, bodyColumns: 44 },
  })
  expect(await medium.find({ type: 'Text', text: /work\/client-portal/ })).toBeDefined()
  expect(await medium.find({ type: 'Text', text: /\/home/ })).toBeUndefined()
  await medium.unmount()

  const narrow = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, bodyColumns: 28 },
  })
  expect(await narrow.find({ type: 'Text', text: /client-portal/ })).toBeDefined()
  expect(await narrow.find({ type: 'Text', text: /work\// })).toBeUndefined()
  await narrow.unmount()
})

test('a narrow terminal keeps every reading while the path shortens', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  mock.clock(on, { now: FIXED_NOW })
  on('session.usage', () => ({
    value: usageOf({
      percent: 34.2,
      tokens: 68_400,
      rateLimits: [
        plan('five_hour', 23.5, minutesFromNow(133)),
        plan('seven_day', 8, minutesFromNow(5 * 24 * 60)),
      ],
      cost: { usd: 0.42 },
    }),
  }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, bodyColumns: 28 },
  })
  expect(await ui.find({ type: 'Text', text: /client-portal/ })).toBeDefined()
  expect(await ui.find({ text: /34\.2%/ })).toBeDefined()
  expect(await ui.find({ text: /of 200\.0k/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /23\.5%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /8%/ })).toBeDefined()
  expect(await ui.find({ text: /↺2h13m/ })).toBeDefined()
  await ui.unmount()
})

test('a subscription session shows both windows and the reset time', async ($, on) => {
  stubEnvironment(on)
  mock.clock(on, { now: FIXED_NOW })
  on('session.usage', () => ({
    value: usageOf({
      percent: 34.2,
      tokens: 68_400,
      rateLimits: [
        plan('five_hour', 23.5, minutesFromNow(133)),
        plan('seven_day', 8, minutesFromNow(5 * 24 * 60)),
      ],
      cost: { usd: 0.42 },
    }),
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND })
    expect((await ui.find({ text: /34\.2%/ }))?.text).toContain('34.2%')
    expect(await ui.find({ text: /of 200\.0k/ })).toBeDefined()

    const fiveHour = await ui.find({ type: 'Text', text: /23\.5%/ })
    expect(fiveHour?.props.color).toBe('suggestion')
    const sevenDay = await ui.find({ type: 'Text', text: /8%/ })
    expect(sevenDay?.props.color).toBe('remember')

    expect(await ui.find({ text: /↺2h13m/ })).toBeDefined()
    expect(await ui.find({ text: /\$/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a window past the thresholds turns to warning, then error', async ($, on) => {
  stubEnvironment(on)
  mock.clock(on, { now: FIXED_NOW })
  let limits = [plan('five_hour', 65, minutesFromNow(60))]
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, rateLimits: limits }),
  }))

  const first = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
  })
  expect((await first.find({ type: 'Text', text: /65%/ }))?.props.color).toBe('warning')
  await first.unmount()

  limits = [plan('five_hour', 90, minutesFromNow(60))]
  const second = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
  })
  expect((await second.find({ type: 'Text', text: /90%/ }))?.props.color).toBe('error')
  await second.unmount()
})

test('an API-key session shows the session cost alone', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 1.234 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /\$1\.23/ })).toBeDefined()
  expect(await ui.find({ text: /↺/ })).toBeUndefined()
  expect(await ui.find({ text: /Limit/ })).toBeUndefined()
  await ui.unmount()
})

test('a gateway spend limit is appended to the cost', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({
      percent: 34.2,
      tokens: 68_400,
      rateLimits: [plan('spend_limit', 65.5)],
      cost: { usd: 0.5 },
    }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /\$0\.50/ })).toBeDefined()
  const limit = await ui.find({ type: 'Text', text: /Limit/ })
  expect(limit).toBeDefined()
  expect(limit?.text).toContain('65.5%')
  expect(limit?.props.color).toBe('warning')
  await ui.unmount()
})

test('with a breakdown the percent measures the compaction window', async ($, on) => {
  stubEnvironment(on)
  const usage = usageOf({
    percent: 34.2,
    tokens: 68_400,
    cost: { usd: 0.3 },
    breakdown: breakdownOf(44.4, 160_000),
  })
  on('session.usage', () => ({ value: usage }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /44\.4%/ })).toBeDefined()
  expect(await ui.find({ text: /of 160\.0k/ })).toBeDefined()
  expect(await ui.find({ text: /34\.2%/ })).toBeUndefined()
  await ui.unmount()
})

test('a session.measure redraws the band without a remount', async ($, on) => {
  stubEnvironment(on)
  let usage = usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } })
  on('session.usage', () => ({ value: usage }))
  on('session.measure', ($, e) => ({ changed: e.changed }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /10\.0%/ })).toBeDefined()

  usage = usageOf({ percent: 50, tokens: 100_000, cost: { usd: 0.2 } })
  await $.session.measure({
    context: usage.context,
    rateLimits: [],
    changed: ['context'],
  })
  expect(await ui.find({ text: /50\.0%/ })).toBeDefined()
  await ui.unmount()
})

test('errorThreshold moves the error colour', { options: { errorThreshold: 50 } }, async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({
      percent: 10,
      tokens: 20_000,
      rateLimits: [plan('five_hour', 65)],
    }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /65%/ }))?.props.color).toBe('error')
  await ui.unmount()
})

test('warningThreshold moves the warning colour', { options: { warningThreshold: 90 } }, async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({
      percent: 10,
      tokens: 20_000,
      rateLimits: [plan('five_hour', 65)],
    }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: /65%/ }))?.props.color).toBe('suggestion')
  await ui.unmount()
})

test('showCost: false hides the session cost', { options: { showCost: false } }, async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 1.0 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /\$/ })).toBeUndefined()
  await ui.unmount()
})

test('showResetIn: false hides the reset time', { options: { showResetIn: false } }, async ($, on) => {
  stubEnvironment(on)
  mock.clock(on, { now: FIXED_NOW })
  on('session.usage', () => ({
    value: usageOf({
      percent: 34.2,
      tokens: 68_400,
      rateLimits: [plan('five_hour', 23.5, minutesFromNow(133))],
    }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /23\.5%/ })).toBeDefined()
  expect(await ui.find({ text: /↺/ })).toBeUndefined()
  await ui.unmount()
})

test('a reading below 60% draws the context bar in the success colour', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 40, tokens: 80_000, cost: { usd: 0.1 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  const contextBar = await ui.find({ type: 'Text', text: /█/ })
  expect(contextBar?.props.color).toBe('success')
  await ui.unmount()
})

test('the Hide button hides the band until /context-band restores it expanded', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 50, tokens: 100_000, cost: { usd: 0.2 } }),
  }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Box',
    children: ['the engine band'],
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /Context/ })).toBeDefined()

  await ui.press({ key: 'hide' })
  expect(await ui.find({ text: /Context/ })).toBeUndefined()
  expect(await ui.find({ text: /the engine band/ })).toBeDefined()
  await ui.unmount()

  const again = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await again.find({ text: /the engine band/ })).toBeDefined()

  await $.command.run({
    command: 'context-band',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(await again.find({ text: /Context/ })).toBeDefined()
  expect(await again.find({ text: /◂/ })).toBeUndefined()
  await again.unmount()
})

test('the compact button compacts on the second press alone', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  let compacts = 0
  on('session.compact', () => {
    compacts += 1
    return { value: { skip: 'test' } }
  })

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Button', text: /Compact/ })).toBeDefined()
  expect(compacts).toBe(0)

  await ui.press({ key: 'compact' })
  expect(compacts).toBe(0)
  expect((await ui.find({ type: 'Button', text: /Confirm/ }))?.props.label).toBe('Confirm')
  expect(await ui.find({ type: 'Button', text: /Compact/ })).toBeUndefined()

  await ui.press({ key: 'compact' })
  expect(compacts).toBe(1)
  expect(await ui.find({ type: 'Button', text: /Confirm/ })).toBeUndefined()
  await ui.unmount()
})

test('the confirm reverts to the idle form when the timeout passes', async ($, on) => {
  stubEnvironment(on)
  const clock = mock.clock(on, { now: FIXED_NOW })
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  let compacts = 0
  on('session.compact', () => {
    compacts += 1
    return { value: { skip: 'test' } }
  })

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'compact' })
  expect((await ui.find({ type: 'Button', text: /Confirm/ }))?.props.label).toBe('Confirm')

  await clock.advance(4_000)
  expect((await ui.find({ type: 'Button', text: /Confirm/ }))?.props.label).toBe('Confirm')

  await clock.advance(2_000)
  expect(await ui.find({ type: 'Button', text: /Confirm/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /Compact/ })).toBeDefined()
  expect(compacts).toBe(0)
  await ui.unmount()
})

test('an agent view draws no compact button', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  let compacts = 0
  on('session.compact', () => {
    compacts += 1
    return { value: { skip: 'test' } }
  })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ type: 'Button', text: /Compact/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /Confirm/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /Hide/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /▾/ })).toBeDefined()
  await ui.press({ key: 'compact' }).catch(() => undefined)
  expect(compacts).toBe(0)
  await ui.unmount()
})

test('a compact pressed during a running turn waits for the turn to end', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  let compacts = 0
  on('session.compact', () => {
    compacts += 1
    return { value: { skip: 'test' } }
  })
  on('turn.complete', () => ({ text: '' }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, isWorking: true },
  })
  await ui.press({ key: 'compact' })
  await ui.press({ key: 'compact' })
  expect(compacts).toBe(0)
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeDefined()

  await $.turn.complete({
    answer: '',
    durationMs: 1_000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  expect(compacts).toBe(1)
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeDefined()
  await ui.unmount()
})

test('the band yields when a survey holds it', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 50, tokens: 100_000, cost: { usd: 0.2 } }),
  }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Box',
    children: ['the engine band'],
  }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await ui.find({ text: /Context/ })).toBeUndefined()
  expect(await ui.find({ text: /the engine band/ })).toBeDefined()
  await ui.unmount()
})

test('an agent view shows the viewed loop fill from its completed steps', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore', status: 'running' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, agentId: 'a1' })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ text: /16\.0%/ })).toBeDefined()
  expect(await ui.find({ text: /of 200\.0k/ })).toBeDefined()
  expect(await ui.find({ text: /10\.0%/ })).toBeUndefined()
  await ui.unmount()
})

test('an agent view redraws as further steps complete without a remount', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore', status: 'running' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    const input = e.index === 0 ? 10_000 : 30_000
    return {
      ...turnStepResultOf(e.model, { input, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ text: /16\.0%/ })).toBeUndefined()

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, agentId: 'a1' })
  expect(await ui.find({ text: /16\.0%/ })).toBeDefined()

  await runStep($, { turnId: 't1', index: 1, model: 'Opus 4.6', messageCount: 5, agentId: 'a1' })
  expect(await ui.find({ text: /26\.0%/ })).toBeDefined()
  expect(await ui.find({ text: /16\.0%/ })).toBeUndefined()
  await ui.unmount()
})

test('an agent view labels the loop by name, then type, then short id', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [
    agentOf({ id: 'a1', type: 'Explore', name: 'scout' }),
    agentOf({ id: 'a2', type: 'Explore' }),
  ])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const mountView = async (agentId: string) =>
    $.ui.mount({
      plugin: 'context-band',
      surface: 'terminal' as const,
      ...BAND,
      props: { ...BAND.props, view: { agentId } },
    })

  const named = await mountView('a1')
  expect(await named.find({ text: /scout/ })).toBeDefined()
  expect(await named.find({ text: /Explore/ })).toBeUndefined()
  await named.unmount()

  const typed = await mountView('a2')
  expect(await typed.find({ text: /Explore/ })).toBeDefined()
  await typed.unmount()

  const unknown = await mountView('0f3ea2c911aa')
  expect(await unknown.find({ text: /0f3ea2c9/ })).toBeDefined()
  await unknown.unmount()

  const main = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await main.find({ text: /scout/ })).toBeUndefined()
  expect(await main.find({ text: /Explore/ })).toBeUndefined()
  await main.unmount()
})

test('an agent with no completed step shows the inactive placeholder', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  const reading = await ui.find({ type: 'Text', text: /0\.0%/ })
  expect(reading).toBeDefined()
  expect(reading?.props.color).toBe('inactive')
  expect(reading?.props.bold).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /█/ })).toBeUndefined()
  expect(await ui.find({ text: /of 200\.0k/ })).toBeDefined()
  await ui.unmount()
})

test('a loop on another model is measured against the window table', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [
    agentOf({ id: 'a1', type: 'Explore' }),
    agentOf({ id: 'a2', type: 'Explore' }),
  ])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    const tokens = e.model.includes('[1m]')
      ? { input: 300_000, cacheRead: 0, cacheCreation: 0 }
      : { input: 100_000, cacheRead: 0, cacheCreation: 0 }
    return {
      ...turnStepResultOf(e.model, tokens),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, { turnId: 't1', index: 0, model: 'glm-5.3-flash[1m]', messageCount: 3, agentId: 'a1' })
  const oneM = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await oneM.find({ text: /30\.0%/ })).toBeDefined()
  expect(await oneM.find({ text: /of 1\.0m/ })).toBeDefined()
  await oneM.unmount()

  await runStep($, { turnId: 't1', index: 0, model: 'claude-haiku-4-5', messageCount: 3, agentId: 'a2' })
  const plain = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a2' } },
  })
  expect(await plain.find({ text: /50\.0%/ })).toBeDefined()
  expect(await plain.find({ text: /of 200\.0k/ })).toBeDefined()
  await plain.unmount()
})

test('a loop on the session model is measured against the engine-reported window', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, window: 160_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 80_000, cacheRead: 0, cacheCreation: 0 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, agentId: 'a1' })
  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ text: /50\.0%/ })).toBeDefined()
  expect(await ui.find({ text: /of 160\.0k/ })).toBeDefined()
  await ui.unmount()
})

test('an agent view keeps the plan quota bars and the reset countdown', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  mock.clock(on, { now: FIXED_NOW })
  on('session.usage', () => ({
    value: usageOf({
      percent: 34.2,
      tokens: 68_400,
      rateLimits: [
        plan('five_hour', 23.5, minutesFromNow(133)),
        plan('seven_day', 8, minutesFromNow(5 * 24 * 60)),
      ],
      cost: { usd: 0.42 },
    }),
  }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect((await ui.find({ type: 'Text', text: /23\.5%/ }))?.props.color).toBe('suggestion')
  expect((await ui.find({ type: 'Text', text: /8%/ }))?.props.color).toBe('remember')
  expect(await ui.find({ text: /↺2h13m/ })).toBeDefined()
  expect(await ui.find({ text: /\$/ })).toBeUndefined()
  await ui.unmount()
})

test('an agent view keeps the session cost', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 1.234 } }),
  }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ text: /\$1\.23/ })).toBeDefined()
  expect(await ui.find({ text: /↺/ })).toBeUndefined()
  await ui.unmount()
})

test('the main conversation readings are untouched by tracked agent steps', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const main = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await main.find({ text: /10\.0%/ })).toBeDefined()
  expect(await main.find({ text: /16\.0%/ })).toBeUndefined()

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, agentId: 'a1' })
  expect(await main.find({ text: /10\.0%/ })).toBeDefined()
  expect(await main.find({ text: /16\.0%/ })).toBeUndefined()
  await main.unmount()

  const agent = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await agent.find({ text: /16\.0%/ })).toBeDefined()
  await agent.unmount()
})

test('a loop the engine no longer lists is pruned but keeps its last-known name', async ($, on) => {
  const roster = [agentOf({ id: 'a1', type: 'Explore', name: 'scout' })]
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', roster)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, agentId: 'a1' })
  const live = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await live.find({ text: /scout/ })).toBeDefined()
  expect(await live.find({ text: /16\.0%/ })).toBeDefined()
  await live.unmount()

  roster.splice(0, roster.length)
  await runStep($, { turnId: 't2', index: 0, model: 'Opus 4.6', messageCount: 8 })

  const ended = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ended.find({ text: /scout/ })).toBeDefined()
  expect(await ended.find({ text: /16\.0%/ })).toBeUndefined()
  await ended.unmount()
})

test('tracked figures survive a remount of the band', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, agentId: 'a1' })

  const first = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await first.find({ text: /16\.0%/ })).toBeDefined()
  await first.unmount()

  const second = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await second.find({ text: /16\.0%/ })).toBeDefined()
  await second.unmount()
})

test('the working dot follows the viewed loop status in an agent view', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [
    agentOf({ id: 'a1', type: 'Explore', status: 'running' }),
    agentOf({ id: 'a2', type: 'Explore', status: 'idle' }),
  ])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const mountView = async (agentId: string) =>
    $.ui.mount({
      plugin: 'context-band',
      surface: 'terminal' as const,
      ...BAND,
      props: { ...BAND.props, view: { agentId } },
    })

  const running = await mountView('a1')
  expect(await running.find({ text: /●/ })).toBeDefined()
  expect(await running.find({ text: /○/ })).toBeUndefined()
  await running.unmount()

  const idle = await mountView('a2')
  expect(await idle.find({ text: /○/ })).toBeDefined()
  expect(await idle.find({ text: /●/ })).toBeUndefined()
  await idle.unmount()
})

test('the scale follows the latest main-loop step and drops when it carries none', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, effort: 'low' })
  expect(await ui.find({ type: 'Text', text: /^█░░░░ ?$/ })).toBeDefined()

  await runStep($, { turnId: 't1', index: 1, model: 'Opus 4.6', messageCount: 5, effort: 'max' })
  expect(await ui.find({ type: 'Text', text: /^█████ ?$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^█░░░░ ?$/ })).toBeUndefined()

  await runStep($, { turnId: 't1', index: 2, model: 'Opus 4.6', messageCount: 7 })
  expect(await ui.find({ type: 'Text', text: /^█████ ?$/ })).toBeUndefined()
  await ui.unmount()
})

test('with no step yet recorded the model shows without a scale', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^█{1,5}░{0,4} ?$/ })).toBeUndefined()
  await ui.unmount()
})

test('an effort without a named level draws no scale', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, effort: 4 })
  expect(await ui.find({ type: 'Text', text: /^█{1,5}░{0,4} ?$/ })).toBeUndefined()
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeDefined()
  await ui.unmount()
})

test('an agent view shows the loop model and effort from its latest step', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [
    agentOf({ id: 'a1', type: 'Explore', status: 'running' }),
  ])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, {
    turnId: 't1',
    index: 0,
    model: 'glm-5.3-flash[1m]',
    messageCount: 3,
    effort: 'xhigh',
    agentId: 'a1',
  })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ text: /glm-5\.3-flash\[1m\]/ })).toBeDefined()
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^████░ ?$/ })).toBeDefined()
  await ui.unmount()
})

test('an agent view with no completed step shows neither model nor scale', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^█{1,5}░{0,4} ?$/ })).toBeUndefined()
  await ui.unmount()
})

test('the main view draws no scale from an agent step', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await runStep($, {
    turnId: 't1',
    index: 0,
    model: 'glm-5.3-flash[1m]',
    messageCount: 3,
    effort: 'max',
    agentId: 'a1',
  })
  expect(await ui.find({ type: 'Text', text: /^█{1,5}░{0,4} ?$/ })).toBeUndefined()
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeDefined()
  await ui.unmount()
})

test('the path yields room for the scale before the readings do', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.42 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, bodyColumns: 40 },
  })
  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, effort: 'medium' })
  expect(await ui.find({ type: 'Text', text: /^██░░░ ?$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /client-portal/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /work\// })).toBeUndefined()
  expect(await ui.find({ text: /34\.2%/ })).toBeDefined()
  await ui.unmount()
})

test('a main-loop step puts the effort scale beside the model', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /^███░░ ?$/ })).toBeUndefined()

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, effort: 'high' })
  expect(await ui.find({ type: 'Text', text: /^███░░ ?$/ })).toBeDefined()
  await ui.unmount()
})

test('the collapse button draws the pill and pressing it expands again', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({
      percent: 34.2,
      tokens: 68_400,
      cost: { usd: 0.2 },
      breakdown: breakdownOf(44.4, 160_000),
    }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'collapse' })
  expect((await ui.find({ type: 'Button', text: /◂/ }))?.props.label).toBe('◂ 44.4%')
  expect(await ui.find({ text: /Context/ })).toBeUndefined()

  await ui.press({ key: 'pill' })
  expect(await ui.find({ text: /44\.4%/ })).toBeDefined()
  expect(await ui.find({ text: /◂/ })).toBeUndefined()
  await ui.unmount()
})

test('the pill names the viewed agent in an agent view', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore', name: 'scout' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, agentId: 'a1' })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  await ui.press({ key: 'collapse' })
  expect((await ui.find({ type: 'Button', text: /◂/ }))?.props.label).toBe('◂ scout 16.0%')
  await ui.unmount()
})

test('an agent view with no completed step shows a dim zero pill', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  await ui.press({ key: 'collapse' })
  const pill = await ui.find({ type: 'Button', text: /◂/ })
  expect(pill?.props.label).toBe('◂ Explore 0.0%')
  expect(pill?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('the collapsed pill yields when a survey holds it', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 50, tokens: 100_000, cost: { usd: 0.2 } }),
  }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({
    type: 'Box',
    children: ['the engine band'],
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'collapse' })
  expect(await ui.find({ text: /◂/ })).toBeDefined()
  await ui.unmount()

  const surveyed = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await surveyed.find({ text: /the engine band/ })).toBeDefined()
  expect(await surveyed.find({ text: /◂/ })).toBeUndefined()
  await surveyed.unmount()
})

test('the collapsed pill persists across a remount and /context-band restores it expanded', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 50, tokens: 100_000, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'collapse' })
  expect(await ui.find({ text: /◂/ })).toBeDefined()
  await ui.unmount()

  const again = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await again.find({ text: /◂/ })).toBeDefined()
  expect(await again.find({ text: /Context/ })).toBeUndefined()

  await $.command.run({
    command: 'context-band',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(await again.find({ text: /50\.0%/ })).toBeDefined()
  expect(await again.find({ text: /◂/ })).toBeUndefined()
  await again.unmount()
})


test('the settings toggle swaps the readings row for the settings rows', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Button', text: /⚙/ })).toBeDefined()

  await ui.press({ key: 'settings' })
  expect(await ui.find({ text: /Warn 60/ })).toBeDefined()
  expect(await ui.find({ text: /Error 85/ })).toBeDefined()
  expect(await ui.find({ text: /Refresh 7s/ })).toBeDefined()
  expect(await ui.find({ text: /Context/ })).toBeUndefined()
  expect(await ui.find({ text: /34\.2%/ })).toBeUndefined()

  await ui.press({ key: 'done' })
  expect(await ui.find({ text: /34\.2%/ })).toBeDefined()
  expect(await ui.find({ text: /Warn 60/ })).toBeUndefined()
  await ui.unmount()
})

test('a second settings press restores the readings row too', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  expect(await ui.find({ text: /Warn 60/ })).toBeDefined()

  await ui.press({ key: 'settings' })
  expect(await ui.find({ text: /34\.2%/ })).toBeDefined()
  expect(await ui.find({ text: /Warn 60/ })).toBeUndefined()
  await ui.unmount()
})

test('raising warning steps by five and lifts error out of the way', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  for (let i = 0; i < 8; i++) await ui.press({ key: 'warn+' })
  expect(await ui.find({ text: /Warn 95/ })).toBeDefined()
  expect(await ui.find({ text: /Error 100/ })).toBeDefined()
  expect(await ui.find({ text: /Warn 100/ })).toBeUndefined()
  await ui.unmount()
})

test('lowering error steps by five and drops warning with it', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  for (let i = 0; i < 4; i++) await ui.press({ key: 'error-' })
  expect(await ui.find({ text: /Error 65/ })).toBeDefined()
  expect(await ui.find({ text: /Warn 60/ })).toBeDefined()
  await ui.press({ key: 'error-' })
  expect(await ui.find({ text: /Warn 55/ })).toBeDefined()
  await ui.unmount()
})

test('the refresh stepper steps by one and clamps at one', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'seconds+' })
  await ui.press({ key: 'seconds+' })
  await ui.press({ key: 'seconds+' })
  expect(await ui.find({ text: /Refresh 10s/ })).toBeDefined()

  for (let i = 0; i < 12; i++) await ui.press({ key: 'seconds-' })
  expect(await ui.find({ text: /Refresh 1s/ })).toBeDefined()
  await ui.press({ key: 'seconds-' })
  expect(await ui.find({ text: /Refresh 1s/ })).toBeDefined()
  await ui.unmount()
})

test('the refresh stepper clamps at six hundred', { options: { refreshSeconds: 599 } }, async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  expect(await ui.find({ text: /Refresh 599s/ })).toBeDefined()
  await ui.press({ key: 'seconds+' })
  expect(await ui.find({ text: /Refresh 600s/ })).toBeDefined()
  await ui.press({ key: 'seconds+' })
  expect(await ui.find({ text: /Refresh 600s/ })).toBeDefined()
  await ui.unmount()
})

test('a stored threshold shadows the option and persists across a remount', { options: { errorThreshold: 50 } }, async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({
      percent: 10,
      tokens: 20_000,
      rateLimits: [plan('five_hour', 65)],
    }),
  }))

  const first = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect((await first.find({ type: 'Text', text: /65%/ }))?.props.color).toBe('error')
  await first.press({ key: 'settings' })
  for (let i = 0; i < 5; i++) await first.press({ key: 'error+' })
  expect(await first.find({ text: /Error 75/ })).toBeDefined()
  await first.press({ key: 'done' })
  expect((await first.find({ type: 'Text', text: /65%/ }))?.props.color).toBe('warning')
  await first.unmount()

  const again = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect((await again.find({ type: 'Text', text: /65%/ }))?.props.color).toBe('warning')
  await again.unmount()
})

test('the command restores the band but leaves the settings values alone', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'warn+' })
  expect(await ui.find({ text: /Warn 65/ })).toBeDefined()

  await $.command.run({
    command: 'context-band',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(await ui.find({ text: /Warn 65/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /⚙/ })).toBeDefined()
  await ui.press({ key: 'done' })
  await ui.unmount()

  const again = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await again.press({ key: 'settings' })
  expect(await again.find({ text: /Warn 65/ })).toBeDefined()
  await again.unmount()
})

test('the settings toggles show their state and flip on press', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  expect((await ui.find({ type: 'Button', text: /Model & effort/ }))?.props.label).toBe('Model & effort on')
  expect((await ui.find({ type: 'Button', text: /Reset ↺/ }))?.props.label).toBe('Reset ↺ on')
  expect((await ui.find({ type: 'Button', text: /Cost/ }))?.props.label).toBe('Cost on')

  await ui.press({ key: 'effort' })
  expect((await ui.find({ type: 'Button', text: /Model & effort/ }))?.props.label).toBe('Model & effort off')
  await ui.press({ key: 'reset' })
  expect((await ui.find({ type: 'Button', text: /Reset ↺/ }))?.props.label).toBe('Reset ↺ off')
  await ui.press({ key: 'cost' })
  expect((await ui.find({ type: 'Button', text: /Cost/ }))?.props.label).toBe('Cost off')
  await ui.unmount()
})

test('the cost toggle hides the session cost and persists', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 1.234 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /\$1\.23/ })).toBeDefined()
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'cost' })
  await ui.press({ key: 'done' })
  expect(await ui.find({ text: /\$1\.23/ })).toBeUndefined()
  await ui.unmount()

  const again = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await again.find({ text: /\$1\.23/ })).toBeUndefined()
  await again.unmount()
})

test('the reset toggle hides the reset countdown and persists', async ($, on) => {
  stubEnvironment(on)
  mock.clock(on, { now: FIXED_NOW })
  on('session.usage', () => ({
    value: usageOf({
      percent: 34.2,
      tokens: 68_400,
      rateLimits: [plan('five_hour', 23.5, minutesFromNow(133))],
    }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /↺2h13m/ })).toBeDefined()
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'reset' })
  await ui.press({ key: 'done' })
  expect(await ui.find({ text: /↺2h13m/ })).toBeUndefined()
  expect(await ui.find({ text: /23\.5%/ })).toBeDefined()
  await ui.unmount()

  const again = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await again.find({ text: /↺2h13m/ })).toBeUndefined()
  await again.unmount()
})

test('the effort toggle gates the model and scale and re-credits the path', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/home/jh/work/client-portal')
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.42 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, bodyColumns: 50 },
  })
  await runStep($, { turnId: 't1', index: 0, model: 'Opus 4.6', messageCount: 3, effort: 'high' })
  expect(await ui.find({ type: 'Text', text: /^███░░ ?$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /work\/client-portal/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/home\/jh\/work\/client-portal/ })).toBeUndefined()

  await ui.press({ key: 'settings' })
  await ui.press({ key: 'effort' })
  expect(await ui.find({ type: 'Text', text: /^█{1,5}░{0,4} ?$/ })).toBeUndefined()
  expect(await ui.find({ text: /Opus 4\.6/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\/home\/jh\/work\/client-portal/ })).toBeDefined()
  await ui.unmount()
})

test('the effort toggle gates the tracked model and scale in an agent view too', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore', status: 'running' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))
  on('turn.step', async function* ($, e) {
    return {
      ...turnStepResultOf(e.model, { input: 10_000, cacheRead: 20_000, cacheCreation: 2_000 }),
      turnId: e.turnId,
      index: e.index,
    }
  })

  await runStep($, {
    turnId: 't1',
    index: 0,
    model: 'glm-5.3-flash[1m]',
    messageCount: 3,
    effort: 'xhigh',
    agentId: 'a1',
  })

  const ui = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, view: { agentId: 'a1' } },
  })
  expect(await ui.find({ text: /glm-5\.3-flash\[1m\]/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^████░ ?$/ })).toBeDefined()

  await ui.press({ key: 'settings' })
  await ui.press({ key: 'effort' })
  expect(await ui.find({ text: /glm-5\.3-flash\[1m\]/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^████░ ?$/ })).toBeUndefined()
  await ui.press({ key: 'done' })
  expect(await ui.find({ text: /3\.2%/ })).toBeDefined()
  expect(await ui.find({ text: /of 1\.0m/ })).toBeDefined()
  await ui.unmount()
})

test('the collapsed pill ignores the settings area', async ($, on) => {
  stubEnvironment(on)
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 0.2 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'settings' })
  expect(await ui.find({ text: /Warn 60/ })).toBeDefined()

  await ui.press({ key: 'collapse' })
  expect(await ui.find({ text: /◂/ })).toBeDefined()
  expect(await ui.find({ text: /Warn 60/ })).toBeUndefined()

  await ui.press({ key: 'pill' })
  expect(await ui.find({ text: /Warn 60/ })).toBeDefined()
  expect(await ui.find({ text: /◂/ })).toBeUndefined()
  await ui.unmount()
})

test('the main conversation working flag rules the dot in the main view alone', async ($, on) => {
  stubEnvironment(on, 'Opus 4.6', '/root/project/claude-mods', [agentOf({ id: 'a1', type: 'Explore', status: 'running' })])
  on('session.usage', () => ({
    value: usageOf({ percent: 10, tokens: 20_000, cost: { usd: 0.1 } }),
  }))

  const main = await $.ui.mount({
    plugin: 'context-band',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, isWorking: false },
  })
  expect(await main.find({ text: /○/ })).toBeDefined()
  expect(await main.find({ text: /●/ })).toBeUndefined()
  await main.unmount()
})
