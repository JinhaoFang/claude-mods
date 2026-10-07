# Provenance

- **Upstream repository:** https://github.com/Charlie0113-T/claude-agent-flow
- **Upstream author:** Charles Tao
- **License:** Apache-2.0
- **Pinned commit:** d87b2559dec03979e088026e8f48aee5f9d2cab5
- **Date adopted:** 2026-10-06

## Local changes

The staged copy excludes upstream's `scripts/` directory. Its `sync-standalone.sh` pushes a git subtree to a sibling repository, and `smoke.sh` runs interactive checks that spend API calls; nothing in the mod imports them. Nothing else differs from upstream.
