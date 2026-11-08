// Presentation deck (16:9): cover · agenda · divider · content · two columns ·
// table · formula/quote · closing. Eight slides; each one is its own #page,
// so the deck never depends on automatic page breaks.

// ── Global look ─────────────────────────────
#set text(font: ("Helvetica Neue", "Helvetica", "PingFang SC"), size: 20pt, fill: rgb("#1d2733"))
#set par(leading: 0.62em, spacing: 0.7em)
#set page(
  paper: "presentation-16-9",
  margin: (x: 2.2em, y: 1.7em),
  numbering: none,
  fill: rgb("#f7f8fa"),
)

// ── Color tokens ─────────────────────────────
#let navy = rgb("#16324f")
#let gold = rgb("#e0a83c")
#let muted = rgb("#5b6b7c")

// ── Slide titles: large, navy, gold rule beneath ──
#show heading.where(level: 1): it => block(above: 0em, below: 1.3em, width: 100%)[
  #set text(size: 29pt, weight: "bold", fill: navy)
  #it.body
  #v(-0.35em)
  #line(length: 24%, stroke: 3.5pt + gold)
]

// ── 1. Cover: full-bleed navy background ──
#page(fill: navy, margin: 0pt)[
  #set text(fill: white)
  #align(center + horizon)[
    #text(size: 13pt, fill: rgb("#9fc3e0"))[TYPST TEMPLATE · 预览示例]
    #v(1.1em)
    #text(size: 40pt, weight: "bold")[幻灯片模板]
    #v(0.6em)
    #text(size: 17pt, fill: rgb("#d6e4ef"))[一个用于测试预览面板的最小演示]
    #v(2.4em)
    #text(size: 12pt, fill: rgb("#9fc3e0"))[2025 年 4 月 · 示例作者]
  ]
]

// ── 2. Agenda ──
#page[
  = 目录
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 2em,
    row-gutter: 0.9em,
    [*01* 背景与目标], [*02* 架构概览],
    [*03* 性能数据], [*04* 下一步],
  )
]

// ── 3. Section divider: full-bleed gold ──
#page(fill: gold, margin: 0pt)[
  #set text(fill: white)
  #align(center + horizon)[
    #text(size: 14pt, fill: rgb("#fff3dc"))[PART ONE]
    #v(0.8em)
    #text(size: 36pt, weight: "bold")[背景与目标]
  ]
]

// ── 4. Content slide: large type, simple list ──
#page[
  = 三个要点
  #set text(size: 22pt)
  + 版式稳定：每次编译的结果一致
  + 字体明确：中文回退到系统字体
  + 完全离线：不依赖任何第三方包
]

// ── 5. Two-column slide ──
#page[
  = 两栏布局
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 2em,
    [
      *优势*

      - 编译速度快
      - 纯文本，可版本控制
      - 数学与代码支持好
    ],
    [
      *注意*

      - 每页信息量要克制
      - 检查字体回退
      - 表格不要超出页宽
    ],
  )
]

// ── 6. Table slide ──
#page[
  = 性能数据
  #table(
    columns: (auto, 1fr, auto),
    inset: (x: 0.8em, y: 0.55em),
    align: (left, left, right),
    stroke: (x, y) => if y == 0 { (bottom: 1.5pt + navy) } else { (bottom: 0.6pt + rgb("#c9d2db")) },
    table.header([指标], [说明], [目标]),
    [P50], [缓存命中时延], [≤ 5 ms],
    [P95], [回源时延], [≤ 80 ms],
    [Hit], [命中率], [≥ 92%],
  )
]

// ── 7. Formula and quote ──
#page[
  = 公式与引文
  $ E[T] = alpha t_"cache" + (1 - alpha)(t_"cache" + t_"origin") $
  #v(0.9em)
  #block(stroke: (left: 4pt + gold), inset: (x: 1.1em, y: 0.6em))[
    #text(size: 16pt, style: "italic", fill: muted)[“排版是内容的第二次创作。”]
  ]
]

// ── 8. Closing ──
#page(fill: navy, margin: 0pt)[
  #set text(fill: white)
  #align(center + horizon)[
    #text(size: 30pt, weight: "bold")[谢谢]
    #v(0.6em)
    #text(size: 14pt, fill: rgb("#9fc3e0"))[typst.app · 示例文件 template/slides.typ]
  ]
]
