# Views use inline style objects (Satori-safe), not Emotion or Tailwind

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** technical
- **Supersedes:** —
- **Superseded by:** —

## Decision

Inkcast view components style themselves with **inline React `style` objects**
using a **flexbox-only** layout. No Emotion (CSS-in-JS), no Tailwind, no external
stylesheets in the view components.

## Context

The base repos suggested Emotion (`image-viewer`) as a styling reference. During
scaffolding this was flagged and corrected: first away from Emotion toward
Tailwind, then toward "custom CSS is probably fine since these are each unique
views".

The deciding technical constraint: the Decision-1 render bake-off renders the
**same** React component through **both** Chromium and **Satori**. Satori only
understands **inline styles with a flexbox subset** — it does not run Tailwind
classes, Emotion's injected CSS, `<style>` tags, or CSS grid. To keep the two
engines rendering identically (the entire point of the parity comparison), the
views must use the intersection both engines support: inline style objects +
flexbox.

## Why

- the maintainer: "We should be using Tailwind, not Emotion." → "Although, I'm not sure if
  even Tailwind matters. Custom CSS might be fine since these are each unique
  views."
- Engine parity: inline + flexbox is the only styling both Chromium and Satori
  render the same way.
- Each view is bespoke, so utility classes buy little; inline styles keep a view
  self-contained and readable.

## Consequences

- View components type their styles as `CSSProperties` and compose via `style={}`.
- If a Chromium-only visual editor later wants Tailwind utilities, that can be
  layered into the editor chrome — but the **device-bound views** stay inline so
  Satori remains a viable engine.
