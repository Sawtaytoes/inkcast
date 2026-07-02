# Docker images publish to GHCR via GitHub Actions, not the homelab registry

- **Status:** Accepted
- **Date:** 2026-07-01
- **Type:** Infrastructure
- **Supersedes:** —
- **Superseded by:** —

## Decision

Inkcast's container image builds in **GitHub Actions** and publishes to
**`ghcr.io/sawtaytoes/inkcast`**. TrueNAS (and anyone else) pulls from GHCR.
Inkcast does NOT go through Gitea Actions or `docker-registry.octen.dev`.

## Context

The homelab's standing rule (agentic root,
`2026-06-18-gitea-actions-auto-build-to-registry.md`) routes containerized
projects through Gitea Actions to the private registry. Inkcast is a public
OSS project whose canonical home is GitHub, so its CI/CD lives there too. The
homelab rule still stands for private projects; this repo is the exception,
not a supersession.

## Why

One canonical remote (GitHub) instead of a Gitea mirror; a public image on a
public registry matches the public repo and lets third parties pull it.

## Evidence

> "Inkcast is gonna be through GitHub, not Gitea. So the registry is the
> public GitHub one. We'll pull from there."

— maintainer, chat `901a94bc-24c1-4de7-b3cd-e9e80b9ea9d9` (2026-07-01)
