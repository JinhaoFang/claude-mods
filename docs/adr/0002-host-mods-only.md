# 0002: Host mods only

This marketplace hosts **mods only** — plugins whose code registers event handlers — not general plugins. Pinning the scope to mods makes the repo's name match its contents and lets `claude plugin test` apply to every entry, since every mod ships `hooks/*.test.ts(x)`. General plugins (skills, commands, agents, MCP servers) are out of scope and belong in a general marketplace.
