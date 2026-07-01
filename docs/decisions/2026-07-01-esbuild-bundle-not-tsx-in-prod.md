# Production runs an esbuild bundle with `node`, never `tsx`

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** technical
- **Supersedes:** —
- **Superseded by:** —

## Decision

The production server runs a **bundled `dist/index.js` under plain `node`**
(`yarn build` → esbuild bundle → `node --enable-source-maps dist/index.js`). It
does **not** run TypeScript directly via `tsx` in production. `tsx` is for dev
(`yarn dev:server`, watch mode) only.

## Context

The first pass ran the container entrypoint via `tsx src/index.ts`. That was a
regression against the established toolchain pattern in the maintainer's sibling
repos, which bundle the server with esbuild and run it with `node`.

## Why

- **`tsx` in production uses too much RAM** — it keeps a transpiler/loader in the
  process. A pre-bundled JS file run by plain `node` has a far smaller footprint,
  which matters for a small always-on container.
- It matches the proven sibling-repo pattern (esbuild `build:server-bundle` →
  `node dist/index.js`), so the toolchain stays consistent.

## Implementation notes

- `scripts/build-server.mjs` bundles `packages/server/src/index.ts` → ESM,
  `platform: node`, `jsx: automatic` (views use the automatic runtime), with the
  native/heavy deps external (`playwright`, `sharp`, `@resvg/resvg-js`) and
  installed as production deps in the runtime image.
- The Satori engine loads its fonts by a path resolved from `import.meta.url`, so
  the build copies the TTFs next to the bundle (`dist/assets/fonts`).

## What we rejected — DO NOT revert to this

Do not set the prod entrypoint (Dockerfile `CMD`, `start:prod`) to `tsx`. Dev
watch mode is the only place `tsx` belongs.
