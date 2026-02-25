# ADR-002: Cloudflare Containers as VM Layer (replacing Fly.io)

**Status:** Accepted  
**Date:** 2026-02-25  
**Deciders:** Esper, Bhaiṣajyaguru (Reviewer)  
**Supersedes:** Fly.io VM integration (removed from `unju-api`)

---

## Context

`unju-vm` provides isolated workspace containers for agents — code execution, file system access, MCP tool exposure, and R2-backed persistence. The original implementation used **Fly.io Machines API** to launch and manage these containers.

Problems that surfaced:

1. **OAuth fragmentation** — Fly.io has its own auth system (`fly auth token`) entirely separate from the Cloudflare ecosystem. Every deployment required managing a second token source, second billing relationship, and second control plane.
2. **Cross-datacenter latency** — The unju-api Worker (Cloudflare edge) had to make HTTP calls to Fly.io's Machines API (centralized infrastructure), adding network hops on every VM lifecycle operation.
3. **Inconsistent routing** — Fly machine lookup is fleet-based; there was no deterministic mapping from `userId → machine`. A user could land on different machines across sessions.
4. **R2 mount complexity** — Mounting R2 buckets into Fly machines required rclone/s3fs bridges with cross-cloud credentials. Unreliable and operationally heavy.
5. **Two health models** — Fly machines have their own health/readiness lifecycle that had to be bridged into the DO state machine, creating duplicated logic.

## Decision

Replace Fly.io with **Cloudflare Containers** via a `UserContainer` Durable Object.

### Architecture

```
unju-api Worker
    │
    └─ UserContainer DO (id = userId)
            │
            ├─ Container instance (unju-vm Docker image)
            │       └─ VS Code Server
            │       └─ Claude Code / LangGraph agents
            │       └─ MCP server
            │
            └─ R2 bucket (FUSE mount — same account, zero credentials)
```

**Routing is deterministic:** `userId` → Durable Object ID → same container instance, always. No fleet, no machine lookup, no session affinity complexity.

**Lifecycle managed by DO:**

| State | Meaning |
|-------|---------|
| `stopped` | Container not running, workspace persists in R2 |
| `starting` | Container booting |
| `running` | Ready for traffic |
| `error` | Boot failed, `onError` triggered |

### Key implementation details

- `UserContainer` extends `WorkerEntrypoint` with a `Container` instance
- `containerFetch()` auto-wakes sleeping containers on request (no manual start needed for HTTP calls)
- `handleStart()` uses high-level Container API only — no mixing with low-level `ctx.container.*`
- `stop()` / `destroy()` routed through `this.stop()` / `this.destroy()` to preserve lifecycle hooks
- Credit deduction uses atomic SQL: `UPDATE ... WHERE creditBalance >= cost` (no TOCTOU race)
- Shared pricing in `src/lib/vm-pricing.ts` (`EXEC_CREDIT_COST`, `calcCredits()`)
- Shell commands never interpolate user content — written to temp files, path passed to executor

### Tradeoffs

| | Cloudflare Containers | Fly.io Machines |
|---|---|---|
| Auth model | Same CF account token | Separate Fly token |
| Routing | Deterministic (DO id) | Fleet-based |
| R2 mount | Native FUSE (same account) | rclone/s3fs bridge |
| Datacenter | Co-located with Worker | Cross-datacenter hop |
| Debugging | `onError` + `getState()` | SSH + `fly logs` |
| Maturity | GA (v1.1, Feb 2026) | Battle-hardened |
| Pricing | ~$0.05/hr | ~$0.05/hr |

The debugging surface on CF Containers is thinner — no SSH exec into running containers from outside. `onError` hook and `getState()` are the primary signals. This is an acceptable tradeoff for the architectural consistency gained.

## Consequences

- `src/lib/fly.ts` removed entirely
- All VM lifecycle now in `src/lib/user-container.ts` (DO) + `src/lib/vm.ts` (routes)
- Wrangler secrets required: `CONTAINER_IMAGE`, `R2_BUCKET_NAME`, `WORKER_SECRET`
- Wrangler bindings required: `containers` (Container binding), `USER_WORKSPACES` (R2 bucket)
- Pricing constants live in `src/lib/vm-pricing.ts` — single source of truth for both `vm.ts` and `mcp-vm.ts`
- One control plane, one billing account, one auth token going forward
