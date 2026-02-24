# RFC-012: Nanoclaw as Unju Swarm Runtime

**Status:** Accepted
**Author:** TBD
**Date:** 2026-02-21
**Repo:** `unju-ai/nanoclaw` (private fork of `qwibitai/nanoclaw`)

> **Note:** This RFC was accepted and nanoclaw is now the swarm runtime.
> This document is a stub. A full write-up should be backfilled from the decision context.

---

## Summary

This RFC proposes adopting **nanoclaw** (a private fork of `qwibitai/nanoclaw`) as the lightweight swarm execution runtime for the Unju agent platform.

## Context

The Unju swarm requires a runtime that can:
- Spin up agent workers on demand
- Manage inter-agent communication and coordination
- Remain lightweight enough to run alongside other services
- Integrate with the existing LiveKit / Durable Objects infrastructure

## Decision

**nanoclaw** — Unju's private fork of `qwibitai/nanoclaw` — is the swarm runtime for lightweight agent execution. It complements `unju-vm`, which provides full workspace environments (VS Code Server + LangGraph + LiveKit voice).

| Runtime | Use Case |
|---------|----------|
| **nanoclaw** | Lightweight swarm execution, quick agent tasks |
| **unju-vm** | Full Docker workspace, long-running development agents |

## Related

- [RFC-001: Agent Identity & Real-Time Communication](./RFC-001-agent-identity-and-realtime.md)

---

*Stub — backfill from implementation when time permits.*
