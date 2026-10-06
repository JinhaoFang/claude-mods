# claude-mods

[English](#english) | [中文](#中文)

A curated Claude Code marketplace hosting mods — one repository hosts them all; install by mod name.

![context-band preview](mods/context-band/assets/forms.png)

## English

The catalog lists every mod in this marketplace; each entry installs from here.

| mod | description | install |
| --- | --- | --- |
| [context-band](mods/context-band/README.md#english) | Live band above the prompt: context fill + plan quota / session cost (adapts to login method) | `/plugin install context-band --marketplace JinhaoFang/claude-mods` |
<<<<<<< HEAD
| [block-destructive-commands](mods/block-destructive-commands/README.md) | Denies destructive Bash commands (recursive rm on roots, force push, hard reset, destructive SQL, disk formatting) before they run | `/plugin install block-destructive-commands --marketplace JinhaoFang/claude-mods` |
| [agent-flow](mods/agent-flow/README.md) | Live tree of the session's subagents and teammates in a pane beside the transcript; prints as text where no pane can be drawn | `/plugin install agent-flow --marketplace JinhaoFang/claude-mods` |
| [image-view](mods/image-view/README.md) | Thumbnails of the images you paste above the prompt, instead of bare `[Image #1]` tags | `/plugin install image-view --marketplace JinhaoFang/claude-mods` |

### Install

The one-line install requires Claude Code v2.1.275+:

```
/plugin install context-band --marketplace JinhaoFang/claude-mods
```

On an older Claude Code, add the marketplace first, then install:

```
/plugin marketplace add JinhaoFang/claude-mods
/plugin install context-band@claude-mods
```

Type the command in a Claude Code terminal session, answer `y` to add the marketplace and pick the user scope — it goes live in the current session.

To propose a mod, see [CONTRIBUTING.md](CONTRIBUTING.md).

### License

Apache-2.0, see [LICENSE](LICENSE).

---

## 中文

精选的 Claude Code marketplace，托管多个 mod：一个仓库全部装下，按 mod 名安装。

这里列出 marketplace 中的全部 mod，每条都可通过本 marketplace 安装。

| mod | 说明 | 安装 |
| --- | --- | --- |
| [context-band](mods/context-band/README.md#中文) | 输入框上方的实时带：上下文占用 + 套餐额度 / 会话花费（自适应登录方式） | `/plugin install context-band --marketplace JinhaoFang/claude-mods` |
<<<<<<< HEAD
| [block-destructive-commands](mods/block-destructive-commands/README.md) | 在执行前拦截破坏性 Bash 命令（对根目录递归 rm、强推、hard reset、破坏性 SQL、格式化磁盘） | `/plugin install block-destructive-commands --marketplace JinhaoFang/claude-mods` |
| [agent-flow](mods/agent-flow/README.md) | 输入框旁实时展示会话的子代理与队友树；无法绘制面板时以文本打印 | `/plugin install agent-flow --marketplace JinhaoFang/claude-mods` |
| [image-view](mods/image-view/README.md) | 在输入框上方显示粘贴图片的缩略图，而不是光秃秃的 `[Image #1]` 标签 | `/plugin install image-view --marketplace JinhaoFang/claude-mods` |

### 安装

一行安装需要 Claude Code v2.1.275+：

```
/plugin install context-band --marketplace JinhaoFang/claude-mods
```

旧版 Claude Code 请先添加 marketplace，再安装：

```
/plugin marketplace add JinhaoFang/claude-mods
/plugin install context-band@claude-mods
```

在 Claude Code 终端会话中输入命令，按提示 `y` 添加 marketplace、选择 user scope 回车即可，当次会话立即生效。

想提交 mod，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### License

Apache-2.0，见 [LICENSE](LICENSE)。
