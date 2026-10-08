# claude-mods

[English](README.md) | [中文](README.zh-CN.md)

A curated Claude Code marketplace hosting **mods** — plugins whose code registers event handlers. One repository hosts them all; install by mod name.

A mod is a Claude Code plugin whose JavaScript or TypeScript code registers handlers that Claude Code calls as events happen. See the [mods overview](https://code.claude.com/docs/en/plugins/mods/overview).

![context-band preview](mods/context-band/assets/forms.png)

The catalog lists every mod in this marketplace; each entry installs from here.

| mod | description | install |
| --- | --- | --- |
| [context-band](mods/context-band/README.md) | Live band above the prompt: context fill + plan quota / session cost (adapts to login method) | `/plugin install context-band --marketplace JinhaoFang/claude-mods` |
| [block-destructive-commands](mods/block-destructive-commands/README.md) | Denies destructive Bash commands (recursive rm on roots, force push, hard reset, destructive SQL, disk formatting) before they run | `/plugin install block-destructive-commands --marketplace JinhaoFang/claude-mods` |
| [agent-flow](mods/agent-flow/README.md) | Live tree of the session's subagents and teammates in a pane beside the transcript; prints as text where no pane can be drawn | `/plugin install agent-flow --marketplace JinhaoFang/claude-mods` |
| [image-view](mods/image-view/README.md) | Thumbnails of the images you paste above the prompt, instead of bare `[Image #1]` tags | `/plugin install image-view --marketplace JinhaoFang/claude-mods` |
| [redact](mods/redact/README.md) | Rewrites sensitive data (emails, IPs, credentials, addresses) into placeholders before it enters the model context | `/plugin install redact --marketplace JinhaoFang/claude-mods` |

## Install

Mods load only on Claude Code v2.1.287 or later. The one-line form adds the marketplace and installs the plugin together:

```
/plugin install context-band --marketplace JinhaoFang/claude-mods
```

Or add the marketplace once, then install any mod by name:

```
/plugin marketplace add JinhaoFang/claude-mods
/plugin install context-band@claude-mods
```

Type the commands in a Claude Code terminal session, confirm with `y`, and pick the user scope — the mod goes live in the current session.

## Contributing

To propose a mod, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0, see [LICENSE](LICENSE).
