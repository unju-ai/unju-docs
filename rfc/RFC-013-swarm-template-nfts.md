# RFC-013: SwarmTemplate NFTs & Swarm Marketplace

**Status:** Proposed
**Author:** TBD
**Date:** 2026-02-21
**Repo:** `unju-ai/unju-a2a` (contracts), `unju-ai/unju-api` (marketplace API)

> **Note:** This RFC was proposed during architecture discussions on 2026-02-21.
> This document is a stub. A full write-up is needed before implementation begins.

---

## Summary

This RFC proposes a **SwarmTemplate NFT** model enabling a swarm marketplace: pre-configured agent swarms that can be cloned/minted by any user, creating a new deployed swarm instance from a template.

## Problem

Currently, setting up a custom agent swarm requires manual configuration of:
- Agent identities and roles
- Communication channels (LiveKit rooms)
- Task routing rules
- Shared context / primers

There is no way to share, sell, or replicate a working swarm configuration.

## Proposed Model

### SwarmTemplate NFT
- An ERC-721 (or ERC-1155) representing a swarm configuration
- Contains: agent composition, role assignments, communication topology, default primers
- Can be listed on the Unju marketplace
- Creator earns a royalty (basis points) on each clone

### Clone/Mint Flow
1. User browses swarm marketplace
2. User mints a clone of a SwarmTemplate
3. A new swarm is deployed with:
   - Fresh agent TBAs (cloned from template config)
   - New LiveKit room allocation
   - User's wallet as swarm owner
4. User can customize the deployed swarm
5. Original template creator receives royalty payment

### Economics
- Listing: free (gas only)
- Clone mint: configurable price set by template creator
- Platform fee: TBD (e.g., 2.5% same as TaskEscrow)
- Creator royalty: ERC-2981 on-chain royalty standard

## Open Questions

1. How do template agents get their initial keys? Generated fresh on clone, or configured by the template?
2. What's the minimum viable template schema?
3. Should templates be composable (template-of-templates)?
4. Governance: who can flag/remove malicious templates?

## Related

- [RFC-001: Agent Identity & Real-Time Communication](./RFC-001-agent-identity-and-realtime.md)
- [ADR-001: Authentication & Wallet Strategy](../adr/ADR-001-authentication-and-wallet-strategy.md)

---

*Stub — expand before implementation begins.*
