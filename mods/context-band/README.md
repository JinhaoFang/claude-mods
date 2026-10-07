# context-band

[English](README.md) | [中文](README.zh-CN.md)

A Claude Code mod: a view-aware band above the prompt. An environment row (model, effort, working dot, directory) sits above a readings row (context gauge, plan quota, reset countdown, cost), and the band follows whichever conversation is on screen — the main conversation, or one agent loop's transcript from the tasks list.

## Install

From the GitHub marketplace (type in a Claude Code terminal session):

```
/plugin install context-band --marketplace JinhaoFang/claude-mods
```

or from a local folder:

```
/plugin install context-band --marketplace /path/to/mods/context-band
```

Answer `y` to add the marketplace, pick the user scope, done — it goes live in the current session.

## The band

Two rows:

- **Environment row** — who and where: the model name with a five-cell effort scale beside it (filled low → max), a working dot (`●` running, `○` idle), the session directory in dim colour, and the button group `Hide · ⟲ Compact · ⚙ · ▾`. In an agent view the row leads with the viewed loop's identity label and shows that loop's model and effort instead.
- **Readings row** — everything numeric: the context gauge, the plan quota bars, the reset countdown, and the cost. Nothing in this row truncates; on narrow terminals the directory gives way first — last two segments while they fit, then the last one — and the readings and buttons stay whole.

### The context gauge

- The percentage measures the **compaction window** — where auto-compact fires, below the model's theoretical limit — so the number reads as "how much conversation is left"
- Colour thresholds default to <60% green, 60–85% yellow, ≥85% red; tune them in `/config` or in the band's settings area

### Plan quota and cost

No hard-coded login-method check: when the engine reports subscription windows, the band draws the two quota bars — the 5-hour window in the `suggestion` colour, the 7-day window in `remember`, told apart by colour, no labels — with `↺` counting down to the nearest reset. When it reports none, the band shows this session's cost instead, with a gateway's spend-limit bar appended when reported.

## Agent views

Open one agent loop's transcript from the tasks list and the band follows the view:

- The gauge shows that loop's own context fill, labelled by its name, else its agent type, else a short id — so you always know whose numbers you are reading
- Its model and effort scale replace the main conversation's, so a delegate on a different model stands out; the working dot follows that loop's status
- The plan quota bars, the reset countdown, and the cost stay on the readings row — account-level readings belong to every view
- A loop with no completed step yet shows a dim placeholder, never a number it does not have
- The main conversation keeps the engine's native readings throughout; where the per-agent figures come from is recorded in [ADR-0004](../../docs/adr/0004-agent-view-context-from-turn-steps.md)

Teammates with a terminal pane of their own run a separate session with a band of its own; nothing here changes for them.

## States

- **Expanded** — the two-row band
- **Collapsed** — `▾` folds the band into a pill, `◂ 44.4%` — the on-screen view's percent, with the viewed loop's short label in an agent view; pressing the pill expands again
- **Hidden** — `Hide` removes the band until you bring it back

Collapsed and hidden persist across sessions. The `/context-band` command restores the band, expanded.

## Compact

`⟲ Compact` exists in the main conversation only — the engine's compact call has no per-agent form, so agent views draw no compact button at all. The first press turns it into `Confirm`; the second press compacts; a few seconds without the second press reverts it. A running turn finishes before compaction starts.

## Settings

The `⚙` button swaps the readings row for the settings area; `Done` or a second `⚙` closes it.

- Steppers: `Warn` and `Error` step by five, `Refresh` seconds steps by one; every value clamps
- Warning always stays below error: raising warning lifts error out of the way, lowering error drops warning with it
- Toggles: `Model & effort`, `Reset ↺`, `Cost` — each flips on press
- A changed value lives in the plugin store and persists across sessions; a `/config` option applies only until its matching row is changed

A hot reload or a session restart closes the settings area; the values you changed stay.

## Configuration

Rows named `context-band.*` in `/config`:

| option | default | description |
| --- | --- | --- |
| `warningThreshold` | 60 | Percent where colours turn to warning |
| `errorThreshold` | 85 | Percent where colours turn to error |
| `refreshSeconds` | 7 | Fallback redraw interval; turn ends update the band at once |
| `showEffort` | true | Show the model name and its effort scale |
| `showCost` | true | Show the session cost when no plan quota is reported |
| `showResetIn` | true | Show the nearest plan-window reset countdown |

Each option holds until the matching settings row is changed; the settings value then shadows it, and it stays shadowed until you change the row again.

## Data source

The main conversation's figures come from the engine-native `$.session.usage()` — a free local call; turn ends push a redraw, and a fallback clock covers the gaps at `refreshSeconds`. An agent view's figures are accumulated from that loop's completed `turn.step` requests, because the engine exposes no per-agent usage — the reasoning is recorded in [ADR-0004](../../docs/adr/0004-agent-view-context-from-turn-steps.md). The mod spawns no subprocesses and makes no network requests. The cost shown is what **this session** has spent — account-level totals are not reachable through the plugin API.

## Usage

- `▾` collapses the band to the pill; press the pill to expand
- `Hide` hides the band; `/context-band` brings it back, expanded
- `⟲ Compact` compacts the main conversation, two-step
- `⚙` opens the settings area
- Uninstall: `claude plugin uninstall context-band`

## Development

Contributor rules — the mod contract and the inclusion bar — live in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

```bash
claude plugin validate mods/context-band
claude plugin test mods/context-band
```

## License

Apache-2.0, under the repository's root [LICENSE](../../LICENSE).
