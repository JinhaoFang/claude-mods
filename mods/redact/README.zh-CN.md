# redact

[English](README.md) | [中文](README.zh-CN.md)

Claude Code 的一个 mod：在敏感数据**进入模型上下文之前**，把它改写成 `[redact:...]` 占位符。敏感数据包括邮箱、IP 地址、API key 与凭证、居住地址、电话号码。agent 照常读文件、跑命令、加载附件，模型看到的是保留了类别的占位符，所以仍然能理解上下文。

## 安装

从 GitHub marketplace 安装（在 Claude Code 终端会话中输入）：

```
/plugin install redact --marketplace JinhaoFang/claude-mods
```

或从本地文件夹安装：

```
/plugin install redact --marketplace /path/to/mods/redact
```

按提示输入 `y` 添加 marketplace，选择 user scope 即可。

## 准确优先

每条规则只在有把握的形态上触发。漏掉一个值，泄露的就是这一个值；误伤更糟：它会悄悄改掉模型读到的内容，模型还可能把改动写回你的文件。具体来说：

- **电话号码**必须有结构：`+` 国家码、中国手机号（`1[3-9]` 加 9 位）、带分隔符的北美号码（`415-555-0132`、`(415) 555-0132`）、中国座机（`010-62345678`），或者前面有标签（`Tel:`、`电话：`）。纯数字串永远不算电话号码，所以 commit hash、ID、时间戳和 DOI 都不会被误伤。
- **受保护片段**不会被任何个人信息规则改动：DOI（`10.1371/journal.pone.0123456`）、arXiv 编号、ISBN、PMID、UUID、ISO 日期与时间戳。
- **IPv4** 跳过版本号（`5.15.167.4-microsoft`、`v1.2.3.4`、更长的点分序列）、回环地址、`0.0.0.0`、子网掩码和文档保留网段。
- **IPv6** 候选会被解析校验，而不是只靠正则匹配：时钟时间、MAC 地址、`xs[1::2]` 这样的切片、`Face::Add` 这样的 C++/Rust 路径都保持原样。
- **邮箱**跳过 `icon@2x.png` 这类文件名、`example.com` 等文档域名、`git@host:repo` 形式的远程仓库地址，以及 noreply 地址。
- **带标签的密钥**（`password=`、`API_KEY=`）跳过引用和代码：`${VAR}`、`process.env.X`、`getpass()`、`Optional[str]`、`your-api-key-here`、`changeme`。`key` 或 `token` 的值还必须看起来是随机串。

## 脱敏类别

| 类别 | 选项 | 默认 | 匹配 |
| --- | --- | --- | --- |
| email | `emails` | 开 | 电子邮件地址 |
| IPv4 / IPv6 | `ipAddresses` | 开 | 公网和内网主机地址 |
| credential | `credentials` | 开 | 已知形态的 key（AWS `AKIA`/`ASIA`、GitHub `ghp_`/`github_pat_`、GitLab `glpat-`、`sk-ant-`、`sk-proj-`、Stripe、Hugging Face、npm、SendGrid、Slack、Google `AIza`）、JWT、`Bearer` token、`scheme://user:password@` 中的密码、私钥块，以及带标签的密钥赋值 |
| address | `addresses` | 开 | 街道词首字母大写的街道地址（`221 Baker Street`），以及有道路名和门牌号的中国地址（`建国路88号3栋1201室`） |
| phone | `phoneNumbers` | 开 | 上面列出的结构化形态 |

占位符保留类别（`[redact:email]`、`[redact:credential]`），模型仍能判断原来是哪类值。

## 洗哪些行

mod 挂在会话记录的写入点，每一行在**存入和发送之前**完成改写。洗哪些行：

- **总是洗**：工具结果、工具随结果附带的行、附件（`@文件` 加载、注入的记忆）、通知、hook 上下文。
- **从不洗**：模型回复、笔记、压缩行。
- **开启 `scrubPrompt` 才洗**：你自己输入的行（`prompt`、`command`、排队中的提示）。默认关闭，让模型看到你的原始提问。
- **投递行**（来自 peer、频道、中继的消息）：除非是人发的，否则都洗。

## 占位符不是文件内容

如果模型读到 `[redact:email]` 后把它原样写回，文件里的真实值就被覆盖了。mod 用两种方式防止这种情况：

- 在系统提示里加一段说明：占位符代表文件中仍然存在的真实值，编辑时应绕开它。
- 在 `Write` 和 `Edit` 上加一道守卫：如果一次写入会让文件里的占位符比原来多，就拒绝这次写入。只是提到占位符的文本（比如本 README）在数量不变时可以正常编辑。

## 使用

- `/redact` 显示本会话各类别的命中次数。
- `/redact off` 在本会话剩余时间内暂停脱敏和写入守卫，用于某条规则碍事的时候；`/redact on` 恢复。
- 每脱敏一行弹出一条提示；`quiet` 可以关闭。

## 配置

在 `/plugin configure` 或 `/config` 中名为 `redact.*` 的行：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `emails` | true | 脱敏邮箱 |
| `ipAddresses` | true | 脱敏 IP 地址 |
| `credentials` | true | 脱敏 key 与凭证 |
| `addresses` | true | 脱敏居住地址 |
| `phoneNumbers` | true | 脱敏电话号码 |
| `scrubPrompt` | false | 也清洗你输入的提示 |
| `quiet` | false | 不弹出逐行提示 |

## 残余风险

- mod 加载**之前**已存在的会话历史，够不到。
- `scrubPrompt` 关闭（默认）时，你自己输入的密钥会原样通过。
- 准确优先意味着有些值是有意不处理的：没有标签、没有分隔符、也没有国家码的电话号码，纯单词的密码，或者没有任何规则认识的密钥格式。
- **模型上下文**是干净的，但转录*文件*里保留了钩子够不到的引擎级记录：工具结果旁的 `toolUseResult` 结构化记录仍存有原文。如果你的威胁模型包括转录文件本身，这一层脱敏并不够。

## 数据来源

所有处理都在 Claude Code 内部的钩子中完成，不启动子进程，也不发起网络请求。写入守卫读取目标文件，只是为了数一数文件里已有多少个占位符。

## 开发

贡献规则（mod contract 与 inclusion bar）见 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

```bash
claude plugin validate mods/redact
claude plugin test mods/redact
```

检测引擎在 `hooks/rules.ts`，是一个纯函数模块；`hooks/rules.test.ts` 是它的测试矩阵，列出必须改写和必须保留的各种形态。接线部分（洗行策略、写入守卫、`/redact`）在 `hooks/register.ts`。

## 许可证

Apache-2.0，见仓库根目录的 [LICENSE](../../LICENSE)。
