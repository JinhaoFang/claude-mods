import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

// Context band: a view-aware band above the prompt (the AbovePrompt site).
//
// Layout — an environment row (identity label in agent views, model, effort
// scale, working dot, dim session directory, shortened path, then the button
// group Hide · ⟲ Compact · ⚙ · ▾) above a readings row (compaction-window
// gauge, plan quota bars, reset countdown or session cost). The path is the
// first element sacrificed; readings never truncate.
//
// Render branch order — survey → hidden → collapsed pill → settings open →
// the full band. The settings area swaps the readings row only; the pill
// ignores it. /context-band resets only isHidden and isCollapsed.
//
// Settings — the `settings` store key holds only explicit values; every
// effective value is the store's value when set, else the plugin option
// default (withOverrides), so existing /config setups keep working until a
// settings row is touched. The pair clamp is directional: raising warning
// lifts error out of the way, lowering error drops warning with it; warning's
// ceiling is error's − 5. Refresh seconds re-arm the fallback clock at once —
// turn ends push a session.measure and redraw anyway, the clock only covers
// what the engine does not measure. The open/close flag is register-activation
// scope like the compact arm: a hot reload closes it, a session restart too.
//
// Readings — the gauge measures the compaction window (the summary breakdown,
// estimated locally, sends nothing), not the model's theoretical limit. The
// plan form is adaptive, not a login-method check: subscription windows
// present → quota bars, no cost; otherwise the session cost, with a gateway's
// spend limit appended when reported. The two subscription windows are told
// apart by their base colour; past the thresholds the colour turns regardless
// of the window.
//
// Agent views — turn.step fills the per-agent tracker (its writes are wrapped
// so a refusal never disturbs dispatch; the same catch covers the roster read
// and the name cache, so a failed agent.list or a refused name write leaves
// dispatch untouched too); main-loop effort lands in mainEffort. The tracked
// model decides the window table; identity is name → type → short id, cached
// before the engine prunes the loop. Compact exists in the main conversation
// alone, two-step, waiting out a running turn.

const isHidden = atom({ plugin: 'context-band', key: 'isHidden' } as const, false)
const isCollapsed = atom({ plugin: 'context-band', key: 'isCollapsed' } as const, false)
const mainEffort = atom({ plugin: 'context-band', key: 'mainEffort' } as const, null)
const tracker = atom(
  { plugin: 'context-band', key: 'tracker' } as const,
  { loops: {}, names: {} },
)
const settings = atom(
  { plugin: 'context-band', key: 'settings' } as const,
  {} as SettingsValues,
)

const BAR_CELLS = 12
const QUOTA_CELLS = 3
const PATH_CELLS = 12
const WORKING_DOT_CELLS = 2
const GROUP_RESERVED_CELLS = 18
const AGENT_GROUP_RESERVED_CELLS = 7
const COMPACT_CONFIRM_MS = 5_000

interface ThresholdPair {
  warnAt: number
  errorAt: number
}

interface Config extends ThresholdPair {
  refreshSeconds: number
  showEffort: boolean
  showCost: boolean
  showResetIn: boolean
}

interface SettingsValues extends Partial<ThresholdPair> {
  refreshSeconds?: number
  showEffort?: boolean
  showCost?: boolean
  showResetIn?: boolean
}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const EFFORT_CELLS: Record<Effort, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

function effortScale(effort: Effort): string {
  return bar((EFFORT_CELLS[effort] / 5) * 100, 5)
}

function readConfig(options: PluginOptions): Config {
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === 'boolean' ? v : fallback
  return {
    warnAt: Math.min(100, Math.max(1, num(options.warningThreshold, 60))),
    errorAt: Math.min(100, Math.max(1, num(options.errorThreshold, 85))),
    refreshSeconds: Math.min(600, Math.max(1, num(options.refreshSeconds, 7))),
    showEffort: bool(options.showEffort, true),
    showCost: bool(options.showCost, true),
    showResetIn: bool(options.showResetIn, true),
  }
}

function withOverrides(base: Config, s: SettingsValues): Config {
  return {
    warnAt: s.warnAt ?? base.warnAt,
    errorAt: s.errorAt ?? base.errorAt,
    refreshSeconds: s.refreshSeconds ?? base.refreshSeconds,
    showEffort: s.showEffort ?? base.showEffort,
    showCost: s.showCost ?? base.showCost,
    showResetIn: s.showResetIn ?? base.showResetIn,
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function armRefresh($: EngineInterface, seconds: number, previous: Timer | null): Timer {
  previous?.cancel()
  return $.clock.every(seconds * 1000, () => $.ui.invalidate('ui.render'))
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

function quotaColor(percent: number, kind: string, config: Config): string {
  if (percent >= config.errorAt) return 'error'
  if (percent >= config.warnAt) return 'warning'
  return kind === 'seven_day' ? 'remember' : 'suggestion'
}

function bar(percent: number, cells: number): string {
  const filled = clamp(Math.round((percent / 100) * cells), 0, cells)
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

function windowFor(model: string | undefined): number {
  return !!model && /\[1m\]/.test(model) ? 1_000_000 : 200_000
}

function shortenPath(
  cwd: string,
  modelAndScale: string,
  labelCells: number,
  bodyColumns: number,
  reservedCells: number,
): string {
  const budget = Math.max(
    0,
    bodyColumns - labelCells - WORKING_DOT_CELLS - modelAndScale.length - PATH_CELLS - reservedCells,
  )
  if (cwd.length <= budget) return cwd
  const segments = cwd.split('/').filter(Boolean)
  const lastTwo = segments.slice(-2).join('/')
  if (lastTwo.length <= budget) return lastTwo
  return segments[segments.length - 1] ?? cwd
}

interface ResolvedView {
  label: string
  working: boolean
  window: number
  fill: number | undefined
  model: string | undefined
  effort: Effort | number | null
}

async function resolveView(
  $: EngineInterface,
  viewed: string | undefined,
  model: string,
  contextWindow: number,
): Promise<ResolvedView | null> {
  if (viewed === undefined) return null
  const [tracked, roster] = await Promise.all([read($, tracker), $.agent.list()])
  const entry = tracked.loops[viewed]
  const info = roster.find(a => a.id === viewed)
  const live = info ? info.name || info.type : undefined
  return {
    label: live || tracked.names[viewed] || viewed.slice(0, 8),
    working: info ? info.status === 'running' : false,
    window: entry && entry.model !== model ? windowFor(entry.model) : contextWindow,
    fill: entry?.fill,
    model: entry?.model,
    effort: entry?.effort ?? null,
  }
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
  const baseConfig = readConfig(rawOptions)

  let compactArmed = false
  let confirmTimer: Timer | null = null
  let compactPending = false
  let settingsOpen = false
  let refreshTimer: Timer | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-band',
      description: 'Restore the context band above the prompt, expanded',
    })
    const config = withOverrides(baseConfig, await read($, settings))
    refreshTimer = armRefresh($, config.refreshSeconds, refreshTimer)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    try {
      const roster = await $.agent.list()
      const listed = new Set(roster.map(a => a.id))
      await update($, tracker, t => {
        const loops = { ...t.loops }
        if (agentId && result.usage) {
          loops[agentId] = {
            fill:
              result.usage.input_tokens +
              result.usage.cache_read_input_tokens +
              result.usage.cache_creation_input_tokens,
            model: e.model,
            effort: e.effort,
          }
        }
        for (const id of Object.keys(loops)) {
          if (!listed.has(id)) delete loops[id]
        }
        const names = { ...t.names }
        for (const a of roster) {
          const name = a.name || a.type
          if (name) names[a.id] = name
        }
        return { loops, names }
      })
      if (!agentId) await update($, mainEffort, () => e.effort ?? null)
    } catch {}
  })

  on('turn.complete', async ($, e, next) => {
    if (compactPending && e.agentId === undefined) {
      compactPending = !(await tryCompact($))
    }

    return next(e)
  })

  on('command.run', { command: 'context-band' }, async $ => {
    await update($, isHidden, () => false)
    await update($, isCollapsed, () => false)

    return { text: 'Context band expanded.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const viewed = e.props.view.agentId
    const [usage, model, cwd, mainEffortSeen] = await Promise.all([
      $.session.usage({ breakdown: 'summary' }),
      $.session.model(),
      $.session.cwd(),
      viewed ? Promise.resolve(null) : read($, mainEffort),
    ])
    const { context, rateLimits, cost } = usage

    const bd = context.breakdown
    let percent = bd ? bd.percentage : (context.percent ?? 0)
    let window = bd ? bd.rawMaxTokens : context.window
    let noReading = !bd && context.percent === undefined
    let label: string | undefined
    let working = e.props.isWorking
    let shownModel: string | undefined = model
    let effort: Effort | number | null = mainEffortSeen
    const view = await resolveView($, viewed, model, window)
    if (view) {
      label = view.label
      working = view.working
      window = view.window
      noReading = view.fill === undefined
      percent = view.fill === undefined ? 0 : (view.fill / view.window) * 100
      shownModel = view.model
      effort = view.effort
    }
    let scale = typeof effort === 'string' ? effortScale(effort) : undefined

    if (await read($, isCollapsed)) {
      const pillLabel = label?.slice(0, 12)
      return (
        <Box>
          <Button
            key="pill"
            label={pillLabel ? `◂ ${pillLabel} ${percent.toFixed(1)}%` : `◂ ${percent.toFixed(1)}%`}
            dimColor={noReading}
            onPress={() => update($, isCollapsed, () => false)}
          />
        </Box>
      )
    }

    const config = withOverrides(baseConfig, await read($, settings))
    if (!config.showEffort) {
      shownModel = undefined
      scale = undefined
    }
    const modelAndScale = shownModel ? (scale ? `${shownModel} ${scale}` : shownModel) : ''
    const color = noReading ? 'inactive' : colorFor(percent, config)

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

    const group = [
      <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />,
      ...(e.props.view.agentId === undefined
        ? [
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
            />,
          ]
        : []),
      <Button
        key="settings"
        label="⚙"
        onPress={() => {
          settingsOpen = !settingsOpen
          $.ui.invalidate('ui.render')
        }}
      />,
      <Button key="collapse" label="▾" onPress={() => update($, isCollapsed, () => true)} />,
    ]

    const readingsRow = (
      <Box key="readings">
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
      </Box>
    )

    const stepPair = (field: 'warnAt' | 'errorAt', delta: number) => {
      void update($, settings, s => {
        const warnFrom = s.warnAt ?? baseConfig.warnAt
        const errorFrom = s.errorAt ?? baseConfig.errorAt
        const written: SettingsValues = { ...s }
        if (field === 'warnAt') {
          const warn = clamp(warnFrom + delta, 1, 100)
          const error = Math.min(100, Math.max(errorFrom, warn + 5))
          written.warnAt = Math.min(warn, error - 5)
          if (error !== errorFrom) written.errorAt = error
        } else {
          const error = clamp(errorFrom + delta, 1, 100)
          const warn = Math.max(1, Math.min(warnFrom, error - 5))
          written.errorAt = Math.max(error, warn + 5)
          if (warn !== warnFrom) written.warnAt = warn
        }
        return written
      })
    }
    const stepSeconds = (delta: number) => {
      const seconds = clamp(config.refreshSeconds + delta, 1, 600)
      void update($, settings, s => ({ ...s, refreshSeconds: seconds }))
      refreshTimer = armRefresh($, seconds, refreshTimer)
    }

    const stepper = (
      label: string,
      value: string,
      minusKey: string,
      plusKey: string,
      onPress: (delta: number) => void,
      by = 1,
    ) => [
      <Text key={`${minusKey}v`}>{`${label} ${value}`}</Text>,
      <Button key={minusKey} label="-" onPress={() => onPress(-by)} />,
      <Button key={plusKey} label="+" onPress={() => onPress(by)} />,
    ]

    const numericRow = (
      <Box key="settings-numeric">
        {[
          ...stepper('Warn', String(config.warnAt), 'warn-', 'warn+', delta => stepPair('warnAt', delta), 5),
          ...stepper('Error', String(config.errorAt), 'error-', 'error+', delta => stepPair('errorAt', delta), 5),
          ...stepper('Refresh', `${config.refreshSeconds}s`, 'seconds-', 'seconds+', stepSeconds),
        ]}
      </Box>
    )

    const flip = (field: 'showEffort' | 'showCost' | 'showResetIn', value: boolean) => {
      void update($, settings, s => ({ ...s, [field]: !value }))
    }

    const togglesRow = (
      <Box key="settings-toggles">
        {[
          <Button
            key="effort"
            label={`Model & effort ${config.showEffort ? 'on' : 'off'}`}
            onPress={() => flip('showEffort', config.showEffort)}
          />,
          <Button
            key="reset"
            label={`Reset ↺ ${config.showResetIn ? 'on' : 'off'}`}
            onPress={() => flip('showResetIn', config.showResetIn)}
          />,
          <Button
            key="cost"
            label={`Cost ${config.showCost ? 'on' : 'off'}`}
            onPress={() => flip('showCost', config.showCost)}
          />,
          <Button
            key="done"
            label="Done"
            onPress={() => {
              settingsOpen = false
              $.ui.invalidate('ui.render')
            }}
          />,
        ]}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box>
          {label && <Text>{label} </Text>}
          {shownModel && <Text>{shownModel} </Text>}
          {scale && <Text dimColor>{scale} </Text>}
          <Text color={working ? 'success' : 'inactive'}>{working ? '●' : '○'}{' '}</Text>
          <Text dimColor>{shortenPath(
            cwd,
            modelAndScale,
            label ? label.length + 1 : 0,
            e.props.bodyColumns,
            viewed ? AGENT_GROUP_RESERVED_CELLS : GROUP_RESERVED_CELLS,
          )}</Text>
          {group}
        </Box>
        {settingsOpen ? [numericRow, togglesRow] : [readingsRow]}
      </Box>
    )
  })
}
