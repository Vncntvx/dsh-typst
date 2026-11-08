// A4 feature showcase for the preview panel: color tokens, cards, callouts,
// math, table, lists, links, highlight, underline, quote, figure and a
// two-column grid of cards.

// ── Page and base text ─────────────────────────────
#set page(paper: "a4", margin: (x: 1.8cm, y: 1.6cm))
#set text(
  font: ("Helvetica Neue", "Helvetica", "Songti SC", "Source Han Serif SC"),
  size: 10.5pt, lang: "zh", region: "cn",
)
#set par(leading: 0.7em, spacing: 0.55em)
#show heading: set text(font: ("Heiti SC", "PingFang SC"), weight: "bold")
#show figure.caption: set text(size: 8pt, fill: rgb("#5b6b7c"))

// ── Printable color tokens (mid-tone, low saturation) ──
#let ink = rgb("#22303f")
#let blue = rgb("#2f6fb0")
#let teal = rgb("#2a8c82")
#let amber = rgb("#a9761f")
#let rose = rgb("#9c4a5c")
#let surface = rgb("#f4f7fa")
#let border = rgb("#d7dee6")

// Card: rounded box with a colored title, never split across pages
#let card(accent, fill, title, body) = block(
  width: 100%, breakable: false,
  fill: fill, stroke: 0.6pt + border, radius: 5pt,
  inset: (x: 0.95em, y: 0.85em),
)[
  #text(size: 8.5pt, weight: "bold", fill: accent, tracking: 0.08em)[#title]
  #v(0.35em)
  #set par(spacing: 0.45em, leading: 0.68em)
  #body
]

// ── Header bar ─────────────────────────────
#block(width: 100%, fill: ink, inset: (x: 1.1em, y: 0.9em), radius: 6pt)[
  #set text(fill: rgb("#f2f5f8"))
  #text(size: 18pt, weight: "bold")[Typst 预览特性速查]
  #v(0.25em)
  #text(size: 9pt, fill: rgb("#b9c7d6"))[A4 视觉功能样张：彩色框、提示、数学、表格、列表、链接、高亮、下划线、引文与双栏]
]

// ── Two-column card grid ─────────────────────────────
#v(0.9em)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 1em,
  row-gutter: 1.1em,

  card(blue, surface, "色板 / color tokens", [
    #box(width: 2.6em, height: 1em, fill: ink, radius: 2pt)
    #box(width: 2.6em, height: 1em, fill: blue, radius: 2pt)
    #box(width: 2.6em, height: 1em, fill: teal, radius: 2pt)
    #box(width: 2.6em, height: 1em, fill: amber, radius: 2pt)
    #box(width: 2.6em, height: 1em, fill: rose, radius: 2pt)

    深色背景只到 `#22303f`，不出现纯黑，适合印刷。
  ]),

  card(teal, surface, "列表 / lists", [
    - 无序列表项
    - 支持嵌套
      - 第二层

    + 有序列表项
    + 第二项
  ]),

  card(blue, surface, "数学 / math", [
    行内公式 $a^2 + b^2 = c^2$，行间公式：

    $ integral_0^1 x^2 dif x = 1/3 $

    公式编号与对齐都交给内置排版。
  ]),

  card(amber, surface, "表格 / table", [
    #table(
      columns: (1fr, 1fr, auto),
      inset: (x: 0.55em, y: 0.35em),
      stroke: (x, y) => if y == 0 { (bottom: 1pt + amber) } else { (bottom: 0.4pt + border) },
      table.header([项], [值], [单位]),
      [宽度], [21], [cm],
      [高度], [29.7], [cm],
    )
  ]),

  card(rose, surface, "强调 / emphasis", [
    #highlight(fill: rgb("#fff2c2"))[高亮文本] · #underline[下划线] · *粗体* · _斜体_

    #smallcaps[Small Caps Label] · `inline code` · #link("https://typst.app")[typst.app]
  ]),

  card(teal, surface, "提示框 / callout", [
    #rect(
      width: 100%, fill: rgb("#eaf5f3"), stroke: (left: 3pt + teal),
      inset: (x: 0.6em, y: 0.45em), radius: 3pt,
    )[*提示：* 提示框由 `rect` 叠加左侧色条实现，无需额外宏包。]
  ]),

  card(blue, surface, "引文 / quote", [
    #quote(block: true, attribution: [Donald Knuth])[
      Typography is the art of doing more with less.
    ]
  ]),

  card(amber, surface, "图形 / figure", [
    #figure(
      rect(
        width: 100%, height: 2.6em, radius: 3pt,
        fill: rgb("#eef2f7"), stroke: 0.6pt + border,
      )[#align(center + horizon)[#text(size: 8.5pt, fill: rgb("#5b6b7c"))[用 rect 充当的图示]]],
      caption: [figure 自动编号，标题样式由 show 规则控制],
    )
  ]),
)

// ── Full-width footer note ─────────────────────────────
#v(0.9em)
#block(
  width: 100%, fill: surface, stroke: 0.6pt + border,
  inset: (x: 1em, y: 0.7em), radius: 5pt,
)[
  #set text(size: 9pt, fill: rgb("#4a5a6b"))
  颜色均取中等明度、低饱和的印刷友好色，正文最深为 #raw("#22303f")。整页可在 A4 上单页或双页输出。
]
