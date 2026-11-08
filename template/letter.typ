// One-page formal letter: sender/recipient blocks, date, subject, justified body,
// signature and a ruled footer. Tight, elegant spacing; small caps for Latin.

// ── Page and ruled footer ─────────────────────────────
#set page(
  paper: "a4",
  margin: (x: 2.7cm, top: 2.4cm, bottom: 2.7cm),
  footer: context {
    // Thin rule, then a small-caps sender line and a page marker
    set text(size: 8pt, fill: rgb("#6b6b6b"))
    line(length: 100%, stroke: 0.4pt + rgb("#c4c4c4"))
    v(0.35em)
    grid(columns: (1fr, auto))[
      #smallcaps[Example Studio] · 12 Harbor Lane, Shanghai 200040
    ][
      #smallcaps[Page] #counter(page).display("1 / 1")
    ]
  },
)

// Serif stack: Latin first, then Chinese fallbacks
#set text(
  font: ("Libertinus Serif", "Times New Roman", "Songti SC", "Source Han Serif SC"),
  size: 10.5pt, lang: "zh", region: "cn", tracking: 0.01em,
)
#set par(justify: true, leading: 0.8em, spacing: 0.9em)

// ── Sender block, right-aligned ─────────────────────────────
#align(right)[
  #text(size: 13pt, weight: "bold", font: ("Helvetica", "PingFang SC"))[示例设计工作室]
  #v(0.3em)
  #text(size: 9pt, fill: rgb("#555555"))[
    上海市静安区某路 12 号 · 200040\
    #link("mailto:hello@example.com")[hello\@example.com] · +86 21 0000 0000
  ]
]

#v(1.5em)
#line(length: 100%, stroke: 0.5pt + rgb("#d5d5d5"))
#v(1.4em)

// ── Recipient and date ─────────────────────────────
#grid(columns: (1fr, auto), [
  #text(size: 10pt)[
    某某出版社\
    编辑部 收\
    北京市海淀区某路 8 号
  ]
], [
  #align(right)[#text(size: 10pt, fill: rgb("#555555"))[2025 年 4 月 18 日]]
])

// ── Subject ─────────────────────────────
#v(2em)
*事由：* 关于《Typst 排版实践》封面设计的沟通
#line(length: 100%, stroke: 0.4pt + rgb("#e0e0e0"))
#v(1em)

// ── Salutation and body ─────────────────────────────
尊敬的编辑老师：

#block[
  // 正文首行缩进 2 字符，段落间距略紧
  #set par(first-line-indent: (amount: 2em, all: true))
  感谢贵社对本书排版方案的信任。随信附上封面设计的三个方向，均以 Typst 内置绘图能力完成，不依赖任何外部图片素材。

  第一个方向强调留白与网格，第二个方向突出章节色带，第三个方向用细线框住书名。三者都保证在 300 dpi 下清晰可印。

  如您对其中某一方向有意向，我们可在本周内提供完整的封面与书脊方案。期待您的回复。
]

// ── Closing and signature ─────────────────────────────
#v(0.6em)
此致
#v(0.1em)
敬礼！

#v(2.4em)
#align(right)[
  #text(size: 10.5pt)[示例设计工作室]\
  #text(size: 9pt, fill: rgb("#555555"))[#smallcaps[Lin Wei] · 设计总监]
]
