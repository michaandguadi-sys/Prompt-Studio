/**
 * Reads Root.tsx, inserts a new <Composition> entry, writes it back.
 * Uses simple regex insertion — Root.tsx is small and predictable.
 */

export function patchRootTsx(args: {
  rootSource: string;
  componentName: string;     // e.g. Scene03Istanbul
  importPath: string;        // e.g. ./Scene03-Istanbul
  compositionId: string;     // e.g. Scene03-Istanbul
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}): string {
  let src = args.rootSource;

  // 1) Add import if missing
  const importLine = `import { ${args.componentName} } from "${args.importPath}";`;
  if (!src.includes(importLine)) {
    // Find last import and insert after it
    const importBlockRe = /(import\s+[^;]+;\s*\n)+/;
    const match = src.match(importBlockRe);
    if (match) {
      const insertAt = (match.index ?? 0) + match[0].length;
      src = src.slice(0, insertAt) + importLine + "\n" + src.slice(insertAt);
    } else {
      src = importLine + "\n" + src;
    }
  }

  // 2) Add <Composition> entry if missing
  const compositionTag = `id="${args.compositionId}"`;
  if (!src.includes(compositionTag)) {
    const newComp = `      <Composition
        id="${args.compositionId}"
        component={${args.componentName}}
        durationInFrames={${args.durationInFrames}}
        fps={${args.fps}}
        width={${args.width}}
        height={${args.height}}
      />\n`;

    // Insert before the closing </> fragment
    const fragRe = /(\s*)<\/>/;
    const m = src.match(fragRe);
    if (m) {
      const at = m.index!;
      src = src.slice(0, at) + "\n" + newComp + src.slice(at);
    } else {
      // Fallback: try </React.Fragment>
      src = src.replace(
        /<\/React\.Fragment>/,
        newComp + "    </React.Fragment>",
      );
    }
  }

  return src;
}

/** Default Root.tsx if missing entirely */
export function defaultRootTsx(): string {
  return `import React from "react";
import { Composition } from "remotion";

export const Root: React.FC = () => {
  return (
    <>
    </>
  );
};
`;
}
