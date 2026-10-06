import { expect, mock, test } from 'claude-code/testing'
import type {
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

test('a subscription session shows both windows and the reset time', async ($, on) => {
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
  on('session.usage', () => ({
    value: usageOf({ percent: 34.2, tokens: 68_400, cost: { usd: 1.0 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ text: /\$/ })).toBeUndefined()
  await ui.unmount()
})

test('showResetIn: false hides the reset time', { options: { showResetIn: false } }, async ($, on) => {
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
  on('session.usage', () => ({
    value: usageOf({ percent: 40, tokens: 80_000, cost: { usd: 0.1 } }),
  }))

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  const contextBar = await ui.find({ type: 'Text', text: /█/ })
  expect(contextBar?.props.color).toBe('success')
  await ui.unmount()
})

test('the Hide button hides the band until /context-band shows it again', async ($, on) => {
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

test('the band yields when a survey holds it', async ($, on) => {
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
