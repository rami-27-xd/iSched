/**
 * Wrapper around `@tailwindcss/postcss` that guarantees it can resolve
 * `@import "tailwindcss"`.
 *
 * The bug it fixes
 * ----------------
 * `@tailwindcss/postcss` does NOT use its `base` option to resolve the CSS
 * `@import`s. It derives that directory itself:
 *
 *     const dir = path.dirname(path.resolve(result.opts.from ?? ""))
 *
 * Some passes in the Next build pipeline run the PostCSS chain without a
 * `from`, so that expression collapses to `path.dirname(process.cwd())`.
 *
 * This project lives at `C:\iSched` — directly under the drive root — so the
 * parent directory is `C:\`, which has no `node_modules`. Tailwind's resolver
 * then fails with the error that shows up on every `npm run dev`:
 *
 *     Error: Can't resolve 'tailwindcss' in 'c:\'
 *       No description file found in c:\ or above
 *       c:\node_modules doesn't exist or is not a directory
 *
 * The fix
 * -------
 * Before Tailwind's plugin runs, check whether the directory it is about to
 * resolve from can actually see `tailwindcss`. If it can't, point `from` at
 * this project's real entry stylesheet, which sits next to `node_modules`.
 *
 * Referenced by string path from postcss.config.mjs, because Next only accepts
 * PostCSS plugins named as strings (a function or object entry is rejected with
 * "A PostCSS Plugin must be provided as a string").
 */
const path = require("node:path")
const tailwindcss = require("@tailwindcss/postcss")

// Real file, next to node_modules — the stylesheet that actually carries the
// `@import "tailwindcss"` this whole dance is about.
const ENTRY_CSS = path.join(__dirname, "app", "globals.css")

/** Can `tailwindcss` be resolved as a module starting from `dir`? */
function canResolveTailwind(dir) {
  try {
    require.resolve("tailwindcss/package.json", { paths: [dir] })
    return true
  } catch {
    return false
  }
}

// PostCSS's Processor.normalize() flattens a plugin pack exactly ONE level
// (`normalized.concat(i.plugins)`) — it does not recurse. `@tailwindcss/postcss`
// is itself a pack, so nesting it inside ours would leave it in the chain as an
// object with no visitors: it would silently do nothing and the stylesheet would
// come out with `@import "tailwindcss"` untouched. Flatten it ourselves.
function flatten(plugin) {
  return Array.isArray(plugin?.plugins) ? plugin.plugins.flatMap(flatten) : [plugin]
}

module.exports = (opts = {}) => ({
  postcssPlugin: "tailwindcss-with-resolvable-base",
  plugins: [
    {
      postcssPlugin: "tailwindcss-from-fallback",
      Once(_root, { result }) {
        // Mirror Tailwind's own derivation so the check is exact rather than a guess.
        const dir = path.dirname(path.resolve(result.opts.from ?? ""))
        if (!canResolveTailwind(dir)) {
          result.opts.from = ENTRY_CSS
        }
      },
    },
    ...flatten(tailwindcss(opts)),
  ],
})

module.exports.postcss = true
