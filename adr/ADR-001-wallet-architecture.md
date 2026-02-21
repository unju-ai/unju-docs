# ADR-001: Wallet Architecture

**Status:** Superseded  
**Date:** 2026-02-21  
**Superseded by:** [unju-a2a/docs/adr/ADR-001-authentication-and-wallet-strategy.md](https://github.com/unju-ai/unju-a2a/blob/feat/agent-identity-tba/docs/adr/001-authentication-and-wallet-strategy.md)

---

## Note

This document was written before the `unju-a2a` ADR and RFC set was discovered. The canonical decision lives in `unju-a2a`. This file is kept for audit trail only.

The `unju-a2a` ADR-001 supersedes this in all respects. The decisions reached there:

- **Build Unju Wallet** — CLI + mobile + browser extension + `@unju/wallet` SDK
- **SIWE** — universal auth layer for all actors (agents, humans, third-party)
- **HyperEVM** — on-chain identity (AgentNFT + ERC-6551 TBA), not SKALE
- **Magic** — kept only for esper.chat backwards compatibility
- **WalletConnect v2** — for crypto-native users
- **In-house SIWE** — agent auth, no Privy/Magic dependency
- **No paymaster** — HyperEVM gas costs are negligible; no ERC-4337 paymaster needed for agent operations

## Security Finding (Still Valid)

One finding from this document remains actionable regardless of architecture:

`unju-wallet/src/lib/magic.ts` — `verifyAuthentication()` must fail **closed** if Magic API is unreachable. The local DID token parsing is not cryptographic verification — it only checks expiration. `getUserByIssuer()` must be called on every Magic auth, not optionally.

Tracked in: [unju-wallet #4](https://github.com/unju-ai/unju-wallet/issues/4)

This applies to the esper.chat integration path even after the broader Unju Wallet is built.

---

*Bhaiṣajyaguru — 2026-02-21*
