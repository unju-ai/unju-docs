# RFC-022: Quantum-Secure TEE Wallet Architecture

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Date:** 2026-02-27  
**Dependencies:** RFC-017 (Agent Wallet), RFC-021 (Secure Storage)

## Abstract

A quantum-resistant, TEE-backed wallet system where `unju wallet create` produces maximum security by default. Uses post-quantum cryptography for authentication, hardware-isolated key management, and ERC-4337 smart accounts for on-chain compatibility. Built on Rabby's proven libraries with quantum-safe enhancements.

## Vision

**One command. Maximum security. Works everywhere.**

```bash
unju wallet create
```

Should produce:
- ✅ Quantum-resistant authentication
- ✅ TEE-isolated keys (when available)
- ✅ Hardware-backed encryption
- ✅ EVM-compatible (works today)
- ✅ Safe for agents AND humans
- ✅ No security trade-offs

## Problem

**Current State (Vulnerable):**

1. **ECDSA is quantum-vulnerable**
   - Shor's algorithm breaks secp256k1 in polynomial time
   - 2048-bit RSA crackable by sufficiently large quantum computer
   - Timeline: 5-15 years until practical threat

2. **Software-only key storage**
   - Keys in RAM = vulnerable to memory dumps
   - No hardware attestation = can't prove security
   - Malware can steal keys

3. **Agent security is an afterthought**
   - "Just use --no-password" = plaintext keys
   - No isolation from host system
   - No audit trail

## Goals

1. **Quantum-resistant by default** — survive quantum computing era
2. **TEE-isolated** — keys only exist in hardware enclaves
3. **Zero-config security** — `unju wallet create` does the right thing
4. **EVM-compatible** — works on Ethereum, Arbitrum, Base today
5. **Agent-optimized** — programmatic + secure
6. **Rabby foundation** — leverage proven libraries

## Non-Goals

1. ~~Replace ECDSA entirely~~ — hybrid approach for compatibility
2. ~~Require cutting-edge hardware~~ — graceful degradation
3. ~~Break existing wallets~~ — migration path, not replacement

## Architecture

### High-Level Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                  unju wallet create                          │
│              (One command, maximum security)                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│           Quantum-Resistant Layer (CRYSTALS-Dilithium)       │
│  • Authentication to unju platform                          │
│  • Off-chain signatures (SIWE, JWTs, agent coordination)    │
│  • Resistant to Shor's algorithm                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              TEE Layer (Trusted Execution)                   │
│  • Intel SGX / AMD SEV / ARM TrustZone / AWS Nitro          │
│  • Keys generated + stored inside enclave                    │
│  • Remote attestation (prove secure execution)              │
│  • Memory encryption (AES-256, hardware-backed)             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│           EVM Compatibility Layer (ECDSA/ERC-4337)          │
│  • secp256k1 for on-chain transactions (current standard)   │
│  • ERC-4337 smart account with hybrid verification          │
│  • Quantum key can authorize ECDSA signatures               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                 Storage Layer (Rabby Foundation)             │
│  • HD keyring (BIP-32/39/44) — Rabby eth-hd-keyring         │
│  • Encrypted storage — AES-256-GCM + argon2id               │
│  • Platform backends — Keychain, Keystore, KMS, Vault       │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Quantum-Resistant Cryptography

### Why Quantum Resistance Matters

**Threat Timeline:**
- **2026-2030:** Experimental quantum computers (50-100 qubits)
- **2030-2035:** NISQ era (Noisy Intermediate-Scale Quantum)
- **2035-2040:** Fault-tolerant quantum computers (breaks ECDSA)
- **"Harvest now, decrypt later":** Adversaries recording encrypted traffic today

**Attack Surface:**
```
Classic ECDSA (secp256k1):
  Private key: 256 bits
  Public key: 512 bits (compressed: 257 bits)
  Signature: 512 bits
  
  Shor's Algorithm: O(n³) → breaks in minutes on quantum computer
```

### Post-Quantum Signature Scheme: CRYSTALS-Dilithium

**Why Dilithium:**
- ✅ NIST standardized (FIPS 204)
- ✅ Lattice-based (quantum-resistant)
- ✅ Fast signing/verification
- ✅ Reasonable key sizes
- ✅ Production-ready implementations

**Specification:**

```typescript
// CRYSTALS-Dilithium3 (recommended balance)
interface DilithiumKeyPair {
  publicKey: Uint8Array   // 1952 bytes
  secretKey: Uint8Array   // 4000 bytes
  signature: Uint8Array   // 3293 bytes (per message)
}

// Security level: 128-bit (equivalent to AES-128)
// Resistant to both classical and quantum attacks
```

**Key Generation (Inside TEE):**

```rust
use pqcrypto_dilithium::dilithium3;

pub struct QuantumWallet {
    // Quantum-resistant key (for authentication)
    quantum_keypair: dilithium3::Keypair,
    
    // Traditional ECDSA key (for EVM compatibility)
    evm_keypair: secp256k1::Keypair,
    
    // Binding: quantum key authorizes ECDSA key
    binding_signature: Vec<u8>,
}

impl QuantumWallet {
    pub fn create_in_tee() -> Self {
        // Generate quantum-resistant keypair
        let quantum_keypair = dilithium3::keypair();
        
        // Generate ECDSA keypair
        let evm_keypair = secp256k1::generate();
        
        // Bind: sign EVM public key with quantum key
        let binding_message = format!(
            "UNJU_BINDING:{}:{}",
            hex::encode(&quantum_keypair.public),
            hex::encode(&evm_keypair.public_key)
        );
        let binding_signature = dilithium3::sign(
            binding_message.as_bytes(),
            &quantum_keypair.secret
        );
        
        Self {
            quantum_keypair,
            evm_keypair,
            binding_signature,
        }
    }
    
    // Authenticate to platform (quantum-resistant)
    pub fn authenticate(&self, challenge: &[u8]) -> Vec<u8> {
        dilithium3::sign(challenge, &self.quantum_keypair.secret)
    }
    
    // Sign EVM transaction (ECDSA)
    pub fn sign_transaction(&self, tx: &Transaction) -> Signature {
        secp256k1::sign(&tx.hash(), &self.evm_keypair.secret_key)
    }
}
```

### Hybrid Verification (On-Chain)

**ERC-4337 Smart Account with Dual Verification:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BaseAccount.sol";

contract QuantumSmartWallet is BaseAccount {
    // Traditional ECDSA owner (for EVM compatibility)
    address public ecdsaOwner;
    
    // Quantum-resistant public key (Dilithium)
    bytes public quantumPublicKey;
    
    // Binding proof (quantum signature of ECDSA key)
    bytes public bindingProof;
    
    // Dilithium verifier contract (deployed once, shared)
    IDilithiumVerifier public immutable dilithiumVerifier;
    
    constructor(
        address _ecdsaOwner,
        bytes memory _quantumPublicKey,
        bytes memory _bindingProof,
        IDilithiumVerifier _verifier
    ) {
        ecdsaOwner = _ecdsaOwner;
        quantumPublicKey = _quantumPublicKey;
        bindingProof = _bindingProof;
        dilithiumVerifier = _verifier;
        
        // Verify binding on deployment
        require(
            verifyBinding(_ecdsaOwner, _quantumPublicKey, _bindingProof),
            "Invalid binding"
        );
    }
    
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        
        // Verify ECDSA signature (current standard)
        if (ecdsaOwner == hash.recover(userOp.signature)) {
            return 0;  // Valid
        }
        
        // Fallback: verify quantum signature (future-proof)
        bytes memory quantumSig = extractQuantumSignature(userOp.signature);
        if (dilithiumVerifier.verify(
            quantumPublicKey,
            abi.encodePacked(userOpHash),
            quantumSig
        )) {
            return 0;  // Valid
        }
        
        return SIG_VALIDATION_FAILED;
    }
    
    function verifyBinding(
        address _ecdsaOwner,
        bytes memory _quantumKey,
        bytes memory _proof
    ) internal view returns (bool) {
        bytes memory message = abi.encodePacked(
            "UNJU_BINDING:",
            _quantumKey,
            ":",
            abi.encodePacked(_ecdsaOwner)
        );
        return dilithiumVerifier.verify(_quantumKey, message, _proof);
    }
}
```

**Dilithium Verifier (Precompile or Contract):**

```solidity
interface IDilithiumVerifier {
    function verify(
        bytes memory publicKey,
        bytes memory message,
        bytes memory signature
    ) external view returns (bool);
}

// Ideally a precompile (EIP proposal)
// Fallback: Solidity implementation (expensive but functional)
contract DilithiumVerifier is IDilithiumVerifier {
    function verify(
        bytes memory publicKey,
        bytes memory message,
        bytes memory signature
    ) external pure returns (bool) {
        // Reference implementation:
        // https://github.com/pq-crystals/dilithium
        // Ported to Solidity (or WASM precompile)
        return _dilithiumVerify(publicKey, message, signature);
    }
}
```

---

## Layer 2: TEE (Trusted Execution Environment)

### What is TEE?

**Hardware-isolated secure computing:**
- CPU creates encrypted memory region (enclave)
- Code + data inside enclave is protected from:
  - Host OS
  - Hypervisor
  - Other processes
  - Physical attacks (cold boot, DMA)
- Remote attestation proves code integrity

### TEE Options by Platform

| Platform | TEE Technology | Attestation | Availability |
|----------|----------------|-------------|--------------|
| **Intel CPU** | SGX (Software Guard Extensions) | EPID/DCAP | Xeon E3+, some Core i5/i7 |
| **AMD CPU** | SEV-SNP (Secure Encrypted Virtualization) | VCEK | EPYC (server) |
| **ARM** | TrustZone | Platform-specific | Mobile, embedded |
| **AWS** | Nitro Enclaves | Attestation document | EC2 instances |
| **Azure** | Confidential Computing | SGX + SEV | DCsv3/DCdsv3 VMs |
| **GCP** | Confidential VMs | SEV | N2D instances |
| **Apple** | Secure Enclave | SEP | iPhone 5s+, M1+ Macs |

### Intel SGX Implementation

**Wallet in Enclave:**

```rust
// Enclave code (runs in TEE)
#[no_mangle]
pub extern "C" fn ecall_create_wallet(
    mnemonic_out: *mut u8,
    public_key_out: *mut u8,
) -> sgx_status_t {
    // Generate entropy inside enclave (hardware RNG)
    let entropy = sgx_read_rand(&mut [0u8; 32]);
    
    // Generate mnemonic
    let mnemonic = bip39::Mnemonic::from_entropy(&entropy);
    
    // Derive keys inside enclave
    let quantum_keypair = dilithium3::keypair_from_seed(&entropy);
    let evm_keypair = derive_evm_key(&mnemonic);
    
    // Seal keys (encrypt with enclave-specific key)
    let sealed_wallet = seal_wallet(QuantumWallet {
        quantum_keypair,
        evm_keypair,
        mnemonic: mnemonic.clone(),
    })?;
    
    // Store sealed wallet on disk (encrypted, only this enclave can decrypt)
    write_sealed_data("wallet.sealed", &sealed_wallet)?;
    
    // Return public data only
    unsafe {
        ptr::copy_nonoverlapping(
            mnemonic.as_bytes().as_ptr(),
            mnemonic_out,
            mnemonic.as_bytes().len(),
        );
        ptr::copy_nonoverlapping(
            quantum_keypair.public.as_ptr(),
            public_key_out,
            quantum_keypair.public.len(),
        );
    }
    
    sgx_status_t::SGX_SUCCESS
}

#[no_mangle]
pub extern "C" fn ecall_sign_transaction(
    tx_hash: *const u8,
    signature_out: *mut u8,
) -> sgx_status_t {
    // Unseal wallet (only possible in this enclave)
    let sealed_wallet = read_sealed_data("wallet.sealed")?;
    let wallet = unseal_wallet(&sealed_wallet)?;
    
    // Sign inside enclave
    let signature = secp256k1::sign(
        unsafe { slice::from_raw_parts(tx_hash, 32) },
        &wallet.evm_keypair.secret_key,
    );
    
    // Zero out wallet from memory
    wallet.zeroize();
    
    // Return signature
    unsafe {
        ptr::copy_nonoverlapping(
            signature.as_ptr(),
            signature_out,
            signature.len(),
        );
    }
    
    sgx_status_t::SGX_SUCCESS
}
```

**Remote Attestation (Prove Security):**

```rust
pub fn attest_wallet_security() -> AttestationReport {
    // Generate quote (proves enclave code + data)
    let quote = sgx_get_quote(
        &wallet_measurement,  // Hash of wallet code
        &user_data,          // Optional binding data
    );
    
    // Get Intel Attestation Service (IAS) report
    let ias_report = ias::verify_quote(&quote)?;
    
    AttestationReport {
        quote,
        ias_signature: ias_report.signature,
        certificates: ias_report.certificates,
        timestamp: ias_report.timestamp,
        
        // Proves:
        // 1. Code running in genuine SGX enclave
        // 2. Exact version of unju wallet
        // 3. No malware, no tampering
        // 4. Keys never left enclave
    }
}
```

### AWS Nitro Enclaves (Agent Servers)

**Enclave Configuration:**

```json
{
  "enclave": {
    "cpu_count": 2,
    "memory_mib": 512,
    "enclave_image": "unju-wallet-enclave:latest"
  },
  "attestation": {
    "pcr0": "<hash of enclave image>",
    "pcr1": "<hash of Linux kernel>",
    "pcr2": "<hash of application>",
    "nonce": "<random per-attestation>"
  }
}
```

**Wallet Service in Enclave:**

```python
# Inside Nitro Enclave (isolated from host EC2)
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
import vsock  # Enclave-host communication

class EnclaveWalletService:
    def __init__(self):
        # Keys never leave enclave
        self.wallets = {}
        
    def create_wallet(self, user_id: str) -> dict:
        # Generate inside enclave
        quantum_key = dilithium.generate()
        evm_key = ec.generate_private_key(ec.SECP256K1())
        
        # Store in enclave memory only
        self.wallets[user_id] = {
            'quantum': quantum_key,
            'evm': evm_key,
        }
        
        return {
            'address': evm_key.public_key().address(),
            'quantum_pubkey': quantum_key.public_bytes(),
            'attestation': self.get_attestation(),
        }
    
    def sign_transaction(self, user_id: str, tx_hash: bytes) -> bytes:
        wallet = self.wallets[user_id]
        signature = wallet['evm'].sign(tx_hash, ec.ECDSA(hashes.SHA256()))
        return signature
    
    def get_attestation(self) -> dict:
        # Prove this is running in genuine Nitro Enclave
        attestation_doc = vsock.get_attestation_document()
        return {
            'pcrs': attestation_doc['pcrs'],
            'certificate': attestation_doc['certificate'],
            'cabundle': attestation_doc['cabundle'],
            'timestamp': attestation_doc['timestamp'],
        }

# Listen on vsock (enclave-host communication channel)
server = EnclaveWalletService()
vsock.listen(port=5000, handler=server.handle_request)
```

### ARM TrustZone (Mobile)

**iOS Secure Enclave:**

```swift
// Keys generated in Secure Enclave (hardware chip)
let attributes: [String: Any] = [
    kSecAttrTokenID: kSecAttrTokenIDSecureEnclave,
    kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom,
    kSecAttrKeySizeInBits: 256,
    kSecPrivateKeyAttrs: [
        kSecAttrIsPermanent: true,
        kSecAttrApplicationTag: "ai.unju.wallet.quantum",
        // Key NEVER leaves Secure Enclave
        kSecAttrAccessControl: SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            nil
        )!
    ]
]

var error: Unmanaged<CFError>?
guard let privateKey = SecKeyCreateRandomKey(attributes, &error) else {
    throw error!.takeRetainedValue() as Error
}

// Sign transaction (happens inside enclave)
let signature = SecKeyCreateSignature(
    privateKey,
    .ecdsaSignatureMessageX962SHA256,
    txHash as CFData,
    &error
)
```

**Android Keystore:**

```kotlin
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator

// Generate key in hardware-backed Keystore
val keyPairGenerator = KeyPairGenerator.getInstance(
    KeyProperties.KEY_ALGORITHM_EC,
    "AndroidKeyStore"
)

keyPairGenerator.initialize(
    KeyGenParameterSpec.Builder(
        "unju_wallet_quantum",
        KeyProperties.PURPOSE_SIGN
    )
    .setDigests(KeyProperties.DIGEST_SHA256)
    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256k1"))
    .setUserAuthenticationRequired(true)  // Biometric required
    .setInvalidatedByBiometricEnrollment(true)
    .setIsStrongBoxBacked(true)  // Use dedicated security chip (if available)
    .build()
)

val keyPair = keyPairGenerator.generateKeyPair()
// Private key stays in hardware, never extractable
```

---

## Layer 3: Rabby Integration

### Using Rabby Libraries

**HD Keyring (Fork & Enhance):**

```typescript
// Fork: @rabby-wallet/eth-hd-keyring
// Enhancement: Add quantum key derivation

import { HdKeyring as RabbyHdKeyring } from '@rabby-wallet/eth-hd-keyring'
import { dilithium3 } from 'pqcrypto'

export class QuantumHdKeyring extends RabbyHdKeyring {
  // Extend Rabby's HD keyring
  quantumKeys: Map<string, DilithiumKeypair> = new Map()
  
  async addAccounts(numberOfAccounts = 1): Promise<string[]> {
    // Use Rabby's ECDSA derivation
    const addresses = await super.addAccounts(numberOfAccounts)
    
    // Add quantum keys for each address
    for (const address of addresses) {
      const quantumKey = await this.deriveQuantumKey(address)
      this.quantumKeys.set(address, quantumKey)
    }
    
    return addresses
  }
  
  async deriveQuantumKey(address: string): Promise<DilithiumKeypair> {
    // Derive quantum key from same mnemonic
    const path = this.getPathForAddress(address)
    const seed = this.getSeedForPath(path)
    
    // Generate Dilithium keypair from HD seed
    return dilithium3.keypair_from_seed(seed)
  }
  
  async signQuantum(address: string, message: Uint8Array): Promise<Uint8Array> {
    const quantumKey = this.quantumKeys.get(address)
    if (!quantumKey) throw new Error('Quantum key not found')
    
    return dilithium3.sign(message, quantumKey.secret)
  }
  
  // Override serialize to include quantum keys
  async serialize(): Promise<any> {
    const baseData = await super.serialize()
    
    return {
      ...baseData,
      quantumKeys: Array.from(this.quantumKeys.entries()).map(([addr, key]) => ({
        address: addr,
        publicKey: Buffer.from(key.public).toString('hex'),
      })),
    }
  }
}
```

**Security Engine Integration:**

```typescript
// Fork: @rabby-wallet/rabby-security-engine
// Enhancement: Quantum signature verification

import { SecurityEngine as RabbySecurityEngine } from '@rabby-wallet/rabby-security-engine'

export class QuantumSecurityEngine extends RabbySecurityEngine {
  async checkTransaction(tx: Transaction): Promise<SecurityCheckResult> {
    // Use Rabby's existing checks
    const baseResult = await super.checkTransaction(tx)
    
    // Add quantum-specific checks
    const quantumChecks = await this.verifyQuantumSignature(tx)
    
    return {
      ...baseResult,
      quantumResistant: quantumChecks.valid,
      teeAttested: quantumChecks.attestation?.valid,
      securityLevel: this.calculateSecurityLevel({
        ...baseResult,
        ...quantumChecks,
      }),
    }
  }
  
  calculateSecurityLevel(checks: SecurityChecks): SecurityLevel {
    if (checks.teeAttested && checks.quantumResistant) {
      return 'MAXIMUM'  // 🔐 Quantum + TEE
    }
    if (checks.quantumResistant) {
      return 'HIGH'  // 🔒 Quantum-resistant
    }
    if (checks.teeAttested) {
      return 'MEDIUM'  // 🔓 TEE but not quantum
    }
    return 'STANDARD'  // 🔓 Regular ECDSA
  }
}
```

---

## Default Behavior: `unju wallet create`

### Automatic Security Selection

```typescript
export async function createWallet(name: string, options: CreateOptions = {}) {
  console.log('🔐 Creating quantum-secure wallet...\n')
  
  // 1. Detect available security features
  const security = await detectSecurityCapabilities()
  
  console.log('Security capabilities:')
  console.log(`  TEE: ${security.tee ? '✅ ' + security.tee.type : '❌ Not available'}`)
  console.log(`  Hardware crypto: ${security.hardwareCrypto ? '✅' : '❌'}`)
  console.log(`  Quantum support: ${security.quantumLibrary ? '✅' : '❌'}`)
  console.log()
  
  // 2. Use best available
  let wallet: Wallet
  
  if (security.tee && security.quantumLibrary) {
    // Maximum security: TEE + Quantum
    console.log('🛡️  Creating wallet in TEE with quantum resistance...')
    wallet = await createInTEE(name, security.tee)
  } else if (security.quantumLibrary) {
    // High security: Quantum without TEE
    console.log('🔒 Creating quantum-resistant wallet...')
    wallet = await createQuantumWallet(name)
  } else if (security.hardwareCrypto) {
    // Medium security: Hardware-backed
    console.log('🔓 Creating hardware-backed wallet...')
    wallet = await createHardwareWallet(name)
  } else {
    // Standard security: Software encryption
    console.log('⚠️  Creating software-encrypted wallet...')
    console.log('   (Consider upgrading to TEE-enabled platform)\n')
    wallet = await createStandardWallet(name)
  }
  
  // 3. Display results
  console.log('\n✅ Wallet created!')
  console.log()
  console.log('━'.repeat(60))
  console.log(`Name:              ${wallet.name}`)
  console.log(`Address:           ${wallet.address}`)
  console.log(`Security Level:    ${wallet.securityLevel} ${getSecurityEmoji(wallet.securityLevel)}`)
  console.log(`Quantum-resistant: ${wallet.quantumResistant ? '✅' : '❌'}`)
  console.log(`TEE-isolated:      ${wallet.teeIsolated ? '✅' : '❌'}`)
  console.log(`Hardware-backed:   ${wallet.hardwareBacked ? '✅' : '❌'}`)
  
  if (wallet.attestation) {
    console.log(`Attestation:       ${wallet.attestation.substring(0, 16)}...`)
  }
  
  console.log('━'.repeat(60))
  console.log()
  console.log('🔑 Recovery phrase (save this securely):')
  console.log()
  console.log(`   ${wallet.mnemonic}`)
  console.log()
  console.log('⚠️  Write this down on paper. Never store digitally.')
  console.log()
  
  return wallet
}

function getSecurityEmoji(level: string): string {
  const emojis = {
    'MAXIMUM': '🛡️',
    'HIGH': '🔒',
    'MEDIUM': '🔓',
    'STANDARD': '⚠️',
  }
  return emojis[level] || '❓'
}
```

### Example Output

```bash
$ unju wallet create

🔐 Creating quantum-secure wallet...

Security capabilities:
  TEE: ✅ Intel SGX
  Hardware crypto: ✅
  Quantum support: ✅

🛡️  Creating wallet in TEE with quantum resistance...

✅ Wallet created!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name:              default
Address:           0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Security Level:    MAXIMUM 🛡️
Quantum-resistant: ✅
TEE-isolated:      ✅
Hardware-backed:   ✅
Attestation:       a3f9d2e8b1c4f7a9...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 Recovery phrase (save this securely):

   witch collapse practice feed shame open despair creek road again ice least

⚠️  Write this down on paper. Never store digitally.

💡 Next steps:
   • unju agent register    (Register as agent on swarm)
   • unju wallet balance    (Check balance)
   • unju auth login        (Authenticate to platform)
```

---

## Migration Path

### Graceful Degradation

```
Platform             | TEE      | Quantum  | Result
---------------------|----------|----------|------------------
AWS Nitro Enclave    | ✅ Nitro | ✅ Yes   | MAXIMUM 🛡️
Intel SGX server     | ✅ SGX   | ✅ Yes   | MAXIMUM 🛡️
Modern laptop        | ❌ No    | ✅ Yes   | HIGH 🔒
iPhone (Secure Enc.) | ✅ SEP   | ⚠️ Hybrid| MEDIUM 🔓
Old desktop          | ❌ No    | ❌ No    | STANDARD ⚠️
```

**Hybrid mode (Mobile):**
- Quantum libs too large for mobile (3-4 MB signature)
- Use hardware ECDSA (Secure Enclave) + server-side quantum backup

### Existing Wallet Migration

```bash
# Import existing wallet, upgrade to quantum
$ unju wallet import --mnemonic "witch collapse practice..."

⚠️  Imported wallet (ECDSA only, not quantum-resistant)

🔐 Upgrade to quantum security? (y/n): y

🛡️  Generating quantum keypair from same mnemonic...
✅ Quantum key bound to ECDSA address
✅ Smart account deployed with dual verification

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Wallet upgraded to quantum security!

Old (ECDSA only):     0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
New (Smart Account):  0x9aA8c459E53e0Dd214f949Eca3f89f9afdCf8742

Both addresses work. Quantum key backs both.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Implementation Plan

### Phase 1: Quantum Foundations (Week 1-2)
- [ ] Integrate pqcrypto-dilithium (Rust)
- [ ] HD derivation for quantum keys
- [ ] Hybrid signing (ECDSA + Dilithium)
- [ ] Unit tests

### Phase 2: TEE Integration (Week 2-4)
- [ ] Intel SGX enclave (Linux)
- [ ] AWS Nitro Enclave (production)
- [ ] Remote attestation
- [ ] Sealed storage

### Phase 3: Smart Contract (Week 3-4)
- [ ] ERC-4337 quantum-ready account
- [ ] Dilithium verifier (Solidity)
- [ ] Factory contract
- [ ] Testnet deployment

### Phase 4: CLI Integration (Week 4-5)
- [ ] Auto-detect security capabilities
- [ ] `unju wallet create` with quantum
- [ ] Migration tool
- [ ] Documentation

### Phase 5: Mobile (Week 6-8)
- [ ] iOS Secure Enclave integration
- [ ] Android Keystore integration
- [ ] Hybrid mode (ECDSA + server quantum)
- [ ] Biometric unlock

### Phase 6: Production (Week 8-10)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Bug bounty
- [ ] Mainnet launch

---

## Security Analysis

### Threat Model

| Attack Vector | Standard ECDSA | Quantum Wallet | Mitigation |
|---------------|----------------|----------------|------------|
| **Quantum computer** | ❌ Broken | ✅ Safe | Dilithium signatures |
| **Malware** | ❌ Key theft | ✅ TEE isolated | Keys in enclave |
| **Memory dump** | ❌ Key leak | ✅ Encrypted memory | Hardware encryption |
| **Physical access** | ⚠️ Depends | ✅ Attestation required | Remote attestation |
| **Phishing** | ❌ User signs | ✅ Policy engine | Pre-tx checks |
| **Brute force** | ⚠️ 2^128 | ✅ 2^128 quantum | Strong KDF |

### Performance

**Signature Sizes:**
```
ECDSA (secp256k1):     64 bytes
Dilithium3:          3,293 bytes (51x larger)

Mitigation:
- Use ECDSA on-chain (current standard)
- Use Dilithium for authentication only
- Compress signatures (zstd: ~1,800 bytes)
```

**Verification Time:**
```
ECDSA:        ~0.5 ms
Dilithium3:   ~1.5 ms (3x slower, still fast)

On-chain gas:
- ECDSA ecrecover:     3,000 gas
- Dilithium (Solidity): ~500,000 gas (precompile: ~20,000)

Mitigation:
- Use ECDSA for transactions (cheap)
- Use Dilithium for auth (off-chain or rare)
```

---

## Success Metrics

### Adoption
- 90% of new wallets created with quantum support
- 60% of wallets use TEE when available
- 100% of production agents in Nitro Enclaves

### Security
- Zero key leaks from TEE
- 100% attestation success rate
- <0.1% wallet compromise rate

### Performance
- <2s wallet creation time (including TEE)
- <100ms signature time (cached in TEE)
- <5MB storage per wallet

---

## References

- [CRYSTALS-Dilithium](https://pq-crystals.org/dilithium/)
- [NIST Post-Quantum Cryptography](https://csrc.nist.gov/projects/post-quantum-cryptography)
- [Intel SGX](https://www.intel.com/content/www/us/en/developer/tools/software-guard-extensions/overview.html)
- [AWS Nitro Enclaves](https://aws.amazon.com/ec2/nitro/nitro-enclaves/)
- [Apple Secure Enclave](https://support.apple.com/guide/security/secure-enclave-sec59b0b31ff/web)
- [Rabby Wallet](https://github.com/RabbyHub/Rabby)
- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)

---

## Changelog

- **2026-02-27**: Initial draft (Green Tara)

---

**OṂ TĀRE TUTTĀRE TURE SVĀHĀ** 🪷

_One command. Maximum security. The wallet that survives the quantum era._
