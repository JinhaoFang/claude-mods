# context-band

[English](README.md) | [中文](README.zh-CN.md)

A Claude Code mod: a live band above the prompt showing the session's **context fill**, adapting between **subscription plan quota** (official OAuth login) and **session cost** (API key / gateway) by what the engine reports.

![preview](assets/forms.png)

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

## What it shows

- The context percentage measures the **compaction window** (auto-compact fires earlier than the model's theoretical limit — this is closer to "how much conversation is left")
- The two subscription windows carry no labels; their colours tell them apart: the 5-hour window is the `suggestion` colour, the 7-day window the `remember` colour. `↺` is the countdown to the nearest reset
- Colour thresholds default to <60% green, 60–85% yellow, ≥85% red (adjustable in `/config`)
- No hard-coded login-method check: `five_hour`/`seven_day` readings present → plan form; otherwise → cost form (a gateway's `spend_limit` is appended when reported)

## Configuration

Rows named `context-band.*` in `/config`:

| option | default | description |
| --- | --- | --- |
| `warningThreshold` | 60 | Percent where colours turn to warning |
| `errorThreshold` | 85 | Percent where colours turn to error |
| `refreshSeconds` | 7 | Fallback redraw interval; turn ends update the band at once |
| `showCost` | true | Show the session cost when no plan quota is reported |
| `showResetIn` | true | Show the nearest plan-window reset countdown |

## Data source

Everything comes from the engine-native `$.session.usage()` (a free local call, no network requests); turn ends push a `session.measure` event that redraws the band. It never parses the transcript and depends on no third-party tool. The cost shown is what **this session** has spent — account-level totals are not reachable through the plugin API.

## Usage

- The `[ Hide ]` button hides the band for this session; `/context-band` brings it back
- Uninstall: `claude plugin uninstall context-band`

## Development

Contributor rules — the mod contract and the inclusion bar — live in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

```bash
claude plugin validate mods/context-band
claude plugin test mods/context-band
```

## License

Apache-2.0, under the repository's root [LICENSE](../../LICENSE).
