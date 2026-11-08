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

if (command === "watch") {
  const main = args[1];
  const output = args[2];
  writeDeps(main, output);
  process.stdout.write("watching the project\n");
  process.stdout.write(`compiling ${main}…\n`);
  setTimeout(() => {
    writePdf(output);
    // The real watch rewrites its dependency report every round, so the
    // session sees an include that appeared since the last compile.
    writeDeps(main, output);
    process.stdout.write("compiled successfully in 12.5ms\n");
    // Stay alive like the real watch, until the test kills the process group.
    setInterval(() => {}, 1_000);
  }, 50);
} else if (command === "compile") {
  const main = args[1];
  const output = args[2];
  if (args.includes("--fail")) {
    process.stderr.write("error: unknown variable: nope\n");
    process.stderr.write("  ┌─ " + main + ":1:1\n");
    process.stderr.write("  = hint: check the spelling\n");
    process.exit(1);
  }
  if (output.endsWith("{p}.png")) {
    const base = output.replace("{p}", "1");
    require("node:fs").writeFileSync(
      base,
      Buffer.from("89504e470d0a1a0a", "hex"),
    );
  } else {
    writePdf(output);
  }
  process.stdout.write(`compiling ${main}…\n`);
  process.stdout.write("compiled successfully in 5ms\n");
  process.exit(0);
} else {
  process.stderr.write("unknown command\n");
  process.exit(2);
}
