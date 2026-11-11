# image-view

[English](README.md) | [中文](README.zh-CN.md)

Claude Code 的一个 mod，让你看到会话中的图片：你在输入框里粘贴或写出的图片，以及工具替模型读取的图片。终端能画图时直接显示图片本身；其他终端（包括 VS Code 集成终端）显示一个链接，点击后在编辑器或看图软件中打开文件。

## 安装

从 GitHub marketplace 安装（在 Claude Code 终端会话中输入）：

```
/plugin install image-view --marketplace JinhaoFang/claude-mods
```

或从本地文件夹安装：

```
/plugin install image-view --marketplace /path/to/mods/image-view
```

回答 `y` 添加 marketplace，并选择 user 作用域。

## 显示什么

**输入框上方的信息带**，在你编辑输入时显示：

- 你粘贴的图片，即 `[Image #n]` 标签；
- 你输入或拖入的图片路径：绝对路径、相对工作目录的路径、`~/…`、`@…`、`file://…`；在 WSL 下还包括 `C:\Users\…\shot.png`、`\\wsl.localhost\…` 这样的 Windows 路径。

路径要指向一个真实存在的 `.png`、`.jpg`、`.jpeg`、`.gif` 或 `.webp` 文件才会显示，输入到一半的路径不会出现。发送输入或删掉标签后信息带清空。mod 只负责显示，发出去的内容不变。

**对话记录中**，显示在产生图片的工具调用下方：

- `Read` 工具打开的图片，多次读取被折叠成一行时同样显示；
- MCP 工具结果中的图片内容块，例如浏览器截图。

子代理同样适用，它们的图片显示在各自的 agent view 中。完整对话记录（ctrl+o）交给 Claude Code 自己绘制。

## 图片还是链接

| | kitty、Ghostty | 其他终端 |
| --- | --- | --- |
| PNG | 图片本身，下方是文件名和尺寸 | 一行链接 |
| JPEG、GIF、WebP | 一行链接 | 一行链接 |

一行链接形如 `shots/login.png  1280×720`。文件名是指向该文件的超链接，点击（部分终端需 ctrl+点击或 cmd+点击）即可打开原图。MCP 返回的图片背后没有文件，所以这一行只写出工具名，没有链接。

Claude Code 通过 kitty 图形协议画图，所以显示图片需要 kitty 0.28 及以上或 Ghostty。Claude Code 不支持 sixel，因此 VS Code 终端、Windows Terminal 和大多数其他终端显示链接。没有切换模式的设置：mod 在每个会话中检测一次终端能否画图。检测在会话开始后约一秒内完成，在此之前对话记录中显示链接。已打印到滚动区的行无法重画，这样做可以避免在其中留下空白的图片框。

## 安全

mod 只在本地运行。它不发起网络请求，也不写任何文件。它读取输入框内容，以及输入框中提到的或你粘贴的每个图片文件的大小和开头字节。它会列出 Claude Code 的临时文件夹，以找到本会话粘贴的图片。如果没有设置 `CLAUDE_CODE_TMPDIR`，它会运行一次 `id -u` 来确定默认临时文件夹。对话记录中的图片来自 Claude Code 已持有的工具结果，mod 不为它们读取文件。

运行 `claude plugin validate mods/image-view` 可以查看它挂接的每个事件和发起的每个调用。

## 要求

- 支持 mod 的 Claude Code。基于 v2.1.314 构建并测试。
- macOS 或 Linux，包括 WSL。
- 显示图片需要 kitty 0.28+ 或 Ghostty。后台会话默认不画图，除非在 `~/.claude/settings.json` 的 `env` 中设置 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`。
