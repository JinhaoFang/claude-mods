# claude-mods

A curated Claude Code marketplace that hosts mods — some authored here, some adopted from other projects. This glossary fixes the vocabulary used across the repo, its manifests, and its docs.

## Language

**Mod**:
A Claude Code plugin whose JavaScript or TypeScript code registers event handlers that Claude Code calls when an event happens. Every mod is a plugin; not every plugin is a mod.
_Avoid_: addon, extension, widget

**Plugin**:
The unit Claude Code installs from a marketplace. A plugin may hold skills, commands, agents, MCP servers, or mod code.
_Avoid_: package, module, app

**Hook**:
A mod's event handler: a function that runs inside Claude Code when an event fires. Distinct from a *settings hook*, the shell-command or prompt kind configured in a settings file.
_Avoid_: callback, listener, settings hook

**Marketplace**:
The distribution surface a user adds before installing a plugin. This repo is one.
_Avoid_: registry, store, index, feed

**Catalog**:
The human-facing list of this repo's mods. Every catalog entry is installable from this marketplace, and every mod in the marketplace appears in the catalog.
_Avoid_: index, listing, directory

**First-party mod**:
A mod authored in this repo.
_Avoid_: native, built-in, owned

**Third-party mod**:
A mod adopted from another project and shipped here.
_Avoid_: external, imported, contributed

**Vendor**:
To copy a third-party mod's source into this repo as the shipped artifact, instead of pointing at the upstream repository.
_Avoid_: import, mirror, embed, reference

**Provenance**:
The recorded origin of a third-party mod: its upstream repository, author, the commit adopted, its license, and any local changes since.
_Avoid_: attribution, credit, source

**Inclusion bar**:
The criteria a mod must clear before this repo adopts it.
_Avoid_: quality gate, acceptance criteria, bar

**Mod contract**:
The minimum shape a mod must have to live in this repo.
_Avoid_: spec, layout, schema

**Curated**:
Admitted only by a maintainer's judgement against the inclusion bar, never automatically. This repo is curated; a mirror is not.
_Avoid_: awesome, aggregated, crawled

### Mod domain

**Band**:
The resident area a mod draws above the prompt (the engine's `AbovePrompt` site), one or two rows tall.
_Avoid_: status line, strip, widget

**Agent loop**:
One subagent's or teammate's execution loop inside the session, with its own context window, identified by an agentId.
_Avoid_: worker, child session

**Subagent**:
An agent loop started within this session's process, by the model, a person, or a plugin.
_Avoid_: child agent, worker, fork

**Teammate**:
An agent started as a named member of a team. A teammate with a terminal pane of its own is a separate session.
_Avoid_: team member, peer

**Agent view**:
The transcript of one agent loop, opened from the tasks list; the band follows whichever view is on screen.
_Avoid_: subagent session, agent session

**Main conversation**:
The session's top-level loop; the engine's native usage and compact apply to it alone.
_Avoid_: main session, parent session, home session

**Compaction window**:
The window the context percentage measures — where auto-compact fires, below the model's theoretical limit.
_Avoid_: context window, model limit
