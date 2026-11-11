# claude-mods

[English](README.md) | [中文](README.zh-CN.md)

精选的 Claude Code marketplace，托管 **mod**——代码注册事件处理函数的 Claude Code 插件。一个仓库全部装下，按 mod 名安装。

mod 是一种 Claude Code 插件：它的 JavaScript / TypeScript 代码注册处理函数，Claude Code 在事件发生时调用它们。见[官方 mods 文档](https://code.claude.com/docs/en/plugins/mods/overview)。

下表列出本 marketplace 的全部 mod，每条都可从这里安装。

| mod | 说明 | 安装 |
| --- | --- | --- |
| [context-band](mods/context-band/README.zh-CN.md) | 输入框上方的只读信息带：模型与思考强度、上下文占用，以及颜色各异、各带重置时间的 5h / 7d 套餐额度，或会话花费 | `/plugin install context-band --marketplace JinhaoFang/claude-mods` |
| [block-destructive-commands](mods/block-destructive-commands/README.md) | 在执行前拦截破坏性 Bash 命令（对根目录递归 rm、强推、hard reset、破坏性 SQL、格式化磁盘） | `/plugin install block-destructive-commands --marketplace JinhaoFang/claude-mods` |
| [agent-flow](mods/agent-flow/README.md) | 输入框旁实时展示会话的子代理与队友树；无法绘制面板时以文本打印 | `/plugin install agent-flow --marketplace JinhaoFang/claude-mods` |
| [image-view](mods/image-view/README.zh-CN.md) | 预览图片：输入框上方显示粘贴的图片和你输入或拖入的路径，对话记录中在读取图片的工具调用下方显示；kitty 和 Ghostty 中直接画图，其他终端中画成色块缩略图，并附带可打开文件的链接 | `/plugin install image-view --marketplace JinhaoFang/claude-mods` |
| [redact](mods/redact/README.zh-CN.md) | 在敏感数据进入模型上下文之前改写为占位符（邮箱、IP、凭证、地址、电话）；准确优先，不误伤 DOI、哈希和版本号 | `/plugin install redact --marketplace JinhaoFang/claude-mods` |

## 预览

有可视化界面的 mod 在这里附图；只处理事件、没有界面的 mod（block-destructive-commands、redact）不放图。

### context-band

信息带的四种状态，由 mod 自身的输出绘制：

![context-band：输入框上方信息带的四种状态](mods/context-band/assets/band.png)

### agent-flow

一个有四个子代理的会话在面板中的各行，由 mod 自身的输出绘制：

![agent-flow：子代理树，含状态、工具与 token](docs/assets/agent-flow.png)

### image-view

在不能画图的终端（例如 VS Code 终端）里，PNG 画成四分块色块：一张 320×160 的测试图画在 48×12 个字符格中，由 mod 自身的输出绘制。kitty 和 Ghostty 中直接显示图片本身。

![image-view：PNG 画成色块缩略图](mods/image-view/assets/blocks.png)

## 安装

mod 需要 Claude Code v2.1.287 或更高版本。一行式命令同时添加 marketplace 并安装插件：

```
/plugin install context-band --marketplace JinhaoFang/claude-mods
```

也可以先添加 marketplace，再按 mod 名安装：

```
/plugin marketplace add JinhaoFang/claude-mods
/plugin install context-band@claude-mods
```

在 Claude Code 终端会话中输入命令，按提示 `y` 确认、选择 user scope，当次会话立即生效。

## 贡献

想提交 mod，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

Apache-2.0，见 [LICENSE](LICENSE)。
