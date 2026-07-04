# AGENTS.md

Guidelines for AI agents working on **Inkcast** — a self-hostable e-ink display
render/push platform. Server renders per-device PNGs (React → Chromium/Satori →
per-panel dither) and pushes them to dumb Pi-Zero-W fetchers; devices surface in
Home Assistant via MQTT discovery.

## ⛔ Locked decisions — read before changing behavior

[docs/decisions/](docs/decisions/README.md) is an **append-only** log of settled
decisions. Do not silently reverse or re-litigate one. To change a locked
decision, add a NEW dated file that supersedes the old one (link both ways) and
get sign-off first. Skim the [index](docs/decisions/README.md) before any
non-trivial task. Highlights:

- **Public OSS app.** No secrets, credentials, hostnames, or real device
  identifiers in git — config comes from the environment (`.env`, gitignored).
- **⛔ User-tunable settings are HA/MQTT config entities — NEVER new env vars.**
  Anything a user might want to change per install or per screen (view settings,
  photo format/quality/interval, weather entity, crop insets, brightness, …) is
  exposed as a Home Assistant MQTT-discovery config entity — a **global default**
  on the "Inkcast Server" device **plus a per-device override** — with the
  retained state topic as its persistence. Do **not** reach for a `process.env`
  knob for these. Env vars are reserved for **deploy-time infrastructure** only
  (broker host/creds, HA URL/token, render engine, ports). To add a user knob,
  mirror an existing one end-to-end: `deviceConfigStore` field → `buildDeviceTopics`
  / `buildGlobalTopics` → `buildDiscoveryMessages` / `buildGlobalDiscoveryMessages`
  → the `configKnobs` / `globalConfigKnobs` maps + `getKnobTopics` + the seed list
  in `index.ts`. See
  [docs/decisions/2026-07-03-user-tunable-view-settings-are-ha-config-entities.md](docs/decisions/2026-07-03-user-tunable-view-settings-are-ha-config-entities.md).
- **Develop on a local disk (node-modules linker).** A mapped network share
  can't host the Yarn-workspace symlinks (both `node-modules` and PnP fail over
  SMB) — keep the working tree on a local drive.
- **Views use inline style objects** (Satori-safe flexbox), not Emotion/Tailwind.
- **Latest dependencies**, never scaffold with old ones.
- **Prod = esbuild bundle + `node`**, never `tsx` (RAM). `yarn build` → `node
  dist/index.js`.
- **No redundant arrow return-type annotations** — let TS infer (see code-rules).

## Project

A TypeScript monorepo (Yarn 4 workspaces). The server renders a per-device HTML
view with headless Chromium (or Satori), quantizes/dithers it to the panel's
palette, and pushes it over MQTT; devices surface in Home Assistant via MQTT
discovery. Architecture + phase plan are in the README and
[docs/phase-0-findings.md](docs/phase-0-findings.md).

### Packages

| Package | Scope |
| --- | --- |
| `@inkcast/core` | Panel/palette definitions, device registry, the supersample→downscale→dither pipeline. No HTTP/engine deps. |
| `@inkcast/views` | Static React view components rendered by BOTH engines (inline styles, flexbox subset). One component per file. |
| `@inkcast/render` | Render engines: headless Chromium (Playwright) and Satori (SVG→resvg). Same view in, supersampled PNG out. |
| `@inkcast/web` *(planned)* | Vite browser dev-preview + view catalog. |
| `@inkcast/server` *(planned)* | Hono token API + MQTT publish/subscribe + idle/active state machine. |

### Bake-offs (Phase 0)

- `yarn bakeoff:render` — Decision 1: renders the now-playing card through
  Chromium AND Satori at both panels → `render-output/render/`.
- `yarn bakeoff:dither` — Decision 2: dithers card/gradient/photo with every
  algorithm × supersample factor, one contact sheet per (panel, image), mono and
  E6 separate → `render-output/dither/`.

e-ink can't be screenshotted; the sheets are the review artifact. `render-output/`
is gitignored (regenerated artifacts).

### View authoring — JSX pragma required

Every `.tsx` **view** file (in `@inkcast/views`) must start with:

```ts
/** @jsxRuntime automatic @jsxImportSource react */
```

Reason: the bake-off + render code runs under `tsx`, which transpiles files it
sees under `node_modules` (our workspace packages are symlinked there) with the
**classic** JSX runtime, ignoring the tsconfig `jsx` setting — so without the
pragma, `renderToStaticMarkup` throws `ReferenceError: React is not defined`. Vite
and Vitest don't need it (they process workspace source with automatic JSX), but
the pragma is harmless there and keeps every path consistent.

## The five most-violated code rules (from mux-magic; enforced here)

1. **No `for`/`for...of`/`while` over arrays.** Use `forEach`/`map`/`filter`/`reduce`.
2. **`const` only. No `let` mutation.**
3. **Spell every variable name out.** No single letters or abbreviations.
4. **Booleans start with `is`/`has`.**
5. **No array mutation** (`concat` over spread-push).

Plus: function destructuring for 2+ args, always-braced `if`/`else`, arrow
functions, no barrel files, JSDoc immediately above exports, and **no redundant
arrow return-type annotations** (let TS infer; keep only type predicates
`x is Y`, or where inference genuinely breaks — e.g. a factory whose branches
return a shared interface).

## Mirror the sibling app repos — don't regress their settled conventions

Inkcast deliberately mirrors the maintainer's other TypeScript app repos (the
`mux-magic` family): Yarn 4, TS 6 NodeNext, Biome + ESLint, Vitest, esbuild-bundle
prod, the code rules above. Those repos carry a `docs/decisions/` log of **locked**
toolchain/convention decisions. Before changing any toolchain, build, lint, test,
or code-style choice here, assume the sibling repos already settled it — match
them rather than introducing a different approach. Regressing one of their locked
decisions in this repo is the failure mode to avoid.

## Before every commit

- `yarn lint` — Biome (`--write --unsafe`) then ESLint (`--fix`); re-stage changed files.
- `yarn typecheck` — full monorepo type check.
- `yarn test` — Vitest unit tests.

Commit small and often; conventional commits; one logical change per commit.

**Push as you go — no go-ahead needed.** While this is a **single-maintainer** repo,
commit each logical change and **push it straight to `master`** so CI rebuilds the
`:latest` image and TrueNAS/Home Assistant self-update without the maintainer touching
the server. Don't wait to be asked and don't batch pushes. (If this repo ever gains
other contributors, revert to a review-before-push flow — supersede this line then.)

## Package manager

Always `yarn`, never `npm`/`npx`. One-off executables use `yarn dlx <pkg>`.
Add deps at latest: `yarn workspace @inkcast/<pkg> add <dep>@latest`.

## Environment / secrets

No secrets in git. The MQTT broker host/credentials, device tokens, and any HA
connection details are read from environment variables at runtime (`.env` is
gitignored). Keep the app portable so a third party can self-host.

Env vars are for **deploy-time infrastructure only** (broker, HA URL/token,
render engine, ports, Immich URL/key). **User-tunable settings do NOT belong in
env** — they're HA/MQTT config entities (global default + per-device override);
see the locked-decision rule above.
