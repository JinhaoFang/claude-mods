import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, SessionRateLimit } from 'claude-code'

// Context band: a view-aware, read-only band above the prompt (the
// AbovePrompt site). Two rows, no buttons:
//
//   Opus 4.6 · high ● ~/work/client-portal
//   Context ████████████ 34.2% of 200.0k │ 5h ██████ 23.5% 2h13m │ 7d ██████ 8% 5d0h
//
// Environment row — identity label in an agent view, the model, the effort
// level, the working dot, then the session directory in dim, shortened to
// what the row has left. Readings row — the compaction-window gauge, then
// each plan window under its own label (5h, 7d) with the time left until it
// resets right after it, dim, or the session cost where no plan window is
// reported. When the row is too wide for the terminal the bars shrink, then
// the window size goes, then the bars; numbers and labels never do.
//
// Glyphs — only block elements, box drawing and plain text. Arrows such as
// ↺ fall back to fonts wider than one cell and overprint the next column.
//
// Colours — three hues that never meet: the context gauge is green, yellow or
// red by the thresholds; 5h is blue (`ide`) and 7d violet (`autoAccept`),
// label and bar alike. Past the thresholds only a window's percentage turns
// yellow or red, so the two windows stay apart even when both run hot. The
// theme's `suggestion` and `remember` are the same lavender, hence not those.
//
// Readings — the gauge measures the compaction window (the summary breakdown,
// estimated locally, sends nothing), not the model's theoretical limit. The
// plan form is adaptive, not a login-method check: subscription windows
// present → labelled quota gauges; otherwise the session cost, with a
// gateway's spend limit appended when reported. Past the thresholds a gauge's
// percentage turns regardless of the window; label and bar keep its hue.
//
// Agent views — turn.step fills the per-agent tracker (its writes are wrapped
// so a refusal never disturbs dispatch); main-loop effort lands in mainEffort.
// The tracked model decides the window table; identity is name → type → short
// id, cached before the engine prunes the loop. See ADR-0004.

const mainEffort = atom({ plugin: 'context-band', key: 'mainEffort' } as const, null)
const tracker = atom({ plugin: 'context-band', key: 'tracker' } as const, { loops: {}, names: {} })

const SEPARATOR = ' │ '

interface Config {
  warnAt: number
  errorAt: number
  refreshSeconds: number
}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number

// Widest first; the first that fits the row wins.
interface Fit {
  contextCells: number
  quotaCells: number
  showWindow: boolean
}

const FITS: readonly Fit[] = [
  { contextCells: 12, quotaCells: 6, showWindow: true },
  { contextCells: 10, quotaCells: 5, showWindow: true },
  { contextCells: 8, quotaCells: 4, showWindow: true },
  { contextCells: 6, quotaCells: 3, showWindow: true },
  { contextCells: 6, quotaCells: 3, showWindow: false },
  { contextCells: 0, quotaCells: 0, showWindow: false },
]

const WINDOW_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
export const WINDOW_COLORS: Record<string, string> = { five_hour: 'ide', seven_day: 'autoAccept', spend_limit: 'claude' }

function readConfig(options: PluginOptions): Config {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const warnAt = clamp(num(options.warningThreshold, 60), 1, 100)
  return {
    warnAt,
    errorAt: clamp(num(options.errorThreshold, 85), warnAt, 100),
    refreshSeconds: clamp(num(options.refreshSeconds, 7), 1, 600),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function formatReset(iso: string, nowMs: number): string {
  const ms = new Date(iso).getTime() - nowMs
  if (!(ms > 0)) return 'now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

export function formatEffort(effort: Effort | null | undefined): string | undefined {
  if (effort === null || effort === undefined) return undefined
  return String(effort)
}

function levelColor(percent: number, config: Config): 'success' | 'warning' | 'error' {
  if (percent >= config.errorAt) return 'error'
  if (percent >= config.warnAt) return 'warning'
  return 'success'
}

function quotaColor(percent: number, kind: string, config: Config): string {
  if (percent >= config.errorAt) return 'error'
  if (percent >= config.warnAt) return 'warning'
  return WINDOW_COLORS[kind] ?? 'ide'
}

// Any reading above zero fills at least one cell, so 8% never looks like 0%.
function bar(percent: number, cells: number): string {
  const rounded = Math.round((percent / 100) * cells)
  const filled = clamp(percent > 0 ? Math.max(1, rounded) : rounded, 0, cells)
  return '█'.repeat(filled) + '░'.repeat(cells - filled)
}

const withBar = (percent: number, cells: number) => (cells > 0 ? `${bar(percent, cells)} ` : '')

function windowFor(model: string | undefined): number {
  return !!model && /\[1m\]/.test(model) ? 1_000_000 : 200_000
}

function shortenPath(cwd: string, budget: number): string {
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
  effort: Effort | null
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

// One reading on the readings row: its text pieces with their colours, so the
// row's width can be counted before it is drawn.
interface Piece {
  key: string
  text: string
  color?: string
  dim?: boolean
  bold?: boolean
}

interface Readings {
  percent: number
  window: number
  noReading: boolean
  plans: readonly SessionRateLimit[]
  spend: SessionRateLimit | undefined
  cost: number | undefined
  nowMs: number
}

export function readingPieces(r: Readings, fit: Fit, config: Config): Piece[] {
  const color = r.noReading ? 'inactive' : levelColor(r.percent, config)
  const pieces: Piece[] = [
    { key: 'ctx-label', text: 'Context ', dim: true },
    { key: 'ctx-bar', text: withBar(r.percent, fit.contextCells), color },
    { key: 'ctx-pct', text: `${r.percent.toFixed(1)}%`, color, bold: !r.noReading },
  ]
  if (fit.showWindow) pieces.push({ key: 'ctx-window', text: ` of ${formatTokens(r.window)}`, dim: true })

  for (const p of r.plans) {
    const hue = WINDOW_COLORS[p.kind] ?? 'ide'
    pieces.push(
      { key: `${p.kind}-sep`, text: SEPARATOR, dim: true },
      { key: `${p.kind}-label`, text: `${WINDOW_LABELS[p.kind] ?? p.kind} `, color: hue, bold: true },
      { key: `${p.kind}-bar`, text: withBar(p.percentUsed, fit.quotaCells), color: hue },
      { key: `${p.kind}-pct`, text: `${p.percentUsed}%`, color: quotaColor(p.percentUsed, p.kind, config) },
    )
    if (p.resetsAt) {
      pieces.push({ key: `${p.kind}-reset`, text: ` ${formatReset(p.resetsAt, r.nowMs)}`, dim: true })
    }
  }
  if (r.plans.length === 0 && r.cost !== undefined) {
    pieces.push({ key: 'cost', text: `${SEPARATOR}$${r.cost.toFixed(2)}`, dim: true })
  }
  if (r.spend) {
    pieces.push(
      { key: 'spend-sep', text: SEPARATOR, dim: true },
      { key: 'spend-label', text: 'limit ', dim: true },
      { key: 'spend-bar', text: withBar(r.spend.percentUsed, fit.quotaCells), color: WINDOW_COLORS.spend_limit },
      {
        key: 'spend-pct',
        text: `${r.spend.percentUsed}%`,
        color: quotaColor(r.spend.percentUsed, 'spend_limit', config),
      },
    )
  }
  return pieces
}

const widthOf = (pieces: readonly Piece[]) => pieces.reduce((n, p) => n + p.text.length, 0)

export function fitReadings(r: Readings, columns: number, config: Config): Piece[] {
  for (const fit of FITS) {
    const pieces = readingPieces(r, fit, config)
    if (widthOf(pieces) <= columns) return pieces
  }
  return readingPieces(r, FITS[FITS.length - 1]!, config)
}

export const register: Register = (on, rawOptions) => {
  const config = readConfig(rawOptions)

  on('session.start', async ($, e, next) => {
    $.clock.every(config.refreshSeconds * 1000, () => $.ui.invalidate('ui.render'))

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
      if (!agentId) await update($, mainEffort, () => e.effort ?? null)
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
    } catch {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const viewed = e.props.view.agentId
    const [usage, model, cwd, mainEffortSeen, nowMs] = await Promise.all([
      $.session.usage({ breakdown: 'summary' }),
      $.session.model(),
      $.session.cwd(),
      viewed ? Promise.resolve(null) : read($, mainEffort),
      $.clock.now(),
    ])
    const { context, rateLimits, cost } = usage

    const bd = context.breakdown
    let percent = bd ? bd.percentage : (context.percent ?? 0)
    let window = bd ? bd.rawMaxTokens : context.window
    let noReading = !bd && context.percent === undefined
    let label: string | undefined
    let working = e.props.isWorking
    let shownModel: string | undefined = model
    let effort: Effort | null = mainEffortSeen
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

    const columns = e.props.bodyColumns
    const effortText = formatEffort(effort)
    const head = [label, shownModel, effortText ? `· ${effortText}` : undefined].filter(Boolean).join(' ')
    const pathBudget = Math.max(0, columns - head.length - (head ? 1 : 0) - 2)

    const readings = fitReadings(
      {
        percent,
        window,
        noReading,
        plans: rateLimits.filter(r => r.kind === 'five_hour' || r.kind === 'seven_day'),
        spend: rateLimits.find(r => r.kind === 'spend_limit'),
        cost: cost?.usd,
        nowMs,
      },
      columns,
      config,
    )

    return (
      <Box flexDirection="column">
        <Box key="env">
          {label && <Text key="label" bold>{label} </Text>}
          {shownModel && <Text key="model">{shownModel} </Text>}
          {effortText && <Text key="effort" color="suggestion">{`· ${effortText} `}</Text>}
          <Text key="dot" color={working ? 'success' : 'inactive'}>{working ? '● ' : '○ '}</Text>
          <Text key="path" dimColor>{shortenPath(cwd, pathBudget)}</Text>
        </Box>
        <Box key="readings">
          {readings.map(p => (
            <Text key={p.key} color={p.color} dimColor={p.dim} bold={p.bold}>
              {p.text}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
