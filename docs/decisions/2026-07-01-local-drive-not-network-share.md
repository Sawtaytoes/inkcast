# Develop on a local disk with the node-modules linker, not a network share

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** constraint
- **Supersedes:** —
- **Superseded by:** —

## Decision

Keep the Inkcast working tree on a **local disk** and use Yarn's standard
**`nodeLinker: node-modules`**. Do not develop it from a mapped/mounted network
share (SMB/NFS).

## Context

An initial scaffold on a mapped SMB network drive failed two independent ways,
each fatal for a Node/Yarn workspace:

1. **`nodeLinker: node-modules`** → `EPERM: operation not permitted, symlink`
   when Yarn links workspace packages into `node_modules`. Network shares don't
   support the directory symlinks a workspace monorepo requires.
2. **`nodeLinker: pnp`** (tried as a symlink-free alternative) → `EBADF: bad
   file descriptor, fstat` from the PnP ESM loader reading files over the share.

## Why

Local disk supports symlinks and reliable `fstat`, so the standard toolchain
(node-modules linker, Vitest, Playwright, native `sharp`/`resvg`) works without
PnP workarounds. Network-share filesystem quirks are not worth fighting.

## Evidence

- `EPERM … symlink … packages/core -> node_modules/@inkcast/core` on the share.
- `EBADF … fstat … ModuleLoader.commonjsStrategy` under PnP on the share.
- On a local disk with the node-modules linker, `yarn install` + `yarn
  typecheck` are green.

## Consequences

- The Git remote (see
  [public-oss-app-on-github](2026-07-01-public-oss-app-on-github.md)) is the
  source of truth across machines, not any network share.
