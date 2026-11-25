/**
 * A simulated `typst` CLI for tests: `watch` prints ZCode-shaped watch
 * output rounds and writes a tiny valid PDF (one page, one text run) to the
 * output path; `compile` writes the same PDF and prints diagnostics when
 * asked; `--version` prints a version line.
 *
 * The script is pointed at via the session's toolchain options in specs;
 * it never touches the real typst.
 * @module tests/fixtures/typst-fake
 */

const args = process.argv.slice(2);

const fs = require("node:fs");
const path = require("node:path");

/** Teardown specs watch the watch process's own lifecycle through this log. */
const eventLog = process.env.TYPST_FAKE_EVENT_LOG;
function record(event) {
  if (!eventLog) return;
  try {
    fs.appendFileSync(eventLog, `${event}:${process.pid}\n`);
  } catch {}
}

/** Wiring specs read the exact argv the session handed typst. */
const argsLog = process.env.TYPST_FAKE_ARGS_LOG;
if (argsLog) {
  try {
    fs.appendFileSync(argsLog, `${JSON.stringify(args)}\n`);
  } catch {}
}

const TINY_PDF = Buffer.from(
  [
    "%PDF-1.7",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 96 >> stream",
    "BT /F1 24 Tf 72 700 Td (Hello preview world) Tj ET",
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Root 1 0 R /Size 6 >>",
    "%%EOF",
    "",
  ].join("\n"),
  "latin1",
);

function writePdf(output) {
  // Write atomically enough for the watcher's completeness check: header
  // and EOF marker land with one call.
  fs.writeFileSync(output, TINY_PDF);
}

/**
 * The files the main file pulls in, the way the real typst names them in its
 * dependency report: the root plus every `#include`/`#import` target.
 *
 * The report is the session's only signal for which of the workspace's
 * `.typ` files are fragments of the document, so the fake has to produce a
 * faithful one.
 */
function inputsOf(main, rootDir) {
  const base = path.dirname(path.resolve(main));
  let text = "";
  try {
    text = fs.readFileSync(main, "utf8");
  } catch {
    return [path.resolve(main)];
  }
  const inputs = [path.resolve(main)];
  for (const match of text.matchAll(/#(?:include|import)\s+"([^"]+)"/g)) {
    const target = match[1];
    if (target.startsWith("/") && rootDir) {
      inputs.push(path.resolve(rootDir, target.slice(1)));
    } else {
      inputs.push(path.resolve(base, target));
    }
  }
  return inputs;
}

/** Write the dependency report the watcher reads after a round. */
function writeDeps(main, output) {
  // The real CLI takes the destination from `--deps <path>`; the fake reads
  // the same flag so the watcher finds the report where it looks for it.
  const flag = args.indexOf("--deps");
  const target = flag === -1 ? `${output}.deps.txt` : args[flag + 1];
  if (target === undefined) return;
  const rootFlag = args.indexOf("--root");
  const rootDir = rootFlag === -1 ? null : args[rootFlag + 1];
  fs.writeFileSync(target, JSON.stringify({ inputs: inputsOf(main, rootDir) }));
}

const command = args[0];

if (command === "--version" || args.includes("--version")) {
  process.stdout.write("typst 0.14.0 (fake)\n");
  process.exit(0);
}

/** A marker the specs write into the main file to exercise the failure path. */
function shouldFail(main) {
  try {
    return fs.readFileSync(main, "utf8").includes("FAIL_ME");
  } catch {
    return false;
  }
}

/** Parse the `--pages` value used by render: "1", "1,3", "2-4". */
function pageNumbers(spec) {
  const pages = [];
  for (const part of String(spec ?? "1").split(",")) {
    const range = part.split("-").map(Number);
    if (range.length === 2 && range.every(Number.isInteger)) {
      for (let page = range[0]; page <= range[1]; page++) pages.push(page);
    } else if (Number.isInteger(range[0])) {
      pages.push(range[0]);
    }
  }
  return pages.length > 0 ? pages : [1];
}

/** One compile round: deps, PDF/PNG output, and the matching log lines. */
function compileOnce(main, output, errorStream = process.stderr) {
  writeDeps(main, output);
  process.stdout.write(`compiling ${main}…\n`);
  if (shouldFail(main) || args.includes("--fail")) {
    // The real watch prints the round marker before the diagnostic block.
    process.stdout.write("compiled with errors in 3ms\n");
    errorStream.write("error: unknown variable: nope\n");
    errorStream.write("  ┌─ " + main + ":1:1\n");
    errorStream.write("  while calling `f` at " + main + ":1:1\n");
    errorStream.write("  = hint: check the spelling\n");
    return false;
  }
  if (output.endsWith("{p}.png")) {
    const pagesFlag = args.indexOf("--pages");
    const pages = pageNumbers(pagesFlag === -1 ? "1" : args[pagesFlag + 1]);
    for (const page of pages) {
      fs.writeFileSync(
        output.replace("{p}", String(page)),
        Buffer.from("89504e470d0a1a0a", "hex"),
      );
    }
  } else {
    writePdf(output);
  }
  process.stdout.write("compiled successfully in 5ms\n");
  return true;
}

if (command === "watch") {
  const main = args[1];
  const output = args[2];
  record("spawn");
  process.stdout.write("watching the project\n");
  // A signal handler proves the managed range terminated the watch itself,
  // not merely that the session stopped waiting for it.
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      record("signal");
      process.exit(0);
    });
  }
  // Watch output keeps one stream so line order is deterministic; the
  // one-shot compile below keeps diagnostics on stderr, like the real CLI.
  compileOnce(main, output, process.stdout);
  // Recompile like the real watcher when the main file changes. The session's
  // settle tests then exercise the watch path instead of a single round.
  fs.watchFile(main, { interval: 50 }, () =>
    compileOnce(main, output, process.stdout),
  );
  // Stay alive like the real watch, until the test kills the process group.
  setInterval(() => {}, 1_000);
} else if (command === "compile") {
  const main = args[1];
  const output = args[2];
  const ok = compileOnce(main, output);
  process.exit(ok ? 0 : 1);
} else {
  process.stderr.write("unknown command\n");
  process.exit(2);
}
