# Slatecast's client is a tiny Preact SPA — React Server Components and htmx rejected

- **Status:** Accepted
- **Date:** 2026-07-07
- **Type:** Tech stack
- **Supersedes:** —
- **Superseded by:** —

## Decision

The browser-mode client (`@castkit/slatecast`) is **Preact + @preact/signals**,
built with Vite, no router, total JS budget **< 60 KB gzipped**. First paint is
a static HTML shell with the device's current state snapshot inlined as JSON
(no SSR/hydration machinery). Live data arrives over one WebSocket; taps are
optimistic and reconciled by the next retained push; the seek bar ticks locally
at 1 Hz from `positionUpdatedAt`. `cursor: none` always.

## Context

Kiosk Pis are memory-starved (Pi Zero 2 W: 512 MB; WPE baseline for the full
Music Assistant SPA ≈ 371 MB PSS). The maintainer asked whether React Server
Components would keep devices low-memory.

## Why

Device RAM is dominated by the browser **engine**, not the framework — the
lever is a tiny bundle and few DOM nodes. Against that:

- **RSC/Next.js:** the client runtime + flight deserializer outweighs Preact's
  ~4 KB core, and RSC's request/response streaming fights a persistent
  1 Hz-live page whose state the server already owns. Zero benefit here.
- **htmx/SSE server-driven HTML (closest runner-up):** the two hardest UI
  pieces — drag-to-scrub and the local position ticker — are client JS anyway,
  and DOM-morphing every second causes layout/GC churn WPE handles poorly;
  you'd ship custom JS *plus* htmx *plus* fragment templating.
- **Preact over React:** same component model at ~1/10 the size; confirmed by
  the maintainer ("super fast and low-memory" is the requirement).

## Evidence

> "Using Preact over React is fine if it's lighter overall. We need something
> super fast and low-memory."

— maintainer, this chat (2026-07-07), after reviewing the RSC assessment.
