# Contributing to claude-mods

`claude-mods` is a curated Claude Code marketplace that hosts **mods** — plugins whose JavaScript or TypeScript code registers event handlers. This document is the contributor guide: it states the mod contract, the inclusion bar, the provenance requirement for third-party mods, and the steps to add a mod. The repo's vocabulary is fixed in [`GLOSSARY.md`](GLOSSARY.md); use its terms (mod, plugin, vendor, provenance, inclusion bar, mod contract, first-party, third-party) rather than synonyms.

Community pull requests **propose** a mod; a maintainer **decides** whether it clears the inclusion bar. Admission is by a maintainer's judgement, never automatic.

## Development environment

Requires Node and the Claude Code CLI. The engineering skills come from `mattpocock/skills`; set them up once per machine:

```bash
npx skills install                 # restore the pinned set from skills-lock.json
npx skills add mattpocock/skills   # or install the set fresh
```

Run the repo-wide verification before opening a pull request:

```bash
claude plugin validate --strict mods/<name>   # validate a mod's manifest; prints its hooks: / calls:
claude plugin test mods/<name>                # run the mod's *.test.ts(x)
claude plugin validate --strict .             # validate the marketplace manifest
node scripts/check.mjs                        # the repo-wide check: validates every mod and the marketplace, asserts they agree
```

## Mod contract

Every mod, first-party or third-party, must ship exactly these files:

| file | purpose |
| --- | --- |
| `.claude-plugin/plugin.json` | the mod's manifest |
| `hooks/hooks.json` | the event-handler registration the engine reads |
| `hooks/register.ts` or `hooks/register.tsx` | the mod's code |
| `hooks/*.test.ts` or `hooks/*.test.tsx` | the mod's tests — **mandatory** |
| `README.md` | what the mod does and how to install it |

A **third-party mod** (one adopted from another project) additionally ships:

- a provenance record — `mods/<name>/PROVENANCE.md`
- a copy of the upstream license — `mods/<name>/LICENSE`

A first-party mod ships neither: it is authored here and covered by the repo's own [`LICENSE`](LICENSE).

## Inclusion bar

A third-party mod must clear both of the following before this repo adopts it. A first-party mod is authored here and is not subject to the bar.

**License whitelist.** The upstream license must be one of:

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC
- 0BSD
- MPL-2.0 — assessed case by case

**Rejected outright:** the GPL family, no license, and source-available licenses (a license that forbids redistribution or restricts use by field).

**Reputation floor.** The upstream must have **≥ 100 stars** OR be **≥ 14 days old** at the time of the proposal.

A proposer checks these rules against the upstream before opening a pull request. A maintainer makes the final call.

## Provenance for third-party mods

A vendored third-party mod records, in `mods/<name>/PROVENANCE.md`:

- the upstream repository URL
- the upstream author
- the license name
- the **pinned commit sha** that was adopted
- the date adopted
- any local changes made since adoption

The record ships alongside a copy of the upstream license at `mods/<name>/LICENSE`.

## Adding a new mod

1. Create the mod's folder under `mods/`: `mods/<name>/`.
2. Ship the mod contract files listed above. For a third-party mod, add the provenance record and the upstream license copy.
3. Add one entry to `plugins` in the root `.claude-plugin/marketplace.json`. The entry's `name` must match the mod's own `plugin.json` `name`, and its `source` is the mod's folder:

```json
{ "name": "<name>", "source": "./mods/<name>" }
```

4. Run the repo-wide check: `node scripts/check.mjs`.

## Pull request flow

Fork the repo, branch off `main`, and open a pull request. Run `node scripts/check.mjs` locally first — CI runs the same script, and a green pull request is labelled `ready-for-agent`. A maintainer reviews every change against the mod contract and the inclusion bar.
