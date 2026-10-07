# context-band

[English](README.md) | [中文](README.zh-CN.md)

Claude Code 的一个 mod：一条跟随当前视图的实时带，放在输入框上方。环境行（模型、effort、工作状态、目录）在上方，读数行（上下文量表、套餐额度、重置倒计时、费用）在下方；带跟随屏幕上的会话——主会话，或从任务列表打开的某个 agent loop 的转录。

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

## 带的形态

两行：

- **环境行**——谁、在哪：模型名，旁边是五格 effort 刻度条（从 low 到 max 逐格填充）、工作状态点（`●` 运行中，`○` 空闲）、暗色的会话目录，以及按钮组 `Hide · ⟲ Compact · ⚙ · ▾`。在代理视图中，行首是该 loop 的标识标签，模型和 effort 也换成那个 loop 的。
- **读数行**——所有数字：上下文量表、套餐额度条、重置倒计时、费用。这一行永不截断；终端太窄时目录先让位——先留最后两段，再留最后一段——读数和按钮保持完整。

### 上下文量表

- 百分比按 **compaction 窗口**计（自动压缩提前触发，比模型理论窗口更小），所以它读作"还能聊多久"
- 颜色阈值默认 <60% 绿、60–85% 黄、≥85% 红；可在 `/config` 或带的设置区调整

### 套餐额度与费用

没有硬编码的登录方式判定：引擎上报订阅窗口时，带画出两条额度条——5 小时窗口用 `suggestion` 色，7 天窗口用 `remember` 色，靠颜色区分、无标签——`↺` 是最近一次重置的倒计时。没有上报时改为显示本会话费用，网关上报 `spend_limit` 时附加一条额度条。

## 代理视图

从任务列表打开某个 agent loop 的转录，带就跟随这个视图：

- 量表显示那个 loop 自己的上下文占用，并带标识标签——名字，其次 agent 类型，再次短 id——你始终知道读的是谁的数字
- 模型和 effort 刻度换成那个 loop 的，跑在不同模型上的委托一眼可辨；工作状态点跟随那个 loop 的状态
- 套餐额度条、重置倒计时、费用保留在读数行——账户级读数属于每个视图
- 尚未完成任何 step 的 loop 显示暗色占位，绝不显示它没有的数字
- 主会话始终用引擎原生读数；代理视图数字的来源记录在 [ADR-0004](../../docs/adr/0004-agent-view-context-from-turn-steps.md)

有自己的终端窗格的 teammate 是独立会话，带的是另一条带；这里的一切对它们不变。

## 三种状态

- **展开**——两行带
- **收起**——`▾` 把带折成一个药丸 `◂ 44.4%`——当前视图的百分比，代理视图中带上该 loop 的短标签；按药丸重新展开
- **隐藏**——`Hide` 移除带，直到你唤回

收起和隐藏跨会话持久。`/context-band` 命令唤回带，展开状态。

## 压缩

`⟲ Compact` 只在主会话出现——引擎的 compact 调用没有针对单个 agent 的形态，所以代理视图完全不画这个按钮。第一次按变成 `Confirm`；再按一次才压缩；几秒内不按第二次自动还原。正在运行的回合先跑完，压缩才开始。

## 设置

`⚙` 按钮把读数行换成设置区；`Done` 或再按一次 `⚙` 关闭。

- 步进行：`Warn` 和 `Error` 每步 5，`Refresh` 秒数每步 1；所有值都有边界钳制
- 警告始终低于错误：调高警告会把错误顶开，调低错误会把警告带下来
- 开关：`Model & effort`、`Reset ↺`、`Cost`——按下即切换
- 改过的值存入插件存储、跨会话持久；`/config` 选项只在对应行未被改过时生效

热重载或重启会话会关闭设置区；改过的值保留。

## 配置

`/config` 中的 `context-band.*` 行：

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `warningThreshold` | 60 | 变黄阈值（%） |
| `errorThreshold` | 85 | 变红阈值（%） |
| `refreshSeconds` | 7 | 兜底刷新间隔（秒）；回合结束会立即更新，不靠它 |
| `showEffort` | true | 显示模型名和它的 effort 刻度条 |
| `showCost` | true | 无套餐读数时显示会话花费 |
| `showResetIn` | true | 显示套餐窗口重置倒计时 |

每个选项都生效到设置区中对应行被改动为止；此后设置值遮蔽它，直到再次改动该行。

## 数据来源

主会话的数字全部来自引擎原生的 `$.session.usage()`（本地免费调用）；回合结束推送刷新，`refreshSeconds` 的兜底时钟补上间隙。代理视图的数字从该 loop 已完成的 `turn.step` 请求累计而来，因为引擎没有按 agent 的用量接口——理由记录在 [ADR-0004](../../docs/adr/0004-agent-view-context-from-turn-steps.md)。本 mod 不起子进程、不发网络请求。API 形态显示的是**本会话**累计花费，账户级总用量插件 API 拿不到。

## 使用

- `▾` 把带收成药丸；按药丸展开
- `Hide` 隐藏带；`/context-band` 唤回，展开状态
- `⟲ Compact` 压缩主会话，两步确认
- `⚙` 打开设置区
- 卸载：`claude plugin uninstall context-band`

## 开发

贡献者规则（mod 契约与收录标准）见 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

```bash
claude plugin validate mods/context-band
claude plugin test mods/context-band
```

## 许可

Apache-2.0，随仓库根级 [LICENSE](../../LICENSE)。
