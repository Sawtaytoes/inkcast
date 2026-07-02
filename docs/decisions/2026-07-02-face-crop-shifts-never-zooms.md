# Photo-frame face awareness SHIFTS the crop; it never zooms in on faces

- **Status:** Accepted
- **Date:** 2026-07-02
- **Type:** Product behavior
- **Supersedes:** —
- **Superseded by:** —

## Decision

The Photo Frame crop is always the **largest** target-aspect window the image
allows (a normal cover-crop). Face boxes only decide **where** that window
sits: it starts centered and shifts the minimum distance needed to keep every
configured face in frame. If the faces span more than even the maximal window
can hold, the photo is letterboxed on white instead. Faces never shrink the
window.

## Context

The first implementation cropped the *smallest* window containing the padded
face union — effectively zooming into faces and discarding the rest of the
photo. A portrait photo also surfaced the opposite failure on the old
on-device fetcher: a center crop that cut off faces sitting at the top.

## Why

The maintainer wants the whole photo experience, with faces guaranteed
visible — not a face close-up.

## Evidence

> "Instead of just making sure faces are 'in frame', it's actually zooming in
> on faces, and you lose the rest of the photo. That's not what I want. …
> Either we letterbox/pillarbox it or move where the crop occurs, so you can
> see everyone. … there was a portrait picture … all the faces were at the
> top, so we simply needed to shift the crop up for that one."

— maintainer, chat `4cb59eb7-5aea-4f0e-8404-f49dcd7a16e3` (2026-07-02)
