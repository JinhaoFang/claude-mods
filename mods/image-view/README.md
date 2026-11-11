# image-view

[English](README.md) | [中文](README.zh-CN.md)

A Claude Code mod that shows you the images in a session: the ones you paste or name in the prompt, and the ones a tool reads for the model. Where the terminal draws pictures you see the image itself. Everywhere else, including the VS Code integrated terminal, a PNG is drawn as a thumbnail in colored blocks. Every image also gets a link that opens the file.

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

## Pictures, blocks or links

| | kitty, Ghostty | any other terminal (VS Code, Windows Terminal, iTerm2, tmux, …) |
| --- | --- | --- |
| PNG | the picture | a block thumbnail |
| JPEG, GIF, WebP | a link line | a link line |

A block thumbnail packs four pixels into each cell: a quadrant block (`▘`, `▚`, `▙`, …) in the two colors that draw them best. It is low resolution, but it is the picture. Claude Code draws only 256 colors in VS Code's terminal and rounds each color to the palette on its own, which turns a pale blue cyan and breaks light grays into patches; there the mod picks the palette color that looks closest (in OKLab) itself. The mod decodes the PNG itself; JPEG, GIF and WebP would each need a decoder of their own, so they get a link line only.

Under every picture or thumbnail, and on its own for other formats, is a line like `shots/login.png  1280×720`. The name is a hyperlink to the file: click it (ctrl+click or cmd+click in some terminals) to open it at full size. On WSL the click goes to Windows, which opens the file through the `\\wsl.localhost\<distro>\…` share in its default image viewer. An MCP image has no file behind it, so its line names the tool and has no link.

Claude Code draws pictures through the kitty graphics protocol, in kitty 0.28 or later and Ghostty, and not inside tmux or screen, over ssh, or in background sessions. It doesn't tell mods whether it will, so the mod reads the same environment it decides from (`TERM`, `TERM_PROGRAM`, `TMUX`, …). `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` makes both draw pictures anyway.

## Security

The mod is local-only. It makes no network requests and writes no files. It follows the prompt box, and reads each PNG the prompt names or you paste (up to 4 MiB) to learn its size and, where pictures aren't drawn, to decode a thumbnail in memory. It lists Claude Code's temp folder to find the session's pasted images. If `CLAUDE_CODE_TMPDIR` isn't set, it runs `id -u` once to find the default temp folder. Images in the transcript come from the tool results Claude Code already holds; the mod reads no file for them.

Run `claude plugin validate mods/image-view` to see every event it hooks and every call it makes.

## Requirements

- Claude Code with mods support. Built and tested against v2.1.314.
- macOS or Linux, including WSL.
- For pictures: kitty 0.28+ or Ghostty. Elsewhere, any terminal with 256 colors or more for the block thumbnails.
