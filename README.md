# unju-docs

Canonical home for all RFCs, ADRs, and the public OpenAPI spec for the unju.ai platform.

---

## Architecture Decision Records (ADRs)

Decisions that are made and locked. Change only by supersession.

| # | Title | Status | Date |
|---|-------|--------|------|
| [ADR-001](adr/ADR-001-authentication-and-wallet-strategy.md) | Authentication & Wallet Strategy | ✅ Accepted | 2026-02-21 |

---

## Request for Comments (RFCs)

Proposals — some implemented, some in-flight, some not yet started.

| # | Title | Status | Repo | Date |
|---|-------|--------|------|------|
| [RFC-001](rfc/RFC-001-agent-identity-and-realtime.md) | Agent Identity, Real-Time Communication & Task Economy | 🔄 Draft | unju-a2a | 2026-02-21 |
| [RFC-002](rfc/RFC-002-agent-authentication-strategy.md) | Agent Authentication — Privy vs Magic vs In-House | 🏁 Superseded by ADR-001 | unju-a2a | 2026-02-21 |
| [RFC-004](rfc/RFC-004-domain-router-architecture.md) | Domain-Router Architecture | ✅ Implemented | unju-api | 2026-02-21 |
| [RFC-012](rfc/RFC-012-nanoclaw-swarm-runtime.md) | Nanoclaw as Unju Swarm Runtime | ✅ Accepted | nanoclaw | 2026-02-21 |
| [RFC-013](rfc/RFC-013-swarm-template-nfts.md) | SwarmTemplate NFTs & Swarm Marketplace | 💡 Proposed | unju-a2a | 2026-02-21 |
| [RFC-014](rfc/RFC-014-cli-distribution.md) | CLI Distribution — npm publish, install.sh, llms.txt, standalone binaries | 💡 Proposed | unju-api | 2026-02-22 |
| [RFC-015](rfc/RFC-015-domain-aliases-primer-onboarding-mcp.md) | Domain Aliases, Agent Primer Onboarding & MCP Component Architecture | 💡 Proposed | unju-api, unju-ionic | 2026-02-23 |
| [RFC-016](rfc/RFC-016-unju-perps-mcp-server.md) | Unju-Perps MCP Server with Interactive UIs (MCP Apps) | ✅ Implemented (Phase 1) | unju-perps | 2026-02-25 |
| [RFC-017](rfc/RFC-017-unju-agent-wallet.md) | Unju Agent Wallet — MetaMask Fork + ERC-4337 + Rust Core | 💡 Proposed | unju-wallet | 2026-02-25 |
| [RFC-018](rfc/RFC-018-wallet-first-identity.md) | Wallet-First Identity System with SIWE & Virtual Emails | 🔄 Draft | unju-wallet | 2026-02-25 |

---

## OpenAPI Spec

`openapi.json` — machine-readable API spec for `api.unju.ai`. Built and deployed via `build.js`.

---

## Contributing

### Filing an RFC

1. Pick the next available number
2. Create `rfc/RFC-NNN-short-slug.md` using the template below
3. Open a PR — discussion happens in the PR
4. RFC is merged as **Draft** or **Proposed**
5. When a decision is made, update status and open or reference an ADR if applicable

### RFC Template

```markdown
# RFC-NNN: Title

**Status:** Proposed
**Author:** Your name
**Date:** YYYY-MM-DD
**Repo:** unju-ai/repo-name

## Summary

One paragraph.

## Problem

What's broken or missing?

## Proposal

What do we do about it?

## Open Questions

What still needs to be decided?
```

### Filing an ADR

ADRs record decisions that have been made. They are typically filed after RFC discussion closes.

1. Create `adr/ADR-NNN-short-slug.md`
2. Status should be **Accepted** at time of filing
3. Reference the RFC(s) that led to the decision
4. ADRs are not changed — supersede them with a new ADR if the decision changes

### Status Legend

| Status | Meaning |
|--------|---------|
| 💡 Proposed | Filed, not yet discussed |
| 🔄 Draft | Under active discussion |
| ✅ Accepted / Implemented | Decision made or code shipped |
| 🏁 Superseded | Replaced by a later RFC or ADR |
| ❌ Rejected | Considered and declined |

---

## Source of Truth

**All RFCs and ADRs live here.** If a doc exists in another repo, it should be migrated here and replaced with a tombstone pointing to this repo.

Previous locations:
- `unju-a2a/docs/rfc/` and `unju-a2a/docs/adr/` — migrated 2026-02-24
