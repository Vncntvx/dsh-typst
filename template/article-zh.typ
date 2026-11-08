// 中文科技论文模板：A4 · 12pt 宋体 · 摘要/关键词 · 编号标题 · 三线表 · 公式 · 脚注 · 页眉页码
// 只使用 Typst 内置功能，无第三方包、无外部资源，可离线编译。

// ── 页面与页眉页脚 ─────────────────────────────
#set page(
  paper: "a4",
  margin: (x: 2.6cm, top: 2.6cm, bottom: 2.4cm),
  // 页眉从第 2 页开始：用 page 计数器判断，避免首页重复标题
  header: context {
    if counter(page).get().first() > 1 {
      set text(size: 9pt, fill: rgb("#666666"))
      align(center)[Typst 中文科技论文排版示例]
      v(-0.45em)
      line(length: 100%, stroke: 0.4pt + rgb("#999999"))
    }
  },
  // 页脚页码
  footer: context {
    align(center, text(size: 9pt, fill: rgb("#666666"))[#counter(page).display("1 / 1")])
  },
)

// ── 字体与段落 ─────────────────────────────
// 拉丁文用 Times，中文依次回退宋体 → 思源宋体 → 苹方（均为 macOS 系统字体）
#set text(
  font: ("Times New Roman", "Songti SC", "Source Han Serif SC", "PingFang SC"),
  size: 12pt, lang: "zh", region: "cn",
)
#set par(
  justify: true, leading: 1.1em, spacing: 1.05em,
  first-line-indent: (amount: 2em, all: true),
)
#set heading(numbering: "1.1")
#show heading: set text(font: ("Heiti SC", "PingFang SC"), weight: "bold")
#show heading.where(level: 1): set block(above: 1.5em, below: 0.9em)
#show figure.caption: set text(size: 10pt)

// ── 题名、作者与单位 ─────────────────────────────
#align(center)[
  #text(size: 19pt, weight: "bold", font: ("Heiti SC", "PingFang SC"))[基于 Typst 的中文科技论文排版实践]
  #v(0.7em)
  #text(size: 11.5pt)[
    张 三#footnote[基金项目：国家自然科学基金（No. 00000000）资助。]
    #h(2em)
    李 四#footnote[通讯作者：lisi\@example.com。]
  ]
  #v(0.25em)
  #text(size: 10pt, fill: rgb("#555555"))[（示例大学 计算机科学与技术学院，上海 200000）]
]

// ── 摘要与关键词（浅色底 + 左侧色条）─────────────────────────────
#v(1em)
#block(
  width: 100%, inset: (x: 1.1em, y: 0.85em),
  stroke: (left: 2.5pt + rgb("#3b5b8c")), fill: rgb("#f3f6fa"),
)[
  #set par(first-line-indent: 0em, spacing: 0.6em)
  #text(size: 10.5pt)[*摘要：* 本文演示中文科技论文的常见版式：题名、摘要、编号章节、三线表、公式、脚注与参考文献。全部样式仅使用 Typst 内置能力，不依赖任何第三方宏包，可在离线环境下直接编译。]

  #text(size: 10.5pt)[*关键词：* 中文排版；Typst；科技论文；三线表]
]

// ── 正文 ─────────────────────────────
= 引言
中文科技论文通常采用“题名—摘要—正文—参考文献”的结构，正文首行缩进两字，行距略大于西文。

Typst 的段落设置可以集中完成：两端对齐、首行缩进 2 字符、行距 1.1 倍。脚注由内置功能提供，编号自动生成#footnote[这一段额外演示脚注的自动编号与页面底部排版。]。

= 方法
== 实验设置
实验在 8 核工作站上完成，评测指标为准确率与单条耗时。

// 三线表：顶线、底线较粗，栏目线较细，符合中文期刊惯例
#figure(
  table(
    columns: (auto, 1fr, auto, auto),
    inset: (x: 0.9em, y: 0.6em),
    align: (center, left, center, center),
    stroke: none,
    table.hline(stroke: 1.2pt),
    table.header([序号], [方法], [准确率/%], [耗时/s]),
    table.hline(stroke: 0.5pt),
    [1], [词频统计 + 线性分类器], [86.4], [0.3],
    [2], [双向编码器 + 注意力], [91.2], [1.8],
    [3], [本文方法], [93.7], [2.1],
    table.hline(stroke: 1.2pt),
  ),
  caption: [三种方法的准确率与耗时对比],
  kind: table,
)

== 优化目标
设 $alpha$ 为学习率、$theta$ 为可训练参数、$cal(L)$ 为交叉熵损失，则训练目标是带 $ell_2$ 正则的经验风险最小化：

$ cal(L)(theta) = -1/n sum_(i=1)^n y_i log p_i (theta) + lambda norm(theta)_2^2 $

= 结论
本文给出了一份可直接编译的中文论文模板，可作为技术报告与课程论文的起点。

// ── 参考文献：纯文本条目，不依赖 .bib ─────────────────────────────
#heading(numbering: none)[参考文献]
#set par(first-line-indent: 0em, hanging-indent: 2em, spacing: 0.4em)
#text(size: 10.5pt)[
  [1] 王五. 中文科技论文的网格化排版方法[J]. 排版学报, 2023, 12(3): 45--58.

  [2] 赵六, 钱七. 数字出版中的字体回退策略[J]. 出版技术, 2022, 8(2): 11--19.

  [3] Typst GmbH. Typst Documentation[EB/OL]. https://typst.app/docs, 2025.
]
