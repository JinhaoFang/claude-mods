# redact

[English](README.md) | [中文](README.zh-CN.md)

一个 Claude Code mod：在敏感数据进入模型上下文**之前**，把电子邮件、IP 地址、API 密钥与凭证、居住地址改写为 `[redact:...]` 占位符。agent 照常读文件、执行命令、加载附件；到达模型与对话的是保留类别的占位符，模型仍能理解上下文语境。

## 安装

从 GitHub marketplace 安装（在 Claude Code 终端会话中输入）：

```
/plugin install redact --marketplace JinhaoFang/claude-mods
```

或从本地文件夹安装：

```
/plugin install redact --marketplace /path/to/mods/redact
```

确认 `y` 添加 marketplace，选择 user scope 即可。

## 脱敏类别

| 类别 | 选项 | 默认 | 匹配 |
| --- | --- | --- | --- |
| email | `emails` | 开 | 电子邮件地址 |
| IPv4 / IPv6 | `ipAddresses` | 开 | IP 地址 |
| credential | `credentials` | 开 | 已知形态的 key/token（AWS `AKIA`、`ghp_`、`sk-`、`sk-ant-`、`AIza`、`xox-`、JWT/Bearer、私钥块）与 `.env` 风格的密钥赋值 |
| address | `addresses` | 开 | 街道式与中国格式居住地址 |
| phone | `phoneNumbers` | 关 | 电话号码（默认关：纯数字串误报率高） |

占位符保留类别 —— `[redact:email]`、`[redact:credential]` —— 模型仍能推断原值的类型。

## 洗哪些行

mod 挂在会话记录写入点：每一行在**存入与发送之前**完成改写，模型与对话永远不会看到原始值。行范围：

- 默认洗：工具结果、工具随结果递交的附加行、附件（`@文件` 加载、注入的记忆）、通知、hook 上下文
- 永不洗：模型响应、笔记、压缩行
- 开启 `scrubPrompt` 才洗：你手打的行（`prompt` / `command`）—— 默认关，让模型看到你的原始提问

投递行（来自 peer、频道、中继的消息）在来源是人的时候洗。

## 残余风险，如实声明

- mod 加载**之前**已存在的会话历史，够不到。
- `scrubPrompt` 关闭（默认）时，你自己输入的密钥会原样通过。
- **模型上下文**是干净的 —— 已端到端实测 —— 但转录*文件*层面保留引擎级记录（`queue-operation` 行与工具结果旁的 `toolUseResult` 结构化记录仍存原文），钩子够不到。若你的威胁模型包含转录文件本身，这一层脱敏并不足够。

## 使用

- `/redact` 输出本次会话各类别的命中计数
- 每次命中弹 toast（`quiet` 可关）

## 配置

`/plugin configure` 或 `/config` 中名为 `redact.*` 的行：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `emails` | true | 脱敏电子邮件地址 |
| `ipAddresses` | true | 脱敏 IP 地址 |
| `credentials` | true | 脱敏密钥与凭证 |
| `addresses` | true | 脱敏居住地址 |
| `phoneNumbers` | false | 脱敏电话号码 |
| `scrubPrompt` | false | 同时洗手打的提示词 |
| `quiet` | false | 关闭命中 toast |

## 数据来源

一切都发生在 Claude Code 内部的会话记录写入钩子上 —— 不起子进程、不联网、不解析磁盘上的文件。漏报是刻意的保守：规则只对有把握的形态出手。

## 开发

贡献者规则 —— mod 契约与纳入门槛 —— 见 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

```bash
claude plugin validate mods/redact
claude plugin test mods/redact
```

## 许可

Apache-2.0，随仓库根 [LICENSE](../../LICENSE)。
