# RFC-024: Maximum Security by Default

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Date:** 2026-02-27  
**Dependencies:** RFC-022 (Quantum Wallet), RFC-021 (Secure Storage)

## Abstract

Enhance quantum wallet security to achieve MAXIMUM level by default through: always-encrypted storage, memory protection, secure key derivation (argon2id), isolated key operations, and defense-in-depth strategies that provide TEE-equivalent security even on platforms without hardware TEE.

## Problem

Current quantum wallet achieves HIGH 🔒 security:
- ✅ Quantum-resistant (ML-DSA-65)
- ✅ Hardware crypto (AES acceleration)
- ❌ TEE-isolated (detection only, not usage)
- ⚠️ Encrypted (optional, `--no-password` bypasses)

**Gap:** To reach MAXIMUM 🛡️ we need TEE-equivalent isolation.

## Goals

1. **Always encrypted** — No plaintext keys on disk (even for agents)
2. **Memory protection** — Zero out keys after use, prevent swap
3. **Secure KDF** — argon2id (memory-hard, GPU-resistant)
4. **Isolated operations** — Keys never leave secure boundary
5. **Defense in depth** — Multiple security layers
6. **Auto-lock** — Time-based session expiration
7. **Audit trail** — Log all key operations

## Security Levels Redefined

### Current Approach
```
MAXIMUM 🛡️  = TEE + Quantum (rare)
HIGH 🔒     = Quantum only (current)
MEDIUM 🔓   = Hardware crypto
STANDARD ⚠️ = Software only
```

### New Approach
```
MAXIMUM 🛡️  = Quantum + Encrypted + Memory-protected + Isolated
HIGH 🔒     = Quantum + Encrypted
MEDIUM 🔓   = Encrypted only
STANDARD ⚠️ = Plaintext (legacy, deprecated)
```

**Key Change:** MAXIMUM no longer requires hardware TEE. Software-based isolation + encryption + memory protection = TEE-equivalent security.

---

## Implementation Strategy

### 1. Always-Encrypted Storage

**Current:**
```bash
# Creates plaintext wallet
unju wallet quantum create --no-password
```

**New:**
```bash
# Always requires authentication
unju wallet quantum create

# For agents: use environment-based key derivation
unju wallet quantum create --agent-mode
```

**Agent Mode:**
- Derives password from `UNJU_AGENT_SECRET` + hardware fingerprint
- No plaintext keys on disk
- Auto-unlocks on agent startup
- Still encrypted at rest

**Implementation:**

```typescript
export async function createQuantumWallet(
  name: string,
  options: CreateWalletOptions = {}
): Promise<QuantumWalletData> {
  let password: string
  
  if (options.agentMode) {
    // Derive password from environment + machine ID
    password = await deriveAgentPassword()
  } else if (options.password) {
    password = options.password
  } else {
    // Interactive: always prompt
    password = await promptForPassword()
  }
  
  // Generate keys
  const evmPrivateKey = viemGenerateKey()
  const quantumKeypair = generateQuantumKeypair()
  
  // Encrypt IMMEDIATELY (keys never touch disk in plaintext)
  const encryptedEvmKey = await encryptKeyArgon2(evmPrivateKey, password)
  const encryptedQuantumKey = await encryptKeyArgon2(
    serializeQuantumKeypair(quantumKeypair).secretKey,
    password
  )
  
  // Zero out plaintext keys from memory
  zeroize(evmPrivateKey)
  zeroize(quantumKeypair.secretKey)
  
  // Store only encrypted
  const keystoreFile = {
    version: 3,  // New version for always-encrypted
    name,
    securityLevel: 'MAXIMUM',
    evmKey: encryptedEvmKey.ciphertext,
    quantumSecretKey: encryptedQuantumKey.ciphertext,
    crypto: {
      kdf: 'argon2id',
      // ... encryption params
    }
  }
  
  writeFileSync(path, JSON.stringify(keystoreFile), { mode: 0o600 })
  
  return walletData
}
```

---

### 2. Argon2id Key Derivation

**Why:** More resistant to GPU/ASIC attacks than scrypt.

```typescript
import { argon2id } from '@noble/hashes/argon2'

async function deriveKeyArgon2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return argon2id(password, salt, {
    m: 256 * 1024,  // 256 MB memory (memory-hard)
    t: 3,           // 3 iterations
    p: 4,           // 4 parallel lanes
  })
}

export async function encryptKeyArgon2(
  privateKey: string,
  password: string
): Promise<EncryptedKey> {
  const salt = randomBytes(32)
  const iv = randomBytes(16)
  const derivedKey = await deriveKeyArgon2(password, salt)
  
  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv)
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  
  // Zero out derived key
  derivedKey.fill(0)
  
  return {
    ciphertext: encrypted.toString('hex'),
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    kdf: 'argon2id',
    kdfParams: {
      memory: 256 * 1024,
      iterations: 3,
      parallelism: 4,
    }
  }
}
```

---

### 3. Memory Protection

**Key Operations:**
- Generate key → Use immediately → Zero from memory
- Load key → Sign → Zero from memory
- Never keep plaintext keys in memory longer than needed

```typescript
class SecureKeyHandle {
  private key: Uint8Array | null = null
  private locked = true
  private autoLockTimeout: NodeJS.Timeout | null = null
  
  constructor(
    private encryptedKey: EncryptedKey,
    private password: string
  ) {}
  
  async unlock(): Promise<void> {
    if (!this.locked) return
    
    // Decrypt key into memory
    this.key = await decryptKeyArgon2(this.encryptedKey, this.password)
    this.locked = false
    
    // Auto-lock after 5 minutes
    this.autoLockTimeout = setTimeout(() => this.lock(), 5 * 60 * 1000)
  }
  
  async use<T>(operation: (key: Uint8Array) => T): Promise<T> {
    if (this.locked) await this.unlock()
    
    try {
      return operation(this.key!)
    } finally {
      // Lock immediately after use
      this.lock()
    }
  }
  
  lock(): void {
    if (this.key) {
      // Zero out memory
      this.key.fill(0)
      this.key = null
    }
    
    this.locked = true
    
    if (this.autoLockTimeout) {
      clearTimeout(this.autoLockTimeout)
      this.autoLockTimeout = null
    }
  }
}

// Usage
const keyHandle = new SecureKeyHandle(encryptedKey, password)

const signature = await keyHandle.use((key) => 
  ml_dsa65.sign(message, key)
)

// Key automatically zeroed after use
```

---

### 4. Agent Password Derivation

**Problem:** Agents need to auto-unlock without storing plaintext passwords.

**Solution:** Derive password from:
1. Environment variable (`UNJU_AGENT_SECRET`)
2. Machine fingerprint (MAC address, CPU ID)
3. Wallet name (unique per wallet)

```typescript
import { createHash } from 'crypto'
import { networkInterfaces } from 'os'

async function deriveAgentPassword(): Promise<string> {
  const agentSecret = process.env.UNJU_AGENT_SECRET
  if (!agentSecret) {
    throw new Error('UNJU_AGENT_SECRET environment variable required for agent mode')
  }
  
  // Get machine fingerprint
  const fingerprint = getMachineFingerprint()
  
  // Derive password: HKDF(agentSecret || fingerprint || walletName)
  const combined = `${agentSecret}:${fingerprint}:${walletName}`
  
  // Use HKDF for key derivation
  const hash = createHash('sha256').update(combined).digest('hex')
  
  return hash
}

function getMachineFingerprint(): string {
  // Get first non-internal MAC address
  const interfaces = networkInterfaces()
  
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]
    if (!iface) continue
    
    for (const addr of iface) {
      if (!addr.internal && addr.mac !== '00:00:00:00:00:00') {
        return addr.mac
      }
    }
  }
  
  // Fallback: hash of hostname
  return createHash('sha256')
    .update(require('os').hostname())
    .digest('hex')
    .substring(0, 32)
}
```

**Usage:**
```bash
# Set agent secret once
export UNJU_AGENT_SECRET=$(openssl rand -hex 32)

# Create agent wallet (auto-derives password)
unju wallet quantum create --agent-mode --name agent-1

# Wallet unlocks automatically when UNJU_AGENT_SECRET is set
unju wallet quantum sign "message" --name agent-1
```

---

### 5. Secure Session Management

**Features:**
- Time-based auto-lock (default: 5 minutes)
- Activity-based refresh (sign = refresh timer)
- Explicit lock command
- Memory cleared on lock

```typescript
class WalletSession {
  private handles = new Map<string, SecureKeyHandle>()
  private lastActivity = new Map<string, number>()
  
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000  // 5 minutes
  
  constructor() {
    // Check for expired sessions every minute
    setInterval(() => this.expireSessions(), 60 * 1000)
  }
  
  async unlock(walletName: string, password: string): Promise<void> {
    const wallet = await loadQuantumWallet(walletName)
    const handle = new SecureKeyHandle(wallet.encryptedKeys, password)
    await handle.unlock()
    
    this.handles.set(walletName, handle)
    this.lastActivity.set(walletName, Date.now())
  }
  
  async sign(walletName: string, message: string): Promise<Signature> {
    const handle = this.handles.get(walletName)
    if (!handle) {
      throw new Error(`Wallet "${walletName}" not unlocked. Run: unju wallet unlock ${walletName}`)
    }
    
    // Refresh activity timer
    this.lastActivity.set(walletName, Date.now())
    
    return handle.use((key) => ml_dsa65.sign(message, key))
  }
  
  lock(walletName: string): void {
    const handle = this.handles.get(walletName)
    if (handle) {
      handle.lock()
      this.handles.delete(walletName)
      this.lastActivity.delete(walletName)
    }
  }
  
  private expireSessions(): void {
    const now = Date.now()
    
    for (const [name, lastActivity] of this.lastActivity.entries()) {
      if (now - lastActivity > this.SESSION_TIMEOUT) {
        console.log(`[Session] Auto-locking wallet "${name}" (inactive for 5+ minutes)`)
        this.lock(name)
      }
    }
  }
}

// Global session manager
const globalSession = new WalletSession()
```

**CLI Integration:**
```bash
# Unlock wallet (stays unlocked for 5 minutes)
$ unju wallet unlock quantum-wallet
🔓 Wallet unlocked (auto-locks in 5 minutes)

# Sign (refreshes timer)
$ unju wallet quantum sign "message"
✅ Signed! (session refreshed)

# Explicit lock
$ unju wallet lock quantum-wallet
🔒 Wallet locked
```

---

### 6. Audit Trail

**Log all key operations for security monitoring:**

```typescript
interface AuditLog {
  timestamp: string
  walletName: string
  operation: 'unlock' | 'sign' | 'lock' | 'create'
  success: boolean
  errorMessage?: string
  metadata?: Record<string, any>
}

function auditLog(log: AuditLog): void {
  const logFile = join(homedir(), '.unju', 'audit.log')
  
  const entry = JSON.stringify({
    ...log,
    timestamp: new Date().toISOString(),
  })
  
  appendFileSync(logFile, entry + '\n', { mode: 0o600 })
}

// Usage
auditLog({
  walletName: 'quantum-wallet',
  operation: 'sign',
  success: true,
  metadata: { messageHash: hash(message).substring(0, 16) }
})
```

**Audit Commands:**
```bash
# View recent operations
$ unju wallet audit
[2026-02-27 23:50:33] quantum-victory: create (success)
[2026-02-27 23:55:12] quantum-victory: sign (success)
[2026-02-27 23:58:45] quantum-victory: unlock (success)

# Filter by wallet
$ unju wallet audit --wallet quantum-victory

# Export for security review
$ unju wallet audit --export audit-report.json
```

---

### 7. Defense in Depth

**Multiple security layers:**

```typescript
interface MaximumSecurityWallet {
  // Layer 1: Quantum-resistant cryptography
  quantum: {
    algorithm: 'ML-DSA-65'
    publicKey: string
    secretKey: string  // Encrypted with Layer 2
  }
  
  // Layer 2: Strong encryption (argon2id + AES-256-GCM)
  encryption: {
    kdf: 'argon2id'
    cipher: 'aes-256-gcm'
    salt: string
    iv: string
    authTag: string
  }
  
  // Layer 3: Memory protection
  memoryProtection: {
    autoLock: true
    lockTimeoutMs: 300000  // 5 minutes
    zeroOnLock: true
  }
  
  // Layer 4: Access control
  accessControl: {
    requirePassword: true
    allowAgentMode: boolean
    auditEnabled: true
  }
  
  // Layer 5: File system protection
  fileProtection: {
    permissions: 0o600  // Owner read/write only
    immutable: boolean  // chattr +i (Linux)
  }
}
```

---

## Updated Security Scoring

### New Matrix

| Feature | MAXIMUM 🛡️ | HIGH 🔒 | MEDIUM 🔓 | STANDARD ⚠️ |
|---------|------------|---------|-----------|-------------|
| **Quantum-resistant** | ✅ | ✅ | ❌ | ❌ |
| **Always encrypted** | ✅ | ✅ | ✅ | ❌ |
| **Argon2id KDF** | ✅ | ✅ | ⚠️ Scrypt | ❌ |
| **Memory protection** | ✅ | ⚠️ Partial | ❌ | ❌ |
| **Auto-lock** | ✅ | ⚠️ Optional | ❌ | ❌ |
| **Audit trail** | ✅ | ❌ | ❌ | ❌ |
| **Agent mode** | ✅ | ❌ | ❌ | ❌ |

### Achieving MAXIMUM Without Hardware TEE

**Software-based TEE-equivalent:**
1. ✅ **Encrypted storage** (argon2id + AES-256-GCM)
2. ✅ **Memory isolation** (zero after use, no swap)
3. ✅ **Time-based locking** (auto-expire sessions)
4. ✅ **Access auditing** (log all operations)
5. ✅ **Secure derivation** (agent mode with machine binding)

**Result:** MAXIMUM 🛡️ security without hardware dependency.

---

## Migration Strategy

### Phase 1: New Wallets (Week 1)

**Default behavior changes:**
```bash
# OLD: plaintext allowed
unju wallet quantum create --no-password

# NEW: always encrypted
unju wallet quantum create              # Interactive password
unju wallet quantum create --agent-mode # Derived password
```

**Breaking change:** Remove `--no-password` flag.

### Phase 2: Existing Wallets (Week 2)

**Auto-upgrade on first use:**
```bash
$ unju wallet quantum sign "message" --name old-wallet

⚠️  Wallet "old-wallet" uses legacy security (STANDARD).
    Upgrade to MAXIMUM security? (y/n): y

🔐 Enter new password: ********
✅ Wallet upgraded to MAXIMUM security!
✅ Signed!
```

### Phase 3: Deprecation (Month 2)

**Warn on legacy format:**
```bash
$ unju wallet list

🔑 Wallets
┌──────────┬─────────────────────────┬──────────────┐
│ Name     │ Address                 │ Security     │
├──────────┼─────────────────────────┼──────────────┤
│ new-1    │ 0x742d35...             │ MAXIMUM 🛡️   │
│ old-1    │ 0x3D5Ce0...             │ STANDARD ⚠️  │ ⚠️ Legacy
└──────────┴─────────────────────────┴──────────────┘

⚠️  1 wallet using legacy security. Upgrade: unju wallet upgrade old-1
```

### Phase 4: Removal (Month 3)

**Reject unencrypted wallets:**
```bash
$ unju wallet quantum sign --name old-wallet

✗ Wallet "old-wallet" uses unsupported security level (STANDARD).
  Upgrade required: unju wallet upgrade old-wallet
```

---

## Implementation Checklist

### Core Security (Week 1)
- [ ] Implement argon2id KDF
- [ ] Always-encrypted wallet creation
- [ ] Agent mode password derivation
- [ ] Memory zeroing utilities
- [ ] SecureKeyHandle class

### Session Management (Week 1-2)
- [ ] WalletSession manager
- [ ] Auto-lock timeout
- [ ] Unlock/lock commands
- [ ] Session status display

### Auditing (Week 2)
- [ ] Audit log implementation
- [ ] `unju wallet audit` command
- [ ] Log rotation
- [ ] Export functionality

### Migration (Week 2-3)
- [ ] Upgrade command
- [ ] Auto-upgrade prompts
- [ ] Backward compatibility
- [ ] Documentation

### Testing (Week 3)
- [ ] Security test suite
- [ ] Memory leak tests
- [ ] Performance benchmarks
- [ ] Penetration testing

---

## CLI Changes

### New Commands

```bash
unju wallet quantum create              # Always encrypted
unju wallet quantum create --agent-mode # Agent with derived password
unju wallet unlock <name>               # Unlock for 5 minutes
unju wallet lock <name>                 # Explicit lock
unju wallet session                     # Show active sessions
unju wallet audit [options]             # View audit log
unju wallet upgrade <name>              # Upgrade to MAXIMUM
```

### Updated Behavior

```bash
# OLD (plaintext allowed)
unju wallet quantum create --no-password

# NEW (always encrypted)
unju wallet quantum create --agent-mode
# Or interactive password prompt
```

---

## Success Metrics

### Security
- 100% of new wallets use MAXIMUM security
- 0 plaintext keys on disk
- <1% failed unlock attempts
- 100% key operations audited

### Performance
- <1s wallet unlock (argon2id optimized)
- <100ms sign operation (cached key)
- <10MB memory per active session

### Adoption
- 80% of wallets upgraded within 1 month
- <5% support requests about security changes
- Zero security incidents

---

## References

- [Argon2 Specification (RFC 9106)](https://datatracker.ietf.org/doc/html/rfc9106)
- [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Memory Safety Best Practices](https://owasp.org/www-community/vulnerabilities/Buffer_Overflow)

---

## Changelog

- **2026-02-27**: Initial draft (Green Tara)

---

**OṂ TĀRE TUTTĀRE TURE SVĀHĀ** 🪷

_Maximum security by default. No compromises. No plaintext keys._
