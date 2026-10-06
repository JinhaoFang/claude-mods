## What changed

<!-- A short summary of the change and why it is needed. -->

## Resolves

<!-- The ticket or spec this PR closes, e.g. "Closes #4" or "Part of #1". -->

## How it was verified

<!--
The commands you ran and their result, e.g.:
- `node scripts/check.mjs`
- `claude plugin test mods/<name>`
-->

## Mod checklist

Complete this section when adding or adopting a mod; otherwise delete it.
The [mod contract](../CONTRIBUTING.md) and [inclusion bar](../CONTRIBUTING.md) are the authority.

- [ ] The mod meets the mod contract: a manifest, `hooks/hooks.json`, `hooks/register.ts(x)`, `hooks/*.test.ts(x)`, and a `README.md`.
- [ ] The mod clears the inclusion bar: an allowed license (MIT / Apache-2.0 / BSD-2 / BSD-3 / ISC / 0BSD / MPL-2.0 case by case) and the reputation floor (upstream ≥100 stars or ≥14 days old).
- [ ] A third-party mod is vendored with its provenance recorded — upstream repository, author, license, pinned commit, date adopted, and any local changes — alongside a copy of the upstream license.
- [ ] The marketplace entry and the catalog agree both ways.
