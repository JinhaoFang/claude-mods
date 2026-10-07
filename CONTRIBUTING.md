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
node scripts/check.mjs                        # the repo-wide check: validates every mod and the marketplace, runs each mod's tests, asserts mods, entries, and the README catalog agree
```

## Mod contract

Every mod, first-party or third-party, must ship these:

| file | purpose |
| --- | --- |
| `.claude-plugin/plugin.json` | the mod's manifest |
| `hooks/hooks.json` | the event-handler registration the engine reads |
| the entry module | the mod's code, in whichever file `hooks/hooks.json` declares — conventionally `hooks/register.ts` or `hooks/register.tsx` |
| the mod's tests | **required** — `*.test.ts` or `*.test.tsx`, under `hooks/` or a sibling `tests/` directory |
| `README.md` | what the mod does and how to install it |

The entry module is not pinned to a filename. Its path is whatever the mod's own `hooks/hooks.json` declares, and that declaration is the contract; most mods conventionally name it `register.*`, but a mod that declares e.g. `hooks/block-destructive-commands.ts` satisfies the contract unchanged.

Tests are **required**, but their location is free: a mod may keep them alongside its code under `hooks/`, or in a sibling `tests/` directory. `claude plugin test` discovers test files anywhere under the mod folder, so either placement is picked up by the repo-wide check.

A **vendored** mod that ships no upstream tests receives a test **we author**, added as a **new** file. Upstream files are never edited to satisfy the contract; the addition is recorded in the provenance record's local-changes field.

A **third-party mod** (one adopted from another project) additionally ships:

- a provenance record — `mods/<name>/PROVENANCE.md`
- a copy of the upstream license — `mods/<name>/LICENSE`

A first-party mod ships neither: it is authored here and covered by the repo's own [`LICENSE`](LICENSE).

## Inclusion bar

A third-party mod must clear the following before this repo adopts it. A first-party mod is authored here and is not subject to the bar.

**License whitelist.** The upstream license must be one of:

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC
- 0BSD
- MPL-2.0 — assessed case by case

**Rejected outright:** the GPL family, no license, and source-available licenses (a license that forbids redistribution or restricts use by field).

**Self-containment.** The mod folder alone, vendored, must work with only Claude Code installed. It must not depend on a companion binary, CLI, or service that the mod's own project ships separately. General-purpose bases that any machine already has — `git`, `node` — do not count against it; the line is between a base already present and a companion the upstream project exists to distribute. A mod that draws on `git` or runs on `node` is self-contained; one that shells out to a terminal browser, board UI, or plan-renderer CLI its own project ships is not.

**Reputation.** Judge the upstream on **community-adoption evidence**, not on a star count alone. That evidence includes independent forks, downstream packaging (Nix, Homebrew, dotfiles), third-party evaluations, distribution counts, and the mod's own issue traffic. The floor is **≥ 100 stars** OR **≥ 14 days old** at the time of the proposal — a floor, not a substitute for evidence. **Host-repository stars are not a signal**: a mod hosted inside a large, popular project borrows that project's stars without earning them.

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
