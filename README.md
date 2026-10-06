# claude-mods

[English](#english) | [中文](#中文)

A collection of Claude Code mods — one repository hosts them all; install by plugin name.

![context-band preview](mods/context-band/assets/forms.png)

## English

| mod | description | install |
| --- | --- | --- |
| [context-band](mods/context-band/README.md#english) | Live band above the prompt: context fill + plan quota / session cost (adapts to login method) | `/plugin install context-band --marketplace JinhaoFang/claude-mods` |

Install any mod by typing its command in a Claude Code terminal session, answering `y` to add the marketplace and picking the user scope — it goes live in the current session.

### Adding a new mod

1. Create a folder under `mods/` (structure: `.claude-plugin/plugin.json` + `hooks/`)
2. Add one entry to `plugins` in the root `.claude-plugin/marketplace.json`:

```json
{ "name": "<mod name>", "source": "./mods/<folder>" }
```

3. Push, and anyone can install it: `/plugin install <mod name> --marketplace JinhaoFang/claude-mods`

### License

Apache-2.0, see [LICENSE](LICENSE).

---

## 中文

我的 Claude Code mod（插件）合集：一个仓库托管多个 mod，安装时按插件名选择。

### 包含的 mod

| mod | 说明 | 安装 |
| --- | --- | --- |
| [context-band](mods/context-band/README.md#中文) | 输入框上方的实时带：上下文占用 + 套餐额度 / 会话花费（自适应登录方式） | `/plugin install context-band --marketplace JinhaoFang/claude-mods` |

在 Claude Code 终端会话中输入安装命令，按提示 `y` 添加 marketplace、选择 user scope 回车即可，当次会话立即生效。

### 添加新 mod

1. 在 `mods/` 下新建 mod 文件夹（结构：`.claude-plugin/plugin.json` + `hooks/`）
2. 在根级 `.claude-plugin/marketplace.json` 的 `plugins` 里加一项：

```json
{ "name": "<mod名>", "source": "./mods/<文件夹名>" }
```

3. 推送后，别人即可安装：`/plugin install <mod名> --marketplace JinhaoFang/claude-mods`

### License

Apache-2.0，见 [LICENSE](LICENSE)。
