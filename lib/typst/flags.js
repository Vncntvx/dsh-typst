export function typstFlags({ root, fontPaths, packagePath, }) {
    return [
        ...(root ? ["--root", root] : []),
        ...(fontPaths ?? []).flatMap((dir) => ["--font-path", dir]),
        ...(packagePath ? ["--package-path", packagePath] : []),
    ];
}
//# sourceMappingURL=flags.js.map