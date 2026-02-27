# RFC-023: CLI Integration Strategy for Quantum Wallets

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Date:** 2026-02-27  
**Dependencies:** RFC-022 (Quantum Wallet), RFC-018 (Wallet-First Identity)

## Abstract

Integration strategy for quantum-secure wallets into the existing `unju` CLI. Defines command structure, user flows, migration paths, and backward compatibility approach to seamlessly blend v1 (standard ECDSA) and v2 (quantum-resistant) wallets.

## Goals

1. **Seamless coexistence** — v1 and v2 wallets work side-by-side
2. **Opt-in quantum** — Users choose when to upgrade
3. **Smart defaults** — Best security automatically selected
4. **Backward compatible** — Existing commands unchanged
5. **Clear UX** — Users understand security differences

## Non-Goals

1. ~~Force migration~~ — v1 wallets remain supported indefinitely
2. ~~Break existing scripts~~ — All v1 commands work unchanged
3. ~~Hide complexity~~ — Users should know what security level they have

---

## Command Structure

### Hierarchical Organization

```
unju wallet
├── create              # v1: Standard ECDSA (backward compat)
├── import              # v1: Import ECDSA wallet
├── list                # Shows ALL wallets (v1 + v2)
├── export              # v1: Export private key
├── balance             # Works for both v1 and v2
├── send                # Works for both v1 and v2
├── sign                # ECDSA signature (v1 compat)
├── delete              # Delete any wallet
│
└── quantum             # v2: Quantum-resistant wallets
    ├── create          # Create quantum wallet
    ├── sign            # Quantum signature (Dilithium)
    ├── info            # Show quantum wallet details
    ├── upgrade         # Migrate v1 → v2
    └── capabilities    # Check system security
```

### Design Principles

1. **Top-level commands** = v1 (backward compatibility)
2. **`quantum` subcommand** = v2 (new features)
3. **Shared commands** work for both (e.g., `list`, `balance`)

---

## User Journeys

### Journey 1: New User (Quantum-First)

**Persona:** Developer creating first wallet

```bash
# User wants maximum security
$ unju wallet quantum create

🔐 Creating quantum-secure wallet...

Security Capabilities:
  TEE:              ✅ Intel SGX
  Quantum library:  ✅ @noble/post-quantum
  Security level:   MAXIMUM 🛡️

✅ Wallet created!

Name:              default
Address:           0x742d35...
Security Level:    MAXIMUM 🛡️
Quantum-resistant: ✅

💡 Next steps:
   • unju agent register    (Register on swarm)
   • unju auth login        (Authenticate to platform)
```

**Outcome:** User has quantum wallet by default.

---

### Journey 2: Existing User (Upgrade Path)

**Persona:** User with existing v1 wallet

```bash
# User has a standard wallet
$ unju wallet list

🔑 Wallets
──────────────
┌──────────┬────────────────────────────────┬─────────┬──────────────┐
│ Name     │ Address                        │ Type    │ Security     │
├──────────┼────────────────────────────────┼─────────┼──────────────┤
│ default  │ 0x742d35Cc6634C0532925a3b844B │ v1      │ STANDARD ⚠️  │
│ agent-1  │ 0x9aA8c459E53e0Dd214f949Eca3 │ v1      │ STANDARD ⚠️  │
└──────────┴────────────────────────────────┴─────────┴──────────────┘

💡 Upgrade to quantum security: unju wallet quantum upgrade <name>

# User upgrades
$ unju wallet quantum upgrade default

⚠️  This will upgrade your wallet to quantum security.
    Your EVM address will remain the same.
    A backup will be created.

Proceed? (y/n): y

🔐 Generating quantum keypair...
✅ Backup created: ~/.unju/backups/default-v1.json
✅ Quantum keys generated
✅ Binding proof created
✅ Wallet upgraded to v2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Address:           0x742d35... (unchanged)
Security Level:    STANDARD ⚠️ → MAXIMUM 🛡️
Quantum-resistant: ❌ → ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Now list shows v2 wallet
$ unju wallet list

🔑 Wallets
──────────────
┌──────────┬────────────────────────────────┬─────────┬──────────────┐
│ Name     │ Address                        │ Type    │ Security     │
├──────────┼────────────────────────────────┼─────────┼──────────────┤
│ default  │ 0x742d35Cc6634C0532925a3b844B │ v2      │ MAXIMUM 🛡️   │
│ agent-1  │ 0x9aA8c459E53e0Dd214f949Eca3 │ v1      │ STANDARD ⚠️  │
└──────────┴────────────────────────────────┴─────────┴──────────────┘
```

**Outcome:** User upgraded without losing EVM address.

---

### Journey 3: Agent (Automated)

**Persona:** Agent script creating wallet non-interactively

```bash
# Agent wants quantum wallet, no password
$ unju wallet quantum create --name agent-bot --no-password --output json

{
  "name": "agent-bot",
  "address": "0x3D5Ce0A0150C4f9127A0624f6a819b7dE5bBbB2E",
  "quantumPublicKey": "a3f9d2e8b1c4...",
  "securityLevel": "HIGH",
  "quantumResistant": true,
  "teeIsolated": false,
  "createdAt": "2026-02-27T22:00:00.000Z"
}

# Agent registers
$ unju agent register --name "Trading Bot" --wallet agent-bot

✅ Agent registered (Token ID: 42)
🛡️  Security: HIGH (Quantum-resistant)
```

**Outcome:** Agent has quantum wallet, fully automated.

---

## Command Reference

### Top-Level Commands (v1 Backward Compatibility)

#### `unju wallet create`

**Behavior:** Creates v1 wallet for backward compatibility

```bash
$ unju wallet create

⚠️  Creating standard ECDSA wallet.
    For quantum security, use: unju wallet quantum create

✅ Wallet created!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:              default
Address:           0x742d35...
Security Level:    STANDARD ⚠️
Quantum-resistant: ❌
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Upgrade to quantum: unju wallet quantum upgrade default
```

**Why keep v1 create?**
- Backward compatibility for existing scripts
- Simpler for quick testing (no quantum library needed)
- Users explicitly opt into quantum

---

#### `unju wallet list`

**Behavior:** Shows ALL wallets (v1 + v2) with clear indicators

```bash
$ unju wallet list

🔑 Wallets
──────────────
┌────────────┬────────────────────────────────┬──────┬──────────────┬──────────┐
│ Name       │ Address                        │ Type │ Security     │ Encrypted│
├────────────┼────────────────────────────────┼──────┼──────────────┼──────────┤
│ main       │ 0x742d35Cc6634C0532925a3b844B │ v2   │ MAXIMUM 🛡️   │ ✅       │
│ trading    │ 0x9aA8c459E53e0Dd214f949Eca3 │ v2   │ HIGH 🔒      │ ✅       │
│ legacy     │ 0x5bBbB2E3D5Ce0A0150C4f9127A │ v1   │ STANDARD ⚠️  │ ✅       │
│ test       │ 0x1234567890abcdef1234567890a │ v1   │ STANDARD ⚠️  │ ❌       │
└────────────┴────────────────────────────────┴──────┴──────────────┴──────────┘

💡 2 wallets can be upgraded to quantum security
   Run: unju wallet quantum upgrade <name>
```

**Columns:**
- **Name** — User-defined label
- **Address** — EVM address
- **Type** — v1 (ECDSA) or v2 (Quantum)
- **Security** — MAXIMUM 🛡️ | HIGH 🔒 | MEDIUM 🔓 | STANDARD ⚠️
- **Encrypted** — Password-protected or plaintext

---

#### `unju wallet balance`

**Behavior:** Works for both v1 and v2 wallets

```bash
$ unju wallet balance

# If only one wallet
Balance: 10.5 ETH (0x742d35...)

# If multiple wallets
┌────────────┬────────────────────────────────┬──────────────┐
│ Wallet     │ Address                        │ Balance      │
├────────────┼────────────────────────────────┼──────────────┤
│ main       │ 0x742d35Cc6634C0532925a3b844B │ 10.5 ETH     │
│ trading    │ 0x9aA8c459E53e0Dd214f949Eca3 │ 2.3 ETH      │
└────────────┴────────────────────────────────┴──────────────┘

# Specific wallet
$ unju wallet balance --name main
Balance: 10.5 ETH
```

---

### Quantum Subcommands (v2 Features)

#### `unju wallet quantum create`

**Behavior:** Creates quantum-secure wallet

**Options:**
```
-n, --name <name>       Wallet name
--no-password           Skip password (agent mode)
--output <format>       Output: text (default), json, env
```

**Example:**
```bash
$ unju wallet quantum create --name secure-wallet
```

---

#### `unju wallet quantum upgrade <name>`

**Behavior:** Migrate v1 → v2 wallet

**Process:**
1. Load existing v1 wallet
2. Generate quantum keypair from same mnemonic
3. Create binding proof
4. Backup v1 wallet
5. Save as v2 wallet

**Example:**
```bash
$ unju wallet quantum upgrade my-wallet
```

**Safety:**
- Preserves EVM address (same mnemonic)
- Creates backup automatically
- Validates binding before committing

---

#### `unju wallet quantum sign <message>`

**Behavior:** Sign with quantum-resistant signature

**Example:**
```bash
$ unju wallet quantum sign "Hello quantum world" --name main

✅ Signed!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Message:   Hello quantum world
Algorithm: ML-DSA-65 (NIST FIPS 204)
Signature: a3f9d2e8b1c4f7a9e2d5c8b3a1f6e9d2...
Length:    3,293 bytes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Signature verification: VALID ✓
```

**Use Cases:**
- Platform authentication (SIWE)
- Agent coordination (ACP messages)
- Off-chain proofs

---

#### `unju wallet quantum info`

**Behavior:** Show detailed quantum wallet information

**Example:**
```bash
$ unju wallet quantum info --name main

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:              main
Address:           0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Security Level:    MAXIMUM 🛡️
Quantum-resistant: ✅ ML-DSA-65
TEE-isolated:      ✅ Intel SGX
Encrypted:         ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 Keys:
  EVM Address:      0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
  Quantum PubKey:   a3f9d2e8b1c4f7a9e2d5c8b3a1f6e9d2...

🔗 Binding:
  Signature:        7b3a8e1f9c4d2a6b5e8c7f3a1d9e4b2c...
  Verified:         ✅

🛡️  Security Features:
  Post-quantum:     ✅ NIST FIPS 204 (ML-DSA-65)
  Hardware TEE:     ✅ Intel SGX enclave
  Encrypted:        ✅ AES-256-GCM + argon2id
  Remote attestation: ✅ Available
```

---

#### `unju wallet quantum capabilities`

**Behavior:** Check system security capabilities

**Example:**
```bash
$ unju wallet quantum capabilities

🔐 Security Capabilities:

  TEE:              ✅ Intel SGX
  TEE Features:     enclave, sealing, attestation
  Attestation:      ✅
  Hardware crypto:  ✅
  Quantum library:  ✅ @noble/post-quantum
  Security level:   MAXIMUM 🛡️

📊 Quantum Algorithm:
  Name:             ML-DSA-65
  Standard:         NIST FIPS 204
  Security:         128-bit (quantum-resistant)
  Public key:       1,952 bytes
  Signature:        3,293 bytes

💡 Recommendations:
  🛡️  You have maximum security! (TEE + Quantum)
  ✅ Safe to create agent wallets on this system.
```

---

## Integration with Existing Commands

### `unju auth login`

**Behavior:** Auto-detects wallet type, uses appropriate signature

```bash
$ unju auth login

🔍 Detecting wallet...
✅ Found quantum wallet: main (MAXIMUM 🛡️)

🔐 Signing authentication challenge...
✅ Authenticated with quantum signature

Session: Active (24h)
Credits: 100
```

**Implementation:**

```typescript
async function login() {
  // 1. Find wallet
  const wallet = await getDefaultWallet()
  
  if (wallet.version === 2) {
    // Quantum wallet: use Dilithium signature
    return loginWithQuantum(wallet)
  } else {
    // v1 wallet: use ECDSA signature
    return loginWithEcdsa(wallet)
  }
}
```

---

### `unju agent register`

**Behavior:** Prefers quantum wallet, falls back to v1

```bash
$ unju agent register --name "My Agent"

🔍 Selecting wallet...
✅ Using quantum wallet: main (MAXIMUM 🛡️)

🔐 Registering agent with quantum security...
✅ Agent registered!

Token ID:      42
TBA Address:   0x9aA8c459E53e0Dd214f949Eca3f89f9afdCf8742
Security:      MAXIMUM 🛡️ (Quantum + TEE)

💡 Your agent identity is quantum-resistant.
```

**Metadata stored:**
```json
{
  "tokenId": 42,
  "evmAddress": "0x742d35...",
  "quantumPublicKey": "a3f9d2e8...",
  "binding": {...},
  "securityLevel": "MAXIMUM",
  "teeType": "sgx",
  "quantumAlgorithm": "ML-DSA-65"
}
```

---

## Migration Strategy

### Phase 1: Coexistence (Now)

- ✅ v1 and v2 wallets work side-by-side
- ✅ All existing commands work
- ✅ Quantum is opt-in
- ✅ Clear security indicators

### Phase 2: Encourage Quantum (3 months)

- Show upgrade prompts in `unju wallet list`
- Highlight security benefits
- Auto-upgrade during `unju agent register` (with confirmation)

### Phase 3: Quantum-First (6 months)

- `unju wallet create` asks: "Standard or quantum?"
- Quantum is default choice
- v1 still available (legacy option)

### Phase 4: Deprecate v1 (12+ months)

- Warning when creating v1 wallets
- Migration reminders
- Eventually: v1 create disabled, upgrade required

**Never:** Force migration. Users own their keys.

---

## Backward Compatibility

### Existing Scripts Continue to Work

**Before quantum (v1 only):**
```bash
#!/bin/bash
unju wallet create --name bot --no-password
unju agent register --wallet bot
unju auth login --wallet bot
```

**After quantum (still works):**
```bash
#!/bin/bash
# Same script, no changes needed
unju wallet create --name bot --no-password  # Still creates v1
unju agent register --wallet bot              # Works with v1
unju auth login --wallet bot                  # ECDSA signature
```

**Opt into quantum:**
```bash
#!/bin/bash
# New scripts can opt in
unju wallet quantum create --name bot --no-password
unju agent register --wallet bot  # Uses quantum signature
unju auth login --wallet bot      # Dilithium signature
```

---

## Error Handling

### Graceful Degradation

```bash
# Try quantum on system without @noble/post-quantum
$ unju wallet quantum create

❌ Error: Quantum library not available

💡 Install quantum support:
   npm install -g @noble/post-quantum

   Or use standard wallet:
   unju wallet create
```

---

### Clear Error Messages

```bash
# Wrong password
$ unju wallet quantum sign "test" --name main

❌ Error: Incorrect password

# Missing wallet
$ unju wallet quantum info --name nonexistent

❌ Error: Wallet "nonexistent" not found

Available wallets:
  • main (v2, MAXIMUM 🛡️)
  • trading (v2, HIGH 🔒)
  • legacy (v1, STANDARD ⚠️)
```

---

## Configuration

### Default Wallet Selection

**Priority:**
1. `--wallet <name>` flag (explicit)
2. `UNJU_WALLET` environment variable
3. Wallet named "default"
4. First quantum wallet (v2)
5. First wallet (v1 or v2)

**Example:**

```bash
# Set default via env
export UNJU_WALLET=main

# Now all commands use "main" wallet
unju auth login
unju agent register
unju wallet balance
```

---

### Global Config

```bash
$ unju wallet config

Current wallet defaults:
  Default wallet:       main
  Prefer quantum:       true
  Auto-upgrade prompt:  true
  Security level:       MAXIMUM

$ unju wallet config set prefer-quantum false
✅ Updated: prefer-quantum = false

$ unju wallet config set default-wallet trading
✅ Updated: default-wallet = trading
```

---

## Implementation Plan

### Week 1: Command Structure
- [ ] Implement `unju wallet quantum create`
- [ ] Implement `unju wallet quantum info`
- [ ] Implement `unju wallet quantum capabilities`
- [ ] Update `unju wallet list` to show v1/v2

### Week 2: Integration
- [ ] Update `unju auth login` to detect wallet type
- [ ] Update `unju agent register` for quantum
- [ ] Implement auto-detection logic

### Week 3: Migration
- [ ] Implement `unju wallet quantum upgrade`
- [ ] Implement backup/restore
- [ ] Add migration prompts

### Week 4: Polish
- [ ] Error handling
- [ ] Help text
- [ ] Documentation
- [ ] Testing

---

## Success Metrics

### Adoption
- 50% of new wallets are v2 within 1 month
- 80% of new wallets are v2 within 3 months
- 30% of existing wallets upgraded within 6 months

### UX
- <5% of users confused about v1 vs v2
- Zero reports of accidental v1 wallet creation
- <1% failed upgrades

### Compatibility
- 100% of existing scripts work unchanged
- Zero breaking changes to v1 commands

---

## Related

- RFC-022: Quantum-Secure TEE Wallet Architecture
- RFC-018: Wallet-First Identity System
- Issue #001: Build system fixes
- Issue #002: Missing features
- Issue #003: Test strategy

---

**Estimated Effort:** 3-4 weeks (integration + testing)

---

## Changelog

- **2026-02-27**: Initial draft (Green Tara)

---

**OṂ TĀRE TUTTĀRE TURE SVĀHĀ** 🪷

_Seamless integration. Maximum security. User choice._
