import { expect, mock, test } from 'claude-code/testing'
import type {
  On,
  SessionBreakdown,
  SessionBreakdownInput,
  SessionCost,
  SessionRateLimit,
  SessionUsage,
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

function stubEnvironment(on: On, model = 'Opus 4.6', cwd = '/root/project/claude-mods') {
  on('session.model', () => ({ value: model }))
  on('session.cwd', () => ({ value: cwd }))
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

test('the Hide button hides the band until /context-band shows it again', async ($, on) => {
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

  await $.command.run({
    command: 'context-band',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(await ui.find({ text: /Context/ })).toBeDefined()
  await ui.unmount()
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
