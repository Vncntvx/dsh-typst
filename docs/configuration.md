<p align="right"><a href="configuration.en.md"><b>English</b></a></p>

# 配置参考

dsh-typst 只有一个设置命名空间 `typst`，定义在 `src/config.ts`，共 1 个字段。全部字段都是 volatile：设置页的提交落到运行中的 fiber 上而不重挂载插件。

## 设置页标签与字段归属

| 标签          | 设置命名空间 | 字段数 | 分组与字段              |
| ------------- | ------------ | ------ | ----------------------- |
| **dsh-typst** | `typst`      | 1      | Typst 路径：`typstPath` |

插件在插件管理器的 **dsh-typst** 详情页渲染这张表单。

## 核心字段（`typst`，1 个）

| 字段        | 默认值 | 说明                                                                                    |
| ----------- | ------ | --------------------------------------------------------------------------------------- |
| `typstPath` | `""`   | typst 可执行文件的完整路径。留空表示按查找顺序定位；只有在 Typst 装在别处时才需要填写。 |

## 查找顺序

`typstPath` 为空时，插件按以下顺序定位 typst，找到即止：

1. **PATH**：可执行目录里的 `typst`。
2. **常见安装位置**：Homebrew（`/opt/homebrew/bin`、`/usr/local/bin`）、Cargo（`~/.cargo/bin`）、`~/.local/bin`、Nix、Snap、WinGet、Scoop。
3. **登录 shell**：mise、asdf 等版本管理器把 typst 放在 shell 初始化后才可见的目录里，因此插件会在登录 shell 中查询一次。

定位结果附带来源（`setting`/`path`/`common`/`shell`），工具链状态里可以看到它。定位到的版本必须不低于 0.12.0，否则状态是 `too_old` 而不是 `ready`。

面板的安装引导页会列出检测到的事实、查找过的目录和找到的包管理器。

## 配置优先级

```text
Schema 默认值 → Composition 入口配置 → 当前 profile 的 Cordis patch 覆盖层
```

插件设置页的提交写入最后一层。

## 插件配置页

配置有三个入口：

1. **插件管理器**：打开 **dsh-typst** 详情页，填写「Typst 路径」并保存。
2. **Composition 入口**：在加载插件的配置文件里写 `typst: { typstPath: "/path/to/typst" }`。
3. **配置文件**：Cordis profile 的 patch 覆盖层。

## 热重载行为

| 字段        | 生效时机                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------- |
| `typstPath` | 立即生效。提交后所有活跃会话重新定位一次 typst 可执行文件；watch 随之重启，会话自行收敛。 |

改动不会重挂载插件，也不会让正在进行的会话失效。
