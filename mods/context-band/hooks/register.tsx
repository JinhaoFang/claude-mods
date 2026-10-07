import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

const isHidden = atom({ plugin: 'context-band', key: 'isHidden' } as const, false)

const BAR_CELLS = 12
const QUOTA_CELLS = 3
const PATH_CELLS = 12
const COMPACT_CONFIRM_MS = 5_000

interface Config {
  warnAt: number
  errorAt: number
  refreshMs: number
  showCost: boolean
  showResetIn: boolean
}

function readConfig(options: PluginOptions): Config {
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === 'boolean' ? v : fallback
  return {
    warnAt: Math.min(100, Math.max(1, num(options.warningThreshold, 60))),
    errorAt: Math.min(100, Math.max(1, num(options.errorThreshold, 85))),
    refreshMs: Math.min(600, Math.max(1, num(options.refreshSeconds, 7))) * 1000,
    showCost: bool(options.showCost, true),
    showResetIn: bool(options.showResetIn, true),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatReset(iso: string, nowMs: number): string {
  const ms = new Date(iso).getTime() - nowMs
  if (!(ms > 0)) return 'now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

function colorFor(percent: number, config: Config): 'success' | 'warning' | 'error' {
  if (percent >= config.errorAt) return 'error'
  if (percent >= config.warnAt) return 'warning'
  return 'success'
}

// The two subscription windows are told apart by their base colour; past the
// warning thresholds the colour turns regardless of the window.
function quotaColor(percent: number, kind: string, config: Config): string {
  if (percent >= config.errorAt) return 'error'
  if (percent >= config.warnAt) return 'warning'
  return kind === 'seven_day' ? 'remember' : 'suggestion'
}

function bar(percent: number, cells: number): string {
  const filled = clamp(Math.round((percent / 100) * cells), 0, cells)
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

function shortenPath(cwd: string, model: string, bodyColumns: number): string {
  const budget = bodyColumns - model.length - PATH_CELLS
  if (cwd.length <= budget) return cwd
  const segments = cwd.split('/').filter(Boolean)
  const lastTwo = segments.slice(-2).join('/')
  if (lastTwo.length <= budget) return lastTwo
  return segments[segments.length - 1] ?? cwd
}

async function tryCompact($: EngineInterface): Promise<boolean> {
  try {
    await $.session.compact()
    return true
  } catch {
    return false
  }
}

export const register: Register = (on, rawOptions) => {
  const config = readConfig(rawOptions)

  let compactArmed = false
  let confirmTimer: Timer | null = null
  let compactPending = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-band',
      description: 'Show the context usage band above the prompt again',
    })
    // Turn ends push a session.measure, which redraws at once; the clock only
    // covers what the engine does not measure, and its plain usage() is free.
    $.clock.every(config.refreshMs, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (compactPending && e.agentId === undefined) {
      compactPending = !(await tryCompact($))
    }

    return next(e)
  })

  on('command.run', { command: 'context-band' }, async $ => {
    await update($, isHidden, () => false)

    return { text: 'Context band shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const [usage, model, cwd] = await Promise.all([
      $.session.usage({ breakdown: 'summary' }),
      $.session.model(),
      $.session.cwd(),
    ])
    const { context, rateLimits, cost } = usage

    // The compaction window is the honest gauge: the room left before the
    // session compacts, not the model's theoretical limit. The summary
    // breakdown is estimated locally and sends nothing.
    const bd = context.breakdown
    const percent = bd ? bd.percentage : (context.percent ?? 0)
    const window = bd ? bd.rawMaxTokens : context.window
    const noReading = !bd && context.percent === undefined
    const color = noReading ? 'inactive' : colorFor(percent, config)

    // Adaptive, not a hard login-method check: subscription windows present ->
    // plan form (quota bars, no cost); otherwise the session cost, with a
    // gateway's spend limit appended when the gateway reports one.
    const plans = rateLimits.filter(
      r => r.kind === 'five_hour' || r.kind === 'seven_day',
    )
    const spend = rateLimits.find(r => r.kind === 'spend_limit')
    const resetsAt = config.showResetIn
      ? plans.flatMap(p => (p.resetsAt ? [p.resetsAt] : [])).sort()[0]
      : undefined
    const resetIn = resetsAt
      ? ` ↺${formatReset(resetsAt, await $.clock.now())}`
      : undefined

    return (
      <Box flexDirection="column">
        <Box>
          <Text>{model} </Text>
          <Text color={e.props.isWorking ? 'success' : 'inactive'}>
            {e.props.isWorking ? '●' : '○'}{' '}
          </Text>
          <Text dimColor>{shortenPath(cwd, model, e.props.bodyColumns)}</Text>
        </Box>
        <Box>
          <Text dimColor>Context </Text>
          <Text color={color}>{bar(percent, BAR_CELLS)} </Text>
          <Text color={color} bold={!noReading}>
            {percent.toFixed(1)}%
          </Text>
          <Text dimColor> of {formatTokens(window)}</Text>
          {plans.map(p => (
            <Text
              key={p.kind}
              color={quotaColor(p.percentUsed, p.kind, config)}
            >{` · ${bar(p.percentUsed, QUOTA_CELLS)} ${p.percentUsed}%`}</Text>
          ))}
          {resetIn && <Text dimColor>{resetIn}</Text>}
          {config.showCost && plans.length === 0 && cost !== undefined && (
            <Text dimColor>{` · $${cost.usd.toFixed(2)}`}</Text>
          )}
          {spend && (
            <Text color={quotaColor(spend.percentUsed, 'five_hour', config)}>{` · Limit ${bar(spend.percentUsed, QUOTA_CELLS)} ${spend.percentUsed}%`}</Text>
          )}
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
          {e.props.view.agentId === undefined && (
            <Button
              key="compact"
              label={compactArmed ? 'Confirm' : '⟲ Compact'}
              onPress={() => {
                if (!compactArmed) {
                  compactArmed = true
                  confirmTimer = $.clock.after(COMPACT_CONFIRM_MS, () => {
                    confirmTimer = null
                    compactArmed = false
                    $.ui.invalidate('ui.render')
                  })
                } else {
                  confirmTimer?.cancel()
                  confirmTimer = null
                  compactArmed = false
                  if (e.props.isWorking) {
                    compactPending = true
                  } else {
                    void tryCompact($).then(compacted => {
                      compactPending = !compacted
                    })
                  }
                }
                $.ui.invalidate('ui.render')
              }}
            />
          )}
        </Box>
      </Box>
    )
  })
}
