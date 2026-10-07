# context-band

[English](README.md) | [中文](README.zh-CN.md)

Claude Code 的一个 mod：在输入框上方放一条实时带，显示当前会话的**上下文占用**，并按登录方式自适应显示**订阅套餐额度**（官方 OAuth 登录）或**会话花费**（API key / 网关）。

![预览](assets/forms.png)

## 安装

从 GitHub marketplace 安装（在 Claude Code 终端会话中输入）：

```
/plugin install context-band --marketplace JinhaoFang/claude-mods
```

或从本地文件夹安装：

```
/plugin install context-band --marketplace /path/to/mods/context-band
```

按提示 `y` 添加 marketplace、选择 user scope 回车即可，当次会话立即生效。

## 显示内容

- 上下文百分比按 **compaction 窗口**计（自动压缩会提前触发，这比模型理论窗口更接近"还能聊多久"）
- 两条订阅额度无标签，用主题色区分：5 小时窗口 = `suggestion` 色，7 天窗口 = `remember` 色；`↺` 后是最近重置的倒计时
- 颜色阈值：默认 <60% 绿、60–85% 黄、≥85% 红（可在 `/config` 调整）
- 无硬编码的登录方式判定：有 `five_hour`/`seven_day` 读数 → 套餐形态，否则 → 费用形态（网关上报 `spend_limit` 时附加显示）

## 配置

`/config` 中的 `context-band.*` 行：

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `warningThreshold` | 60 | 变黄阈值（%） |
| `errorThreshold` | 85 | 变红阈值（%） |
| `refreshSeconds` | 7 | 兜底刷新间隔（秒）；回合结束会立即更新，不靠它 |
| `showCost` | true | 无套餐读数时显示会话花费 |
| `showResetIn` | true | 显示套餐窗口重置倒计时 |

## 数据来源

全部来自引擎原生的 `$.session.usage()`（本地免费调用，不发起网络请求），回合结束由 `session.measure` 事件推送刷新。不解析 transcript、不依赖第三方工具。API 形态显示的是**本会话**累计花费，账户级总用量插件 API 拿不到。

## 使用

- `[ Hide ]` 按钮隐藏本会话的带；输入 `/context-band` 重新显示
- 卸载：`claude plugin uninstall context-band`

## 开发

贡献者规则（mod 契约与收录标准）见 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

```bash
claude plugin validate mods/context-band
claude plugin test mods/context-band
```

## 许可

Apache-2.0，随仓库根级 [LICENSE](../../LICENSE)。
