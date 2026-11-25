/** Project options shared by `typst watch` and `typst compile`. */
export interface TypstFlagOptions {
  root?: string;
  fontPaths?: string[];
  packagePath?: string;
}

export function typstFlags({
  root,
  fontPaths,
  packagePath,
}: TypstFlagOptions): string[] {
  return [
    ...(root ? ["--root", root] : []),
    ...(fontPaths ?? []).flatMap((dir) => ["--font-path", dir]),
    ...(packagePath ? ["--package-path", packagePath] : []),
  ];
}
