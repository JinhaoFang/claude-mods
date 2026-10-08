# redact

[English](README.md) | [中文](README.zh-CN.md)

A Claude Code mod: rewrites sensitive data — emails, IP addresses, API keys and credentials, residential addresses — into `[redact:...]` placeholders **before it enters the model context**. The agent reads files, runs commands and loads attachments as usual; what reaches the model and the conversation are placeholders that keep their category, so the model still understands the surrounding context.

## Install

From the GitHub marketplace (type in a Claude Code terminal session):

```
/plugin install redact --marketplace JinhaoFang/claude-mods
```

or from a local folder:

```
/plugin install redact --marketplace /path/to/mods/redact
```

Answer `y` to add the marketplace, pick the user scope, done.

## What it redacts

| category | option | default | matches |
| --- | --- | --- | --- |
| email | `emails` | on | email addresses |
| IPv4 / IPv6 | `ipAddresses` | on | IP addresses |
| credential | `credentials` | on | known key/token shapes (AWS `AKIA`, `ghp_`, `sk-`, `sk-ant-`, `AIza`, `xox-`, JWT/Bearer, private-key blocks) and `.env`-style secret assignments |
| address | `addresses` | on | street-style and Chinese-format residential addresses |
| phone | `phoneNumbers` | off | phone numbers (off by default: bare digit runs false-positive) |

Placeholders keep the category — `[redact:email]`, `[redact:credential]` — so the model can still reason about what kind of value was there.

## Where it washes

The mod hooks the transcript append: every row is rewritten **before it is stored or sent**, so the model and the conversation never see the raw value. Which rows are washed:

- washed by default: tool results, tool-message addenda, attachments (`@file` loads, injected memory), notices, hook context
- never washed: model responses, notes, compaction rows
- washed only with `scrubPrompt`: rows you typed yourself (`prompt` / `command`) — off by default, so the model sees what you asked

Delivery rows (messages from peers, channels, relays) are washed when their origin is a person.

## Residual risks, stated honestly

- Conversation history that existed **before the mod loaded** is out of reach.
- With `scrubPrompt` off (the default), secrets you type yourself pass through.
- The **model context** is clean — verified end to end — but the transcript *file* keeps engine-level records the hook cannot reach (`queue-operation` rows and the `toolUseResult` structured record beside tool results still hold raw values). If your threat model includes the transcript file, redaction at this layer is not enough.

## Usage

- `/redact` prints this session's hit counts per category
- Each redacted row shows a toast (`quiet` suppresses it)

## Configuration

Rows named `redact.*` in `/plugin configure` or `/config`:

| option | default | description |
| --- | --- | --- |
| `emails` | true | Redact email addresses |
| `ipAddresses` | true | Redact IP addresses |
| `credentials` | true | Redact keys and credentials |
| `addresses` | true | Redact residential addresses |
| `phoneNumbers` | false | Redact phone numbers |
| `scrubPrompt` | false | Also scrub typed prompts |
| `quiet` | false | Suppress the per-hit toast |

## Data source

Everything happens on the transcript-append hook inside Claude Code — no subprocesses, no network, no parsing of files on disk. Misses are conservative by design: a rule only fires on a shape it is sure about.

## Development

Contributor rules — the mod contract and the inclusion bar — live in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

```bash
claude plugin validate mods/redact
claude plugin test mods/redact
```

## License

Apache-2.0, under the repository's root [LICENSE](../../LICENSE).
