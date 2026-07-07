import { execSync } from "node:child_process"
import { cpSync, mkdirSync } from "node:fs"
import { build } from "esbuild"

// Bundle the server to a single Node-runnable ESM file (run with plain `node`,
// NOT tsx — tsx in prod costs too much RAM). Mirrors mux-magic's
// build:server-bundle: native/heavy deps stay external and are installed as
// production deps in the runtime image.

await build({
  entryPoints: ["packages/server/src/index.ts"],
  outfile: "packages/server/dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  // Views use the automatic JSX runtime; esbuild defaults to classic, which
  // would throw "React is not defined" when the server renders a view.
  jsx: "automatic",
  // Externalized CJS deps require `require` in the ESM output.
  banner: {
    js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);",
  },
  external: [
    "playwright",
    "playwright-core",
    "sharp",
    "@resvg/resvg-js",
  ],
})

// The Satori engine loads its fonts by a path resolved from `import.meta.url`
// (→ the bundle's dir), so copy the TTFs next to the bundle.
mkdirSync("packages/server/dist/assets/fonts", {
  recursive: true,
})
cpSync(
  "packages/render/src/assets/fonts",
  "packages/server/dist/assets/fonts",
  { recursive: true },
)

// The Slatecast SPA is served by the server; build it and put the dist where
// pages.ts resolves it in prod (next to the server bundle).
execSync("yarn workspace @castkit/slatecast build", {
  stdio: "inherit",
})
cpSync(
  "packages/slatecast/dist",
  "packages/server/dist/slatecast",
  { recursive: true },
)

console.log(
  "[build] packages/server/dist/index.js + fonts + slatecast SPA",
)
