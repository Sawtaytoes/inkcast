# Always use latest dependencies; never scaffold with old ones

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** technical
- **Supersedes:** —
- **Superseded by:** —

## Decision

Inkcast pins dependencies to their **current latest** published versions and
keeps the toolchain current. When adding a dependency, resolve its latest version
(e.g. `npm view <pkg> version` or `yarn add <pkg>@latest`) rather than copying a
possibly-stale version from a sibling repo.

## Context

The scaffold initially mirrored `mux-magic`'s exact dependency versions. the maintainer
directed: use the latest, don't install old ones. Several deps were materially
behind (e.g. Satori `0.12` → `0.26`, sharp `0.34` → `0.35`, `@types/node`
`25` → `26`, Biome `2.4` → `2.5`).

## Why

- the maintainer: "Upgrade to the latest dependencies. We don't need to install old ones."
- Matches the sibling repos' locked "never downgrade the toolchain" rule (TS 6,
  Vitest 4, Biome 2, ESLint 10), extended to every dependency.

## Consequences

- The shared toolchain tracks the mux-magic house standard and moves forward with
  it, never backward.
- New deps are added at `@latest`; version bumps are routine, not avoided.
- Known-good exception handling: if a latest release breaks the build, pin to the
  last working version **and record why** (a superseding note), rather than
  silently staying old.
