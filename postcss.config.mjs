import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// Resolve the ACTUAL project root — the folder that contains node_modules/tailwindcss.
// We can't trust process.cwd() (the dev server may be launched with cwd = c:\) nor the
// bare dirname of this file (Next relocates the config into .next). So walk upward from
// the most reliable starting points until we find the folder holding tailwindcss.
// This is what `@tailwindcss/postcss` uses as the `@source` scanning base.
function findProjectRoot() {
  const starts = [
    dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
  ];
  for (const start of starts) {
    let dir = start;
    // Walk up to the filesystem root looking for node_modules/tailwindcss.
    while (dir) {
      if (existsSync(join(dir, "node_modules", "tailwindcss", "package.json"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break; // reached the drive/fs root
      dir = parent;
    }
  }
  // Last resort: cwd (keeps previous behavior if the search somehow fails).
  return process.cwd();
}

const base = findProjectRoot();

// NOT "@tailwindcss/postcss" directly — see postcss-tailwind.cjs. Tailwind ignores
// `base` when resolving `@import "tailwindcss"` and instead uses
// dirname(result.opts.from), which is the drive root `c:\` whenever a build pass
// omits `from` (this project sits at c:\iSched). The wrapper repairs `from` first,
// then delegates to Tailwind with these same options.
//
// The path must be ABSOLUTE: Turbopack bundles this config into
// `.next/dev/build/postcss.js` and requires each plugin from *there*, so a
// relative "./postcss-tailwind.cjs" fails with "Cannot find module".
const wrapper = join(base, "postcss-tailwind.cjs");

const config = {
  plugins: {
    // Defensive: if the wrapper ever goes missing, fall back to the plain plugin
    // rather than taking the whole build down with a module-not-found.
    [existsSync(wrapper) ? wrapper : "@tailwindcss/postcss"]: { base },
  },
};

export default config;
