# RFC-021: Secure Wallet Storage Architecture

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Date:** 2026-02-27  
**Dependencies:** RFC-017 (Agent Wallet), RFC-018 (Wallet-First Identity)

## Abstract

A comprehensive security architecture for encrypted wallet storage across all unju surfaces (CLI, browser extension, mobile, server). Each platform uses the strongest available isolation and encryption primitives, with keys encrypted at rest and never exposed in plaintext outside secure enclaves.

## Problem

Wallet security is the foundation of user trust. Poor key management = catastrophic failure:

1. **Plaintext keys** → instant theft if device compromised
2. **Weak encryption** → brute-forceable with GPUs
3. **Poor isolation** → other apps can read keystore
4. **No hardware security** → software-only protection insufficient
5. **Key leakage** → keys exposed in logs, memory dumps, swap

## Goals

1. **Encrypted at rest** — keys never stored in plaintext
2. **Isolated storage** — platform-specific secure storage (Keychain, TPM, Secure Enclave)
3. **Strong crypto** — AES-256-GCM, scrypt/argon2, hardware-backed when available
4. **Zero-knowledge** — server never sees plaintext keys
5. **Defense in depth** — multiple layers of protection
6. **Auditable** — clear security properties for each surface

## Non-Goals

1. ~~Cloud backup~~ — user owns recovery phrase, we don't custody
2. ~~Social recovery on all platforms~~ — mobile/extension only
3. ~~Biometric-only auth~~ — always require recovery phrase option
4. ~~Server-side key generation~~ — always client-side

## Security Architecture by Surface

### 1. CLI (`unju` command)

**Threat Model:**
- Shared servers (SSH access)
- Root/sudo access by admins
- File system read by other users
- Memory dumps, swap files
- Agent automation (keys in env vars)

**Storage Location:**
```
~/.unju/keystore/
├── {wallet-name}.json   # Encrypted wallet files
└── .lock                # Prevent concurrent access
```

**File Permissions:**
- `chmod 0600` on keystore files (owner read/write only)
- `chmod 0700` on `~/.unju` directory

**Encryption Scheme:**

```typescript
interface KeystoreFile {
  version: 1
  name: string
  address: string
  encrypted: boolean
  createdAt: string
  
  // Encrypted private key (hex)
  key: string
  
  // Encryption params (only if encrypted)
  crypto?: {
    cipher: 'aes-256-gcm'
    kdf: 'scrypt' | 'argon2id'
    
    // Key derivation params
    salt: string        // 32 bytes, hex
    kdfParams: {
      // scrypt
      n?: number        // 2^18 (256 MB, ~1s on modern CPU)
      r?: number        // 8
      p?: number        // 1
      
      // argon2id (preferred for new wallets)
      memory?: number   // 256 MB
      iterations?: number // 3
      parallelism?: number // 4
    }
    
    // Encryption params
    iv: string          // 16 bytes, hex
    authTag: string     // 16 bytes, hex
  }
}
```

**Key Derivation (Password → AES Key):**

```typescript
import { scryptSync } from 'crypto'
import argon2 from 'argon2'

// Legacy (scrypt) — for compatibility with existing wallets
function deriveKeyScrypt(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, {
    N: 2 ** 18,  // 256 MB memory, ~1s on modern CPU
    r: 8,
    p: 1,
  })
}

// Preferred (argon2id) — better memory-hard properties
async function deriveKeyArgon2(password: string, salt: Buffer): Promise<Buffer> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 256 * 1024,  // 256 MB
    timeCost: 3,              // 3 iterations
    parallelism: 4,           // 4 threads
    salt,
    hashLength: 32,
    raw: true,
  })
}
```

**Encryption:**

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

function encryptKey(privateKey: string, password: string): EncryptedKey {
  const salt = randomBytes(32)
  const iv = randomBytes(16)
  const derivedKey = await deriveKeyArgon2(password, salt)

  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv)
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Zero out derived key from memory
  derivedKey.fill(0)

  return {
    ciphertext: encrypted.toString('hex'),
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  }
}

function decryptKey(encrypted: EncryptedKey, password: string): string {
  const derivedKey = await deriveKeyArgon2(
    password,
    Buffer.from(encrypted.salt, 'hex')
  )

  const decipher = createDecipheriv(
    'aes-256-gcm',
    derivedKey,
    Buffer.from(encrypted.iv, 'hex')
  )
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'hex')),
    decipher.final(),
  ])

  // Zero out derived key
  derivedKey.fill(0)

  const privateKey = decrypted.toString('utf8')
  
  // Zero out decrypted buffer
  decrypted.fill(0)
  
  return privateKey
}
```

**Agent Mode (No Password):**

For automation, agents can create unencrypted wallets:

```bash
# Create wallet without password
unju wallet create --no-password --output env > .env

# Outputs:
UNJU_WALLET_ADDRESS=0x742d35...
UNJU_PRIVATE_KEY=0xa3083e60...
```

**Security:**
- File still `chmod 0600`
- Key stored in plaintext (faster for agents)
- User warned: "NOT password-protected. Suitable for agents/automation only."

**Mitigation:**
- Agents should run in isolated containers
- Environment variables preferable to files
- Use secrets management (Kubernetes secrets, HashiCorp Vault) in production

---

### 2. Browser Extension

**Threat Model:**
- Malicious websites (XSS, phishing)
- Malicious extensions
- Memory dumps
- Browser restart attacks
- Clipboard sniffing

**Storage Location:**
```
chrome.storage.local
  └── wallets: {
       [address]: EncryptedWallet
     }
```

**Isolation:**
- Chrome storage API (sandboxed per-extension)
- Service worker runs in isolated context
- Keys never leave extension background script
- Content script has zero key access

**Encryption:**

Same as CLI (AES-256-GCM + argon2id), but with browser-specific optimizations:

```typescript
import { argon2id } from '@noble/hashes/argon2'

// Browser-optimized argon2 (WASM-based)
async function deriveKeyBrowser(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return argon2id(password, salt, {
    m: 256 * 1024,  // 256 MB
    t: 3,           // 3 iterations
    p: 1,           // Single-threaded (Web Workers later)
  })
}
```

**Session Management:**

```typescript
// Keep decrypted key in memory only
class WalletManager {
  private keys = new Map<string, Uint8Array>()  // address → privateKey
  private sessionTimeout = 30 * 60 * 1000  // 30 minutes

  async unlock(address: string, password: string) {
    const encrypted = await chrome.storage.local.get(`wallet:${address}`)
    const privateKey = await decryptKey(encrypted, password)
    
    this.keys.set(address, privateKey)
    
    // Auto-lock after timeout
    setTimeout(() => this.lock(address), this.sessionTimeout)
  }

  lock(address: string) {
    const key = this.keys.get(address)
    if (key) {
      key.fill(0)  // Zero out memory
      this.keys.delete(address)
    }
  }

  sign(address: string, message: string): string {
    const key = this.keys.get(address)
    if (!key) throw new Error('Wallet locked')
    return signMessage(key, message)
  }
}
```

**Enhanced Security (Future):**

```typescript
// Use Crypto.subtle for hardware-backed key derivation (TPM on Windows)
async function deriveKeyHardware(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600_000,  // OWASP 2023 recommendation
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,  // Non-extractable (stays in hardware)
    ['encrypt', 'decrypt']
  )
}
```

---

### 3. Mobile App (iOS + Android)

**Threat Model:**
- Device theft
- Malware
- Screenshot/screen recording
- Backup extraction (iTunes, Google Drive)
- Jailbreak/root access

**Storage Location:**

**iOS:**
```
Keychain (kSecAttrAccessible = kSecAttrAccessibleWhenUnlockedThisDeviceOnly)
  └── wallets/
      └── {address}/privateKey (encrypted with Secure Enclave)
```

**Android:**
```
EncryptedSharedPreferences + Keystore
  └── wallets/
      └── {address}/privateKey (encrypted with hardware key)
```

**iOS Security:**

```swift
import Security
import CryptoKit

class SecureWalletStore {
    // Store encrypted key in Keychain
    func savePrivateKey(address: String, encrypted: Data, password: String) throws {
        // Derive key using Secure Enclave (if available)
        let encryptionKey = try deriveKeySecureEnclave(password: password)
        
        let query: [String: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: "wallet:\(address)",
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecAttrSynchronizable: false,  // No iCloud sync
            kSecValueData: encrypted,
            kSecUseDataProtectionKeychain: true
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed
        }
    }
    
    // Derive key using Secure Enclave (biometric-protected)
    func deriveKeySecureEnclave(password: String) throws -> SymmetricKey {
        // Generate or retrieve enclave-backed key
        let attributes: [String: Any] = [
            kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits: 256,
            kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs: [
                kSecAttrIsPermanent: true,
                kSecAttrApplicationTag: "ai.unju.wallet.enclave",
                kSecAttrAccessControl: SecAccessControlCreateWithFlags(
                    nil,
                    kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                    .biometryCurrentSet,  // Requires FaceID/TouchID
                    nil
                )!
            ]
        ]
        
        var error: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            throw error!.takeRetainedValue() as Error
        }
        
        // Derive symmetric key from password + enclave key
        let passwordData = password.data(using: .utf8)!
        let salt = try getOrCreateSalt(address: address)
        
        return SymmetricKey(
            data: SHA256.hash(data: passwordData + enclaveKeyData + salt)
        )
    }
}
```

**Android Security:**

```kotlin
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

class SecureWalletStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .setUserAuthenticationRequired(true)  // Requires biometric
        .setUserAuthenticationValidityDurationSeconds(30)
        .build()
    
    private val encryptedPrefs = EncryptedSharedPreferences.create(
        context,
        "unju_wallets",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun savePrivateKey(address: String, encrypted: ByteArray) {
        // EncryptedSharedPreferences automatically encrypts with hardware key
        encryptedPrefs.edit()
            .putString("wallet:$address", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }
    
    fun loadPrivateKey(address: String, password: String): ByteArray {
        val encrypted = encryptedPrefs.getString("wallet:$address", null)
            ?: throw WalletNotFoundException()
        
        val encryptedBytes = Base64.decode(encrypted, Base64.NO_WRAP)
        
        // Decrypt with password-derived key
        return decryptWithPassword(encryptedBytes, password)
    }
}
```

**Biometric Authentication:**

```typescript
// React Native (Expo)
import * as LocalAuthentication from 'expo-local-authentication'

async function unlockWallet(address: string): Promise<PrivateKey> {
  // Check biometric availability
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  const isEnrolled = await LocalAuthentication.isEnrolledAsync()
  
  if (!hasHardware || !isEnrolled) {
    // Fallback to password
    return unlockWithPassword(address)
  }
  
  // Authenticate with biometric
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock wallet',
    fallbackLabel: 'Use password',
    cancelLabel: 'Cancel',
  })
  
  if (!result.success) {
    throw new Error('Authentication failed')
  }
  
  // Retrieve key from secure storage
  return await SecureStore.getItemAsync(`wallet:${address}`)
}
```

**Backup Strategy:**

```typescript
// Encrypted cloud backup (optional, user-controlled)
interface EncryptedBackup {
  version: 1
  wallets: Array<{
    address: string
    encryptedKey: string  // Double-encrypted: password + backup key
  }>
  backupKey: string  // Encrypted with user's master password
  createdAt: string
}

async function createBackup(
  wallets: Wallet[],
  masterPassword: string
): Promise<EncryptedBackup> {
  const backupKey = randomBytes(32)
  
  const encryptedWallets = await Promise.all(
    wallets.map(async (w) => ({
      address: w.address,
      // Double encryption: encrypt with backup key, then with password
      encryptedKey: await doubleEncrypt(w.privateKey, backupKey, masterPassword),
    }))
  )
  
  return {
    version: 1,
    wallets: encryptedWallets,
    backupKey: await encryptKey(backupKey, masterPassword),
    createdAt: new Date().toISOString(),
  }
}
```

---

### 4. Server Runtime (Agents)

**Threat Model:**
- Server compromise
- Memory dumps
- Container escape
- Log leakage
- Admin access

**Storage Options:**

#### Option A: Environment Variables (Simplest)

```bash
# Agent container
export UNJU_PRIVATE_KEY=0xa3083e60...
export UNJU_WALLET_ADDRESS=0x742d35...
```

**Security:**
- No encryption (key in plaintext)
- Container-isolated
- No filesystem storage
- Key only in memory

**Use Case:** Ephemeral agents, disposable keys

---

#### Option B: Encrypted Config File

```
/app/config/
├── wallet.enc          # Encrypted with KMS key
└── .wallet-lock        # Prevent concurrent access
```

```typescript
import { KMS } from '@aws-sdk/client-kms'

class KMSWalletStore {
  async savePrivateKey(privateKey: string): Promise<void> {
    // Encrypt with AWS KMS
    const encrypted = await kms.encrypt({
      KeyId: process.env.KMS_KEY_ID,
      Plaintext: Buffer.from(privateKey),
    })
    
    await fs.writeFile('/app/config/wallet.enc', encrypted.CiphertextBlob)
  }
  
  async loadPrivateKey(): Promise<string> {
    const encrypted = await fs.readFile('/app/config/wallet.enc')
    
    const decrypted = await kms.decrypt({
      CiphertextBlob: encrypted,
    })
    
    return decrypted.Plaintext.toString('utf8')
  }
}
```

---

#### Option C: HashiCorp Vault (Production)

```typescript
import Vault from 'node-vault'

class VaultWalletStore {
  private vault = Vault({
    endpoint: process.env.VAULT_ADDR,
    token: process.env.VAULT_TOKEN,
  })
  
  async savePrivateKey(address: string, privateKey: string): Promise<void> {
    await this.vault.write(`secret/wallets/${address}`, {
      privateKey,
      createdAt: new Date().toISOString(),
    })
  }
  
  async loadPrivateKey(address: string): Promise<string> {
    const result = await this.vault.read(`secret/wallets/${address}`)
    return result.data.privateKey
  }
}
```

**Vault Features:**
- AES-256-GCM encryption
- Access control policies
- Audit logging
- Key rotation
- Dynamic secrets

---

### 5. Hardware Wallet Support (All Surfaces)

**Ledger / Trezor Integration:**

```typescript
import TransportWebHID from '@ledgerhq/hw-transport-webhid'
import Eth from '@ledgerhq/hw-app-eth'

class HardwareWalletSigner {
  async signWithLedger(message: string): Promise<string> {
    const transport = await TransportWebHID.create()
    const eth = new Eth(transport)
    
    // Keys never leave hardware device
    const signature = await eth.signPersonalMessage(
      "m/44'/60'/0'/0/0",
      Buffer.from(message).toString('hex')
    )
    
    return signature
  }
}
```

**Security:**
- Private key never exposed to software
- PIN/passphrase on device
- Physical confirmation required
- Immune to malware

---

## Security Properties Summary

| Surface | Storage | Encryption | Isolation | Hardware | Score |
|---------|---------|------------|-----------|----------|-------|
| **CLI** | File | AES-256-GCM + argon2 | `chmod 0600` | ❌ | ⭐⭐⭐ |
| **Extension** | chrome.storage | AES-256-GCM + argon2 | Sandboxed | WebCrypto | ⭐⭐⭐⭐ |
| **Mobile iOS** | Keychain | AES-256-GCM + Secure Enclave | OS-level | ✅ Enclave | ⭐⭐⭐⭐⭐ |
| **Mobile Android** | EncryptedPrefs | AES-256-GCM + Keystore | OS-level | ✅ Keystore | ⭐⭐⭐⭐⭐ |
| **Server Env** | Env var | None | Container | ❌ | ⭐⭐ |
| **Server KMS** | Encrypted file | KMS AES-256 | Container | ✅ KMS HSM | ⭐⭐⭐⭐ |
| **Server Vault** | Vault | AES-256-GCM | Network | ✅ Vault HSM | ⭐⭐⭐⭐⭐ |
| **Hardware** | Device | Hardware | Physical | ✅ Secure chip | ⭐⭐⭐⭐⭐ |

---

## Migration from MetaMask/Rabby Keyring

**Fork Strategy:**

1. **Keep:** Core encryption logic (proven, audited)
2. **Replace:** Storage backend (platform-specific)
3. **Add:** Hardware security integration

```
@unju/wallet-core (Rust + WASM)
├── keyring/              ← Fork from Rabby eth-hd-keyring
│   ├── hd.rs            # BIP-32/39/44 HD wallets
│   ├── simple.rs        # Single keypairs
│   └── hardware.rs      # Ledger/Trezor
├── crypto/
│   ├── encrypt.rs       # AES-256-GCM encryption
│   ├── kdf.rs           # argon2id / scrypt
│   └── secure_zero.rs   # Memory zeroing
└── storage/
    ├── cli.rs           # File-based (CLI)
    ├── browser.rs       # chrome.storage
    ├── mobile.rs        # Keychain / Keystore
    └── server.rs        # KMS / Vault
```

---

## Implementation Plan

### Phase 1: Core Crypto (Week 1)
- [ ] Rust crypto module (AES-256-GCM, argon2id)
- [ ] WASM compilation
- [ ] Memory zeroing utilities
- [ ] Unit tests + benchmarks

### Phase 2: CLI Enhancement (Week 1-2)
- [ ] Migrate from scrypt to argon2id (new wallets)
- [ ] Add `--kdf argon2` flag
- [ ] Backward compatibility with scrypt
- [ ] Memory locking (`mlock` on Linux)

### Phase 3: Browser Extension (Week 2-3)
- [ ] chrome.storage backend
- [ ] Session timeout / auto-lock
- [ ] WebCrypto integration (optional)
- [ ] Memory zeroing in JS

### Phase 4: Mobile (Week 3-5)
- [ ] iOS Keychain integration
- [ ] Android EncryptedSharedPreferences
- [ ] Biometric unlock
- [ ] Secure Enclave key derivation

### Phase 5: Server (Week 5-6)
- [ ] KMS integration (AWS, GCP)
- [ ] Vault integration
- [ ] Docker secrets support
- [ ] K8s secrets support

### Phase 6: Security Audit (Week 7-8)
- [ ] Professional audit
- [ ] Penetration testing
- [ ] Bug bounty program
- [ ] Documentation

---

## Security Best Practices

### For Users

**CLI:**
```bash
# Always use passwords for human wallets
unju wallet create --name my-wallet
# Password: ********

# Only use --no-password for agents
unju wallet create --name agent-wallet --no-password

# Never commit wallets to git
echo ".unju/" >> ~/.gitignore
```

**Extension:**
- Set auto-lock timeout (default: 30 min)
- Use hardware wallet for large amounts
- Verify transaction details before signing

**Mobile:**
- Enable biometric unlock
- Set PIN as backup
- Back up recovery phrase securely (paper, steel)
- Never screenshot recovery phrase

### For Developers

**Agent Deployment:**
```yaml
# Kubernetes secret
apiVersion: v1
kind: Secret
metadata:
  name: agent-wallet
type: Opaque
stringData:
  UNJU_PRIVATE_KEY: "0xa3083e60..."
```

**Production:**
- Use KMS/Vault for production keys
- Rotate keys periodically
- Monitor access logs
- Implement key rotation

---

## Alternatives Considered

### Alternative 1: Plaintext Storage

**Rejected:** Catastrophic if device compromised

### Alternative 2: Password-Only Encryption (No Hardware)

**Rejected:** Vulnerable to offline brute-force attacks

### Alternative 3: Cloud-Only Key Storage

**Rejected:** Violates self-custody principles

### Alternative 4: Smart Contract Wallets Only (No EOA)

**Rejected:** Gas costs, deployment complexity

---

## Success Metrics

### Security
- Zero key leaks in production
- <1 second unlock time (argon2 optimized)
- 100% of mobile wallets use hardware security
- >50% of extension users enable auto-lock

### Adoption
- 80% of new wallets use strong passwords
- 60% of mobile users enable biometric
- 40% of high-value users adopt hardware wallets

### Performance
- <1s to unlock wallet (argon2id, 256MB)
- <100ms to sign transaction (cached key)
- <10MB memory footprint per wallet

---

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Apple Keychain Services](https://developer.apple.com/documentation/security/keychain_services)
- [Android Keystore System](https://developer.android.com/training/articles/keystore)
- [Argon2 Specification (RFC 9106)](https://datatracker.ietf.org/doc/html/rfc9106)
- [MetaMask Vault Implementation](https://github.com/MetaMask/KeyringController)
- [Rabby Keyring](https://github.com/RabbyHub/eth-hd-keyring)

---

## Changelog

- **2026-02-27**: Initial draft (Green Tara)
