// English technical report: title page · contents · numbered headings ·
// code listing · wide table · numbered equation · running header/footer.
// Built-ins only: no packages, no images, no network.

// ── Page, running header and footer ─────────────────────────────
#set page(
  paper: "a4",
  margin: (x: 2.4cm, top: 2.8cm, bottom: 2.4cm),
  header: context {
    if counter(page).get().first() > 1 {
      set text(size: 8.5pt, fill: rgb("#5a6672"))
      grid(columns: (1fr, auto), [Caching Strategies for Edge Deployments], [p. #counter(page).display()])
      v(-0.45em)
      line(length: 100%, stroke: 0.4pt + rgb("#c2c9d0"))
    }
  },
  footer: context {
    align(center, text(size: 8.5pt, fill: rgb("#5a6672"))[#counter(page).display("1")])
  },
)

// ── Typography ─────────────────────────────
#set text(font: ("Times New Roman", "Libertinus Serif", "Songti SC"), size: 10.5pt, lang: "en", region: "us")
#set par(justify: true, leading: 0.8em, spacing: 1em)
#set heading(numbering: "1.1")
#show heading: set text(font: ("Helvetica", "Arial"), weight: "bold", fill: rgb("#1c2b3a"))

// Formal level-1 headings: number, then a hairline rule beneath
#show heading.where(level: 1): it => block(above: 1.5em, below: 0.85em, width: 100%)[
  #set text(size: 13.5pt)
  // The outline's own title is also shown as a heading, with numbering: none
  #if it.numbering != none [#counter(heading).display(it.numbering)#h(0.75em)]
  #it.body
  #v(-0.25em)
  #line(length: 100%, stroke: 0.5pt + rgb("#98a4b0"))
]
#show figure.caption: set text(size: 9pt, style: "italic")

// ── Title page: its own #page, without header, footer or number ──
#page(header: none, footer: none, numbering: none)[
  #v(4.5cm)
  #line(length: 45%, stroke: 2.5pt + rgb("#1c2b3a"))
  #v(1.2em)
  #text(size: 23pt, weight: "bold", font: ("Helvetica", "Arial"))[
    Caching Strategies for\
    Edge Deployments
  ]
  #v(0.8em)
  #text(size: 11pt, style: "italic", fill: rgb("#4a5666"))[A technical report on latency-aware cache design]
  #v(4cm)
  #grid(columns: (1fr, auto))[
    #text(size: 9pt)[
      Prepared by *A. Author*\
      Platform Engineering Group
    ]
  ][
    #align(right)[#text(size: 9pt)[
      Version 1.0\
      April 2025
    ]]
  ]
]

// ── Contents (built from the headings' own bookmarks) ──
#outline(title: [Contents], depth: 2, indent: 1.2em)
#pagebreak()

= Introduction
Edge caches sit between users and origin servers. They cut latency and origin load, at the price of freshness. This report sketches a three-tier design and the numbers behind it.

= Architecture
== Request path
Every request resolves a cache key, probes the tiers in order, and falls back to the origin on a miss. The listing below shows the hot path.

// Code listing with caption, syntax highlighting and its own counter
#figure(
  raw(
    "// hot path\nlet key = hash(req.url)\nlet hit = cache.get(key)\nif hit == none {\n  cache.put(key, fetch(req.url))\n}",
    lang: "typ",
    block: true,
  ),
  caption: [Cache lookup in pseudo-Typst.],
  supplement: [Listing],
)

== Latency budget
The tiers differ in scope, so their hit rates and tail latencies differ too.

// Wide table: five columns, full text width
#figure(
  table(
    columns: (auto, 1fr, auto, auto, auto),
    inset: (x: 0.7em, y: 0.5em),
    align: (left, left, center, center, center),
    stroke: (x, y) => if y == 0 { (top: 1pt, bottom: 0.6pt) } else { (bottom: 0.5pt + rgb("#d7dde3")) },
    table.header([Tier], [Role], [Hit rate], [p50], [p95]),
    [L1], [Per-process object cache], [94%], [0.2 ms], [0.9 ms],
    [L2], [Shared Redis cluster], [88%], [1.1 ms], [6.0 ms],
    [L3], [Regional edge POP], [72%], [9.5 ms], [45 ms],
    [Origin], [Primary datastore], [—], [80 ms], [310 ms],
  ),
  caption: [Latency budget and observed hit rate per cache tier.],
)

== Expected hit time
Let $alpha$ be the joint hit probability of the tiers. The expected lookup time is

#set math.equation(numbering: "(1)")
$ E[T] = alpha t_"cache" + (1 - alpha)(t_"cache" + t_"origin") $

Using the numbers above, Equation (1) predicts roughly 18 ms for a warm key and 96 ms on a cold one.

= Conclusion
The design stays within its latency budget as long as the tier hit rates hold; the measurement plan in the appendix tracks exactly that.

= References
#set par(hanging-indent: 1.6em)
[1] Kleppmann, M. *Designing Data-Intensive Applications*. O'Reilly, 2017.

[2] Typst GmbH. *Typst Documentation*. #link("https://typst.app/docs")[typst.app/docs], 2025.
