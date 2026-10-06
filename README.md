# claude-mods

我的 Claude Code mod（插件）合集：一个仓库托管多个 mod，安装时按插件名选择。

## 包含的 mod

| mod | 说明 | 安装 |
| --- | --- | --- |
| [context-band](mods/context-band/README.md) | 输入框上方的实时带：上下文占用 + 套餐额度 / 会话花费（自适应登录方式） | `/plugin install context-band --marketplace JinhaoFang/claude-mods` |

在 Claude Code 终端会话中输入安装命令，按提示 `y` 添加 marketplace、选择 user scope 回车即可，当次会话立即生效。

## 添加新 mod

1. 在 `mods/` 下新建 mod 文件夹（结构：`.claude-plugin/plugin.json` + `hooks/`）
2. 在根级 `.claude-plugin/marketplace.json` 的 `plugins` 里加一项：

```json
{ "name": "<mod名>", "source": "./mods/<文件夹名>" }
```

3. 推送后，别人即可安装：`/plugin install <mod名> --marketplace JinhaoFang/claude-mods`

## License

Apache-2.0，见 [LICENSE](LICENSE)。
