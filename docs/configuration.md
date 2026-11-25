<p align="right"><a href="configuration.en.md"><b>English</b></a></p>

# 配置参考

dsh-typst 只有一个设置命名空间 `typst`，定义在 `src/config.ts`，共 4 个字段。全部字段都是 volatile：设置页的提交落到运行中的 fiber 上而不重挂载插件。

## 设置页标签与字段归属

| 标签          | 设置命名空间 | 字段数 | 分组与字段                                                               |
| ------------- | ------------ | ------ | ------------------------------------------------------------------------ |
| **dsh-typst** | `typst`      | 4      | 工具链：`typstPath`、`fontPaths`、`packagePath`；扫描范围：`excludeDirs` |

插件在插件管理器的 **dsh-typst** 详情页渲染这张表单。

## 核心字段（`typst`，4 个）

| 字段          | 默认值 | 说明                                                                                                                                                   |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typstPath`   | `""`   | typst 可执行文件的完整路径。留空表示按查找顺序定位；只有在 Typst 装在别处时才需要填写。                                                                |
| `fontPaths`   | `[]`   | 额外的字体目录，逐个作为 `--font-path` 传给 typst，排在 workspace 的 `fonts/`、`assets/fonts/` 之后。用来补足系统字体目录之外的设计字体库或 CJK 字体。 |
| `packagePath` | `""`   | typst 的本地包目录，作为 `--package-path` 传入。用于 `@local` 私有包，或把 `@preview` 包放在离线镜像里。留空使用 typst 的默认位置。                    |
| `excludeDirs` | `[]`   | 主文件扫描时额外跳过的目录名，在 `node_modules`、`target`、`__pycache__`、`venv`、`build`、`dist` 之外追加。只影响文件发现，不影响编译。               |

## 路径与名称规则

- **`~` 展开**：三个路径字段都接受开头的 `~/`（Windows 上 `~\` 同样有效），读取时展开为当前用户的主目录；typst 收到的是展开后的路径。
- **相对路径**：`typstPath`、字体目录和包目录里的相对路径都按工作区解析。typst 子进程的工作目录就是工作区根，因此相对路径的含义和你在该目录里运行 `typst` 时一致。
- **字体顺序**：工作区的 `fonts/`、`assets/fonts/` 在前，设置里的目录在后，重复项只保留一次；同名字体冲突时项目自带字体优先。配置目录可以尚不存在，typst 会忽略这样的条目。
- **设置页里的列表**：`fontPaths` 与 `excludeDirs` 在设置页里用逗号分隔（分号也同样接受）；路径本身含逗号时用双引号括住它，引号里的 `""` 表示一个引号。配置文件里仍是 YAML 数组。
- **排除目录只写名称**：`excludeDirs` 按目录名匹配，不接受 `/` 或 `\` 等路径写法；任意层级命中，比较时不区分大小写（Windows、macOS、Linux 一致）。隐藏目录仍由原有规则处理。面板勾选「包含隐藏及构建目录」时，设置里的排除项会与内置列表一起显示。
- **跨平台**：Windows 的 `C:\Users\...`、盘符、空格路径都按一个参数原样传递；macOS/Linux 使用各自的绝对路径。分隔符可以写本机习惯的 `\` 或 `/`。

## 查找顺序

`typstPath` 为空时，插件按以下顺序定位 typst，找到即止：

1. **PATH**：可执行目录里的 `typst`。
2. **常见安装位置**：Homebrew（`/opt/homebrew/bin`、`/usr/local/bin`）、Cargo（`~/.cargo/bin`）、`~/.local/bin`、Nix、Snap、WinGet、Scoop。
3. **登录 shell**：mise、asdf 等版本管理器把 typst 放在 shell 初始化后才可见的目录里，因此插件会在登录 shell 中查询一次。

定位结果附带来源（`setting`/`path`/`common`/`shell`），工具链状态也会带上它。定位到的版本必须不低于 0.12.0，否则状态是 `too_old` 而不是 `ready`。

面板的安装引导页会列出检测到的事实、查找过的目录和找到的包管理器。

## 配置优先级

```text
Schema 默认值 → Composition 入口配置 → 当前 profile 的 Cordis patch 覆盖层 → home patch → `--patch` 覆盖层
```

插件设置页的提交写入当前 profile 的运行中条目（volatile），覆盖层文件保持原样。

## 插件配置页

配置有三个入口：

1. **插件管理器**：打开 **dsh-typst** 详情页，填写「Typst 路径」「字体目录」「包目录」「排除目录」并保存。
2. **Composition 入口**：在加载插件的配置文件里写：

   ```yaml
   typst:
     typstPath: "/path/to/typst"
     fontPaths: ["~/Fonts/zh", "/Library/Fonts/Brand"]
     packagePath: "~/typst-packages"
     excludeDirs: ["vendor", "generated"]
   ```

3. **配置文件**：Cordis profile 的 patch 覆盖层。

## 热重载行为

| 字段                        | 生效时机                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `typstPath`                 | 立即生效。提交后所有活跃会话重新定位 typst 可执行文件；watch 随之重启，会话自行收敛。                            |
| `fontPaths` / `packagePath` | 立即生效。活跃会话用新的 `--font-path` / `--package-path` 重启 watch；一次性的渲染与导出在下一次调用时采用新值。 |
| `excludeDirs`               | 立即生效。活跃会话重新扫描主文件候选；正在运行的 watch 不受影响，因为排除只属于文件发现。                        |

改动只更新运行中的条目，正在进行的会话继续有效。
