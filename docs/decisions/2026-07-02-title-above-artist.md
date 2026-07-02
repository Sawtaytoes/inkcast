# Now-playing layouts put the track title first, above the artist

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

In the now-playing views (Dashboard first), the **track title** is the visual
anchor: first line, biggest and bold. Artist second, album third. An
empty/"—" artist line renders nothing. When a long title shrink-to-fits
smaller, the artist/album sizes cap below it so the hierarchy never inverts.
The Editorial and Poster variants stay in the select for now — the maintainer
hasn't A/B'd them on the big panel yet; removal is future work, not tonight.

## Context

The Dashboard rendered artist-first with the artist in the largest type.

## Why

Maintainer preference from looking at the real panel.

## Evidence

> "The title should be at the top, not the artist especially in the 'Now
> Playing (Dashboard)' one. I think we can remove the other two and just
> leave it as 'Now Playing'. But I haven't seen those on the larger screen.
> Keep them for now until I have a chance to test."

— maintainer, chat `4cb59eb7-5aea-4f0e-8404-f49dcd7a16e3` (2026-07-02)
