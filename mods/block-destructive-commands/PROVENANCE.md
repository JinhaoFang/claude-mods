# Provenance — block-destructive-commands

This third-party mod is **vendored**: its upstream source is copied into this
repository as the shipped artifact, rather than referenced from the upstream
repository. See [ADR 0001](../../docs/adr/0001-vendor-third-party-mods.md).

## Upstream

| field | value |
| --- | --- |
| repository | https://github.com/davila7/claude-code-templates |
| subpath | `cli-tool/components/mods/security/block-destructive-commands` |
| author | claude-code-templates (https://www.aitmpl.com) |
| license | MIT (© 2025 Daniel (San) Ávila) |
| pinned commit | `375af9018a40e330e81542f59054daaa088c21aa` |
| date adopted | 2026-10-06 |

The upstream license is copied verbatim to [`LICENSE`](LICENSE) beside this
record. The vendored files are byte-for-byte the upstream files at the pinned
commit:

- `.claude-plugin/plugin.json`
- `README.md`
- `hooks/hooks.json`
- `hooks/block-destructive-commands.ts`

## Local changes

The upstream mod ships no tests. One test has been added by us, as a **new**
file; no upstream file is modified:

- `tests/block-destructive-commands.test.ts` — exercises the mod's external
  behaviour: a destructive Bash command is denied, an ordinary one passes
  through. It does not test the guard's internal pattern list.

No other local changes. The upstream files listed above are otherwise
unmodified.
