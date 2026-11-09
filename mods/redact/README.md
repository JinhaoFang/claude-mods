# redact

[English](README.md) | [中文](README.zh-CN.md)

A Claude Code mod that rewrites sensitive data (emails, IP addresses, API keys and credentials, residential addresses, phone numbers) into `[redact:...]` placeholders **before it enters the model context**. The agent reads files, runs commands and loads attachments as usual. What reaches the model are placeholders that keep their category, so the model still understands the text around them.

## Install

From the GitHub marketplace (type in a Claude Code terminal session):

```
/plugin install redact --marketplace JinhaoFang/claude-mods
```

or from a local folder:

```
/plugin install redact --marketplace /path/to/mods/redact
```

Answer `y` to add the marketplace and pick the user scope.

## Precision first

Every rule fires only on a shape it can stand behind. A missed value leaks one value. A false hit is worse: it silently changes what the model reads, and the model may write that change back into your files. In particular:

- **Phone numbers** need a structure: a `+` country code, a Chinese mobile number (`1[3-9]` plus 9 digits), a separated North American number (`415-555-0132`, `(415) 555-0132`), a Chinese landline (`010-62345678`), or a label in front (`Tel:`, `Phone:`, or the Chinese labels for phone and mobile). A bare run of digits is never a phone number, so commit hashes, IDs, timestamps and DOIs are left alone.
- **Protected spans** are never touched by the personal-data rules: DOIs (`10.1371/journal.pone.0123456`), arXiv ids, ISBNs, PMIDs, UUIDs, and ISO dates and timestamps.
- **IPv4** skips version numbers (`5.15.167.4-microsoft`, `v1.2.3.4`, longer dotted runs), loopback, `0.0.0.0`, netmasks and the documentation ranges.
- **IPv6** candidates are parsed, not pattern-matched: clock times, MAC addresses, slices such as `xs[1::2]` and C++ or Rust paths such as `Face::Add` stay as written.
- **Emails** skip `icon@2x.png`-style file names, `example.com` and other documentation domains, `git@host:repo` remotes, and noreply addresses.
- **Labelled secrets** (`password=`, `API_KEY=`) skip references and code: `${VAR}`, `process.env.X`, `getpass()`, `Optional[str]`, `your-api-key-here`, `changeme`. A `key` or `token` value must also look random.

## What it redacts

| category | option | default | matches |
| --- | --- | --- | --- |
| email | `emails` | on | email addresses |
| IPv4 / IPv6 | `ipAddresses` | on | public and private host addresses |
| credential | `credentials` | on | known key shapes (AWS `AKIA`/`ASIA`, GitHub `ghp_`/`github_pat_`, GitLab `glpat-`, `sk-ant-`, `sk-proj-`, Stripe, Hugging Face, npm, SendGrid, Slack, Google `AIza`), JWTs, `Bearer` tokens, `scheme://user:password@` passwords, private key blocks, and labelled secret assignments |
| address | `addresses` | on | street addresses with capitalised street words (`221 Baker Street`), and Chinese addresses with a road name and a door number, optionally followed by building and room |
| phone | `phoneNumbers` | on | the structured shapes listed above |

Placeholders keep the category (`[redact:email]`, `[redact:credential]`), so the model can still reason about what kind of value was there.

## Where it washes

The mod hooks the transcript append, so every row is rewritten **before it is stored or sent**. Which rows are washed:

- **Always**: tool results, tool-message addenda, attachments (`@file` loads, injected memory), notices, hook context.
- **Never**: model responses, notes, compaction rows.
- **Only with `scrubPrompt`**: rows you typed yourself (`prompt`, `command`, queued prompts). This is off by default so the model sees what you asked.
- **Deliveries** (messages from peers, channels, relays) are washed unless a person sent them.

## Placeholders are not file content

A model that reads `[redact:email]` and writes it back would overwrite the real value in your file. The mod guards against this in two ways:

- A system-prompt section tells the model that placeholders stand for real values still in the file, and that it should edit around them.
- A guard on `Write` and `Edit` refuses a write that would put more placeholders into a file than the file already holds. Editing text that only mentions placeholders, such as this README, is allowed while the count stays the same.

## Usage

- `/redact` prints this session's hit counts per category.
- `/redact off` pauses washing and the write guard for the rest of the session, for when a rule gets in the way. `/redact on` resumes.
- Each redacted row shows a toast; `quiet` turns it off.

## Configuration

Rows named `redact.*` in `/plugin configure` or `/config`:

| option | default | description |
| --- | --- | --- |
| `emails` | true | Redact email addresses |
| `ipAddresses` | true | Redact IP addresses |
| `credentials` | true | Redact keys and credentials |
| `addresses` | true | Redact residential addresses |
| `phoneNumbers` | true | Redact phone numbers |
| `scrubPrompt` | false | Also scrub typed prompts |
| `quiet` | false | Suppress the per-row toast |

## Residual risks

- Conversation history that existed **before the mod loaded** is out of reach.
- With `scrubPrompt` off (the default), secrets you type yourself pass through.
- Precision first means some values are missed by design: an unlabelled phone number with no separators and no country code, a password that is a bare word, or a secret in a format no rule knows.
- The **model context** is clean, but the transcript *file* keeps engine-level records the hook cannot reach: the `toolUseResult` structured record beside tool results still holds raw values. If your threat model includes the transcript file, redaction at this layer is not enough.

## Data source

Everything happens in hooks inside Claude Code: no subprocesses, no network requests. The write guard reads the target file only to count the placeholders it already holds.

## Development

Contributor rules, including the mod contract and the inclusion bar, live in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

```bash
claude plugin validate mods/redact
claude plugin test mods/redact
```

The detection engine lives in `hooks/rules.ts`, a pure module, and `hooks/rules.test.ts` holds its matrix of shapes that must and must not be rewritten. The wiring (door policy, write guard, `/redact`) lives in `hooks/register.ts`.

## License

Apache-2.0, under the repository's root [LICENSE](../../LICENSE).
