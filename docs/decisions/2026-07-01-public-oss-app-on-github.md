# Inkcast is a public open-source app, not a private repo

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** direction
- **Supersedes:** —
- **Superseded by:** —

## Decision

Inkcast is published as a **public, open-source repository** (on GitHub), not on
the private self-hosted Git server that holds the maintainer's homelab repos. The
repo is set up for third-party self-hosting: permissive license, clean README, no
secrets committed, and no hard-coded private hostnames or device identifiers in
the app code — device/broker config comes entirely from the environment.

## Context

The homelab automation repos are private (they encode a specific network,
credentials, and household specifics). Inkcast is different in kind: it is a
general-purpose e-ink render/push **application** that anyone could run against
their own panels.

## Why

The maintainer chose to open-source it because others could use it too, whereas
the homelab automation work stays private. Building for an external audience from
day one keeps environment-specific assumptions out of the code (they belong in
config/env), which also keeps the app cleaner for the maintainer's own use.

## Consequences

- The public remote is **not** created and nothing is pushed until the Phase-0
  spine is confirmed ready to publish (publishing is outward-facing).
- Ship a permissive `LICENSE` (MIT) and keep the README self-host-friendly.
- Secrets (MQTT broker creds, device tokens) and anything house-specific
  (hostnames, real device MACs/names) are read from the environment or a
  gitignored config, never committed.
