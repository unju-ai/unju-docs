# ADR-001: Wallet Architecture — SKALE-First, Magic EOA, No Paymaster

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-02-21 |
| **Deciders** | Esper (The Software Whisperer), Bhaiṣajyaguru |
| **Repos affected** | `unju-wallet`, `unju-contracts`, `unju-ionic`, `unju-api` |
| **RFC** | RFC-011 |

---

## Context

The Unju platform requires wallet infrastructure for:

1. **User wallets** — normie users who sign up via social login
2. **Agent wallets** — AI agents that execute transactions autonomously
3. **Platform wallets** — treasury, staking pool, escrow for JobRequest holds

### The problem with the prior approach

The original architecture wrapped Magic embedded wallets in ERC-4337 smart wallets via ZeroDev and used a paymaster to sponsor gas on behalf of users. This created two compounding costs:

- **Magic per-MAW fee** — charged monthly per active embedded wallet
- **Paymaster gas sponsorship** — ETH paid for every user transaction indefinitely

At small scale this is manageable. At scale (10k+ MAU with frequent agent operations), gas sponsorship becomes an unbounded, linearly-scaling cost with no ceiling.

Smart wallets solve the UX problem of "user needs ETH for gas." But SKALE Europa — already in the Unju stack — is gasless by design. The chain itself sponsors gas at the protocol level. The paymaster layer was solving a problem the chain already solved.

Additionally: a MetaMask fork was considered and rejected. MetaMask is a browser extension architecture designed for human users. Unju's primary actor is AI agents making programmatic transactions. These require different primitives (API-accessible signing, not browser extension UX). MetaMask's BSL license also restricts commercial forks.

---

## Decision

### 1. Dual-chain routing

Move all high-frequency user and agent operations to **SKALE Europa** (gasless). Reserve **Base L2** for infrequent but economically significant operations.

| Operation | Chain | Rationale |
|-----------|-------|-----------|
| Credit transfers between users | SKALE | Gasless, high frequency |
| Agent task execution | SKALE | Gasless, high frequency |
| JobRequest creation + fulfillment | SKALE | Gasless, high frequency |
| Memory operations on-chain | SKALE | Gasless, high frequency |
| $UNJU token (ERC-20) | Base L2 | Ethereum security, liquidity |
| Staking + governance | Base L2 | Ethereum security |
| Subscription settlement | Base L2 | Periodic, low frequency |
| Cross-chain bridging | Base L2 | Periodic, user-initiated |

### 2. Wallet types by actor

**Normie users (social login)**
- Magic embedded wallet → user EOA on SKALE
- MPC-backed: user owns the key material, Magic manages recovery
- No seed phrase UX
- **No smart wallet wrapper** — not needed when gas is free
- Magic fee: per-MAW, acceptable for user-facing wallets

**Crypto-native users (bring your own)**
- WalletConnect v2 integration
- MetaMask, Rainbow, Coinbase Wallet, etc.
- User pays their own gas from their own wallet
- Platform has zero custody and zero gas obligation

**Agent wallets (all agents, not just Esper trading)**
- Magic Server Wallets (Express API)
- Server-controlled, HSM-backed via Magic's MPC infrastructure
- No private key storage on Unju infrastructure
- Per-MAW pricing: pay only for active wallets, not dormant ones
- Applies to: Esper trading agent, all future autonomous agents

**Platform wallets**
- Treasury address → Magic Server Wallet (not a bare EOA)
- Staking pool address → Magic Server Wallet
- JobRequest escrow → Magic Server Wallet per job (or shared escrow wallet)
- Rationale: removes private key rotation burden from infra

### 3. Remove paymaster / ZeroDev layer for SKALE operations

- No ERC-4337 smart wallet deployment for normie users on SKALE
- No paymaster infrastructure required on SKALE
- Retain account abstraction capability only for Base L2 operations where gas fees are real and users may legitimately need fee sponsorship

### 4. Do not fork MetaMask

Explicitly rejected. Reasons:
- Browser extension architecture incompatible with agent use case
- BSL 1.1 license restrictions on commercial forks
- ~200 engineer maintenance burden
- Reinvents WalletConnect, which already solves the connection problem
- Unju is a dApp, not a wallet. Be the dApp.

---

## Security Implications

### DID Token Verification (Action Required)

The current `magic.ts` implementation does **local** DID token parsing without cryptographic signature verification:

```typescript
// WARNING: This is NOT cryptographic verification.
// It checks expiration only. Security depends on the getUserByIssuer() call below.
function validateDIDToken(didToken: string) {
  const claims = decodeDIDToken(didToken)  // base64 decode, no sig check
  // only checks claims.ext (expiration time)
}
```

This is unavoidable in Cloudflare Workers (no `node:http`, so `@magic-sdk/admin` cannot run). However:

**Required fix:** `getUserByIssuer()` must be called on **every** authentication, not optionally. Currently the code calls it to "optionally fetch additional metadata." Make it mandatory. If Magic's API is unreachable, authentication must **fail closed** — not silently succeed.

```typescript
// Current (unsafe):
const metadata = await this.getUserByIssuer(issuer)  // optional
return { issuer, email: metadata?.email, ... }

// Required (safe):
const metadata = await this.getUserByIssuer(issuer)  // mandatory
if (!metadata) throw new Error('Magic API verification failed — cannot authenticate')
return { issuer, email: metadata.email, ... }
```

### Magic Server Wallet Access Control

Each agent's Magic Server Wallet ID must be stored with strict access control — only the agent's own API key can trigger signing requests. Platform wallets (treasury, staking) must require multi-authorization: at minimum two internal service calls to sign a transaction above a threshold.

### Key Rotation

Magic Server Wallets do not expose private keys. Rotation is handled by Magic's MPC infrastructure. However, the Unju platform must:
- Maintain a mapping of `agentId → magicWalletId` in a secrets store (not the main DB)
- Implement wallet deactivation on agent deletion
- Audit log all signing requests (Magic provides this, but mirror to internal logs)

### Replay Attack Protection (Wallet Signature Path)

The existing 5-minute timestamp window in `verifyAuthentication()` is acceptable for interactive sessions. For agent-to-agent operations, consider reducing to 60 seconds.

---

## Consequences

### Positive

- **Gas cost eliminated** for all SKALE operations — no paymaster, no ETH reserve needed
- **Infrastructure simplified** — remove ZeroDev dependency for normie path
- **Key security improved** — Magic Server Wallets for all platform-controlled addresses
- **Scaling cost model improved** — Magic per-MAW replaces unbounded gas sponsorship
- **Normie UX preserved** — Magic embedded wallet still no seed phrase

### Negative

- **Migration work required** — existing users with smart wallets need path to EOA on SKALE
- **Dual-chain complexity** — developers must understand which chain each operation targets
- **Magic vendor dependency** — key management is centralized at Magic; mitigated by their MPC model but not eliminated
- **WalletConnect integration** — new engineering work for power user path

### Neutral

- The `unju-wallet` service retains its role as the wallet API layer; routing changes but the service boundary does not
- `unju-contracts` dual-chain deployment: existing Base contracts remain; SKALE contracts needed for operations layer

---

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|-----------------|
| Fork MetaMask | Browser extension, BSL license, 200-engineer maintenance burden, wrong problem |
| Keep ZeroDev paymaster on Base | Gas cost scales linearly, no ceiling |
| Move everything to SKALE | $UNJU token needs Ethereum/Base for liquidity and DeFi composability |
| Self-managed private keys | Key management is hard; storing keys = becoming a target; rotation burden is high |
| Privy / Dynamic.xyz instead of Magic | Magic is already integrated; switching cost > benefit at this stage |

---

## Implementation Notes

### unju-wallet

- `src/lib/magic.ts` — harden `verifyAuthentication()` to fail closed
- `src/lib/server-wallets.ts` — extend to cover all agent wallet creation (currently Esper-specific)
- `src/routes/agent-wallets.ts` — create wallet on agent registration, not on first use
- Add SKALE chain config and routing logic

### unju-contracts

- Deploy operations contracts on SKALE Europa (JobRequest, Credits transfers)
- Retain token/staking/governance on Base L2
- Document deployment addresses per chain

### unju-ionic / unju-client

- Add WalletConnect v2 provider
- Remove smart wallet deployment flow from onboarding
- Update Magic integration to use EOA (no ZeroDev wrapper) for SKALE operations

### unju-api

- Wallet proxy route should route SKALE vs Base based on operation type
- Add chain selection to relevant API request bodies

---

## Review Notes

*Bhaiṣajyaguru, 2026-02-21:*

The prior architecture was not wrong for its context — paymaster is the correct solution when you can't assume gasless infrastructure. The insight here is that SKALE was already chosen for a reason, and the paymaster layer was added without fully accounting for what SKALE eliminates.

The security concern around DID token verification is the most urgent item. It should be addressed before any production traffic scales. Everything else is migration work — important, but not urgent.

The Magic Server Wallet extension to all agents (not just Esper's trading agent) is the highest-leverage change: it eliminates private key storage risk across the entire agent fleet in a single policy decision.
