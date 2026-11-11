# image-view

[English](README.md) | [中文](README.zh-CN.md)

Claude Code 的一个 mod，让你看到会话中的图片：你在输入框里粘贴或写出的图片，以及工具替模型读取的图片。终端能画图时直接显示图片本身；其他终端（包括 VS Code 集成终端）把 PNG 画成彩色色块缩略图。每张图片还附带一个可打开文件的链接。

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

## 图片、色块还是链接

| | kitty、Ghostty | 其他终端（VS Code、Windows Terminal、iTerm2、tmux 等） |
| --- | --- | --- |
| PNG | 图片本身 | 色块缩略图 |
| JPEG、GIF、WebP | 一行链接 | 一行链接 |

色块缩略图在每个字符格里放四个像素：用最能表现它们的两种颜色画一个四分块字符（`▘`、`▚`、`▙` 等）。分辨率低，但确实是这张图。Claude Code 在 VS Code 终端里只画 256 色，并且逐个通道把颜色四舍五入到调色板，淡蓝会变成青色，浅灰会碎成色斑；因此在那里由 mod 自己挑选看起来最接近的调色板颜色（按 OKLab 计算）。PNG 由 mod 自己解码；JPEG、GIF、WebP 各自需要单独的解码器，所以只显示链接。

每张图片或缩略图下方（其他格式则单独一行）有一行形如 `shots/login.png  1280×720` 的文字。文件名是指向该文件的超链接，点击（部分终端需 ctrl+点击或 cmd+点击）即可打开原图。在 WSL 下，点击交给 Windows 处理，它通过 `\\wsl.localhost\<发行版>\…` 共享用默认看图软件打开文件。MCP 返回的图片背后没有文件，所以这一行只写出工具名，没有链接。

Claude Code 通过 kitty 图形协议画图，只在 kitty 0.28 及以上和 Ghostty 中生效，在 tmux、screen、ssh 和后台会话中不画。它不告诉 mod 会不会画，所以 mod 读取它判断所依据的同一组环境变量（`TERM`、`TERM_PROGRAM`、`TMUX` 等）。设置 `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` 会让两者都强制画图。

## 安全

mod 只在本地运行。它不发起网络请求，也不写任何文件。它跟随输入框内容，并读取输入框中提到的或你粘贴的每个 PNG（最大 4 MiB），以获得尺寸；在不画图的终端里还会在内存中解码出缩略图。它会列出 Claude Code 的临时文件夹，以找到本会话粘贴的图片。如果没有设置 `CLAUDE_CODE_TMPDIR`，它会运行一次 `id -u` 来确定默认临时文件夹。对话记录中的图片来自 Claude Code 已持有的工具结果，mod 不为它们读取文件。

运行 `claude plugin validate mods/image-view` 可以查看它挂接的每个事件和发起的每个调用。

## 要求

- 支持 mod 的 Claude Code。基于 v2.1.314 构建并测试。
- macOS 或 Linux，包括 WSL。
- 显示图片需要 kitty 0.28+ 或 Ghostty；其他终端需要支持 256 色及以上才能显示色块缩略图。
