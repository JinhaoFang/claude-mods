# image-view

[English](README.md) | [中文](README.zh-CN.md)

A Claude Code mod that shows you the images in a session: the ones you paste or name in the prompt, and the ones a tool reads for the model. Where the terminal can draw pictures you see the image itself. Everywhere else, including the VS Code integrated terminal, you get a link that opens the file in your editor or image viewer.

## Install

From the GitHub marketplace (type in a Claude Code terminal session):

```
/plugin install image-view --marketplace JinhaoFang/claude-mods
```

or from a local folder:

```
/plugin install image-view --marketplace /path/to/mods/image-view
```

Answer `y` to add the marketplace and pick the user scope.

## What it shows

**In the band above the prompt**, while you write:

- images you paste, the `[Image #n]` tags;
- image paths you type or drop into the prompt: absolute, relative to the working directory, `~/…`, `@…`, `file://…`, and on WSL Windows paths such as `C:\Users\…\shot.png` or `\\wsl.localhost\…`.

A path shows only once it names an existing `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp` file, so half-typed paths stay quiet. The band clears when you send the prompt or delete the tag. The mod only shows these images: what you send is unchanged.

**In the transcript**, under the tool call that produced it:

- an image the `Read` tool opened, also when several reads are folded into one line;
- image blocks in an MCP tool's result, such as a browser screenshot.

Subagents count too: their images show in their own agent view. The full transcript (ctrl+o) is left to Claude Code.

## Pictures or links

| | kitty, Ghostty | any other terminal |
| --- | --- | --- |
| PNG | the picture, with its name and size under it | a link line |
| JPEG, GIF, WebP | a link line | a link line |

A link line reads like `shots/login.png  1280×720`. The name is a hyperlink to the file: click it (ctrl+click or cmd+click in some terminals) to open it at full size. On WSL the click goes to Windows, which opens the file through the `\\wsl.localhost\<distro>\…` share in its default image viewer. An MCP image has no file behind it, so its line names the tool and has no link.

Claude Code draws pictures through the kitty graphics protocol, so pictures need kitty 0.28 or later, or Ghostty. Claude Code supports no sixel, so the VS Code terminal, Windows Terminal and most others get link lines. There is no setting to switch modes: the mod checks once per session whether the terminal draws a picture. Until that check answers, a second or so after the session starts, the transcript shows link lines. A row printed to the scrollback cannot be redrawn, so this keeps empty picture boxes out of it.

## Security

The mod is local-only. It makes no network requests and writes no files. It reads the prompt box, and the size and first bytes of each image file the prompt names or you paste. It lists Claude Code's temp folder to find the session's pasted images. If `CLAUDE_CODE_TMPDIR` isn't set, it runs `id -u` once to find the default temp folder. Images in the transcript come from the tool results Claude Code already holds; the mod reads no file for them.

Run `claude plugin validate mods/image-view` to see every event it hooks and every call it makes.

## Requirements

- Claude Code with mods support. Built and tested against v2.1.314.
- macOS or Linux, including WSL.
- For pictures: kitty 0.28+ or Ghostty. A background session draws no pictures unless `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` is set in the `env` block of `~/.claude/settings.json`.
