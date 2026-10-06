# claude-mods

A curated Claude Code marketplace hosting **mods** — plugins whose code registers event handlers. One repo, one marketplace manifest; each mod lives in its own folder under `mods/`. `GLOSSARY.md` fixes the vocabulary (mod, plugin, vendor, first-party / third-party, and the rest) — use its terms, not synonyms.

## Development

Requires Node and the Claude Code CLI.

- `claude plugin validate --strict mods/<name>` — validate a mod's manifest and print the `hooks:` / `calls:` it declares
- `claude plugin test mods/<name>` — run the mod's `*.test.ts(x)`
- `claude plugin validate --strict .` — validate the marketplace manifest
- `node scripts/check.mjs` — the repo-wide check: validate every mod, validate the marketplace manifest, and assert `mods/*` and the entries agree both ways

The engineering skills come from `mattpocock/skills`. Set them up once per machine:

```bash
npx skills install                 # restore the pinned set from skills-lock.json
npx skills add mattpocock/skills   # or install the set fresh
```

The mod contract, the inclusion bar for third-party mods, and the steps to add a mod live in `CONTRIBUTING.md`.

## Agent skills

### Issue tracker

Issues and specs live in this repo's GitHub Issues, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, under their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
