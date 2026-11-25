/** Project options shared by `typst watch` and `typst compile`. */
export interface TypstFlagOptions {
    root?: string;
    fontPaths?: string[];
    packagePath?: string;
}
export declare function typstFlags({ root, fontPaths, packagePath, }: TypstFlagOptions): string[];
//# sourceMappingURL=flags.d.ts.map