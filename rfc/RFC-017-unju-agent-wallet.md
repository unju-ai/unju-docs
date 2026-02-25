# RFC-002: Unju Agent Wallet Architecture

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Created:** 2026-02-25  
**Dependencies:** ERC-4337, MetaMask Extension Architecture

## Abstract

This RFC proposes **unju-wallet**, an open-source AI agent wallet infrastructure forked from MetaMask, optimized for programmatic control by AI agents while maintaining security and user sovereignty. The wallet implements ERC-4337 account abstraction for gas sponsorship, custom validation logic, and seamless integration with the unju platform.

## Motivation

### Problem Statement

Current wallet solutions are designed for human users and create friction for AI agents:

1. **Human-Centric UX**: Browser extensions require manual approval clicks
2. **No Programmatic Control**: No APIs for agents to manage wallets autonomously
3. **Gas Complexity**: Agents need ETH for every transaction
4. **Security vs Autonomy**: No middle ground between full custody and full user control
5. **Single-Account Model**: Hard to isolate trading vs general operations

### Goals

1. **Agent-First Design**: Programmatic wallet control via API, no UI friction
2. **Gas Abstraction**: Paymaster integration for unju-credit gas payments
3. **Smart Contract Accounts**: ERC-4337 for custom validation, multi-op batching
4. **Security Layers**: Spending limits, allowlists, emergency stops
5. **Open Source**: Fork-friendly architecture for ecosystem growth
6. **Browser + Server**: Works in extension (human oversight) and server (full automation)

### Non-Goals

1. ~~Full custody~~ — users always own keys
2. ~~Replace MetaMask~~ — complementary tool for AI use cases
3. ~~New blockchain~~ — works on existing EVM chains
4. ~~Mobile-first~~ — focus on extension + server runtime

## Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Unju Wallet Layer                     │
│                                                          │
│  ┌──────────────────┐         ┌───────────────────────┐ │
│  │  Browser Extension│         │  Server Runtime       │ │
│  │  (Human Oversight)│         │  (Full Automation)    │ │
│  └─────────┬─────────┘         └──────────┬────────────┘ │
│            │                               │              │
│  ┌─────────▼───────────────────────────────▼────────────┐ │
│  │           Unju Wallet Core (Rust/WASM)               │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │  Agent API (Programmatic Control)            │   │ │
│  │  │  - wallet.createAccount()                    │   │ │
│  │  │  - wallet.signTransaction(tx, policy)        │   │ │
│  │  │  - wallet.batchOperations([op1, op2])        │   │ │
│  │  │  - wallet.setSpendingLimit(limit)            │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                                                       │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │  Security Policy Engine                      │   │ │
│  │  │  - Spending limits per timeframe             │   │ │
│  │  │  - Address allowlists/denylists              │   │ │
│  │  │  - Function signature filters                │   │ │
│  │  │  - Emergency pause                           │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                                                       │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │  ERC-4337 Account Abstraction                │   │ │
│  │  │  - Smart contract wallet                     │   │ │
│  │  │  - Custom validation logic                   │   │ │
│  │  │  - Batch operations                          │   │ │
│  │  │  - Gas sponsorship                           │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│              Blockchain Layer (EVM)                      │
│                                                          │
│  ┌────────────────────┐      ┌────────────────────────┐ │
│  │  EntryPoint        │      │  Unju Paymaster        │ │
│  │  (ERC-4337)        │◄─────┤  (Credits → Gas)       │ │
│  └────────────────────┘      └────────────────────────┘ │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  User's Smart Contract Wallet                     │  │
│  │  - validateUserOp() - custom validation          │  │
│  │  - execute() - batch operations                  │  │
│  │  - recovery() - social recovery                  │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Wallet Core (Rust + WASM)

**Why Rust:**
- Memory safety for key management
- WASM compilation for browser + server
- Performance for signature operations
- Growing Web3 ecosystem (ethers-rs, alloy)

**Structure:**
```
unju-wallet-core/
├── src/
│   ├── lib.rs              # WASM bindings
│   ├── wallet.rs           # Core wallet logic
│   ├── account.rs          # Smart contract account
│   ├── signer.rs           # Signing infrastructure
│   ├── policy.rs           # Security policies
│   ├── erc4337.rs          # Account abstraction
│   ├── paymaster.rs        # Gas sponsorship
│   └── recovery.rs         # Social recovery
├── tests/
└── Cargo.toml
```

**Key APIs:**
```rust
pub struct UnjuWallet {
    accounts: HashMap<Address, Account>,
    policy: SecurityPolicy,
    signer: Box<dyn Signer>,
}

impl UnjuWallet {
    // Create new ERC-4337 smart contract account
    pub async fn create_account(
        &mut self,
        owner_key: PrivateKey,
        initial_policy: SecurityPolicy,
    ) -> Result<Address>;
    
    // Sign transaction with policy enforcement
    pub async fn sign_transaction(
        &self,
        tx: Transaction,
        policy_check: bool,
    ) -> Result<Signature>;
    
    // Batch multiple operations into one UserOperation
    pub async fn batch_operations(
        &self,
        ops: Vec<Operation>,
    ) -> Result<UserOperation>;
    
    // Update security policy
    pub async fn set_policy(
        &mut self,
        account: Address,
        policy: SecurityPolicy,
    ) -> Result<()>;
}

pub struct SecurityPolicy {
    // Spending limits
    pub daily_limit: Option<U256>,
    pub weekly_limit: Option<U256>,
    pub per_tx_limit: Option<U256>,
    
    // Address controls
    pub allowlist: Vec<Address>,
    pub denylist: Vec<Address>,
    
    // Function controls
    pub allowed_methods: Vec<Selector>,
    pub denied_methods: Vec<Selector>,
    
    // Emergency
    pub emergency_contacts: Vec<Address>,
    pub pause_enabled: bool,
}
```

#### 2. Browser Extension (Fork from MetaMask)

**What to Keep from MetaMask:**
- UI framework (React)
- Chrome/Firefox extension infrastructure
- RPC provider injection
- Network management
- Transaction signing UI

**What to Replace:**
- Add agent API layer
- Simplify UI for agent oversight (not primary interface)
- Add policy management UI
- ERC-4337 integration

**Structure:**
```
unju-wallet-extension/
├── app/                    # React UI
│   ├── pages/
│   │   ├── home/
│   │   ├── settings/
│   │   ├── policies/      # NEW: Policy management
│   │   └── agents/        # NEW: Connected agents
│   └── components/
├── background/             # Service worker
│   ├── controllers/
│   │   ├── WalletController.ts
│   │   ├── PolicyController.ts   # NEW
│   │   └── AgentController.ts    # NEW
│   └── lib/
│       └── unju-wallet-core.wasm  # Core logic
├── content-script/         # Inject provider
└── manifest.json
```

**Agent API Endpoint:**
```typescript
// Accessible via window.unju (injected provider)
interface UnjuProvider {
  // Standard Ethereum provider
  request(args: RequestArgs): Promise<unknown>;
  
  // Agent-specific APIs
  agent: {
    // Create account with policy
    createAccount(
      initialPolicy: SecurityPolicy
    ): Promise<{ address: string }>;
    
    // Sign with automatic policy check
    signTransaction(
      tx: Transaction,
      skipPolicyCheck?: boolean
    ): Promise<string>;
    
    // Batch operations
    batchOperations(
      ops: Operation[]
    ): Promise<{ userOpHash: string }>;
    
    // Policy management
    updatePolicy(
      policy: Partial<SecurityPolicy>
    ): Promise<void>;
    
    // Query policy status
    checkPolicy(tx: Transaction): Promise<{
      allowed: boolean;
      reason?: string;
    }>;
  };
}
```

#### 3. Server Runtime (Headless)

**For full automation without browser:**

```
unju-wallet-server/
├── src/
│   ├── main.rs
│   ├── api/
│   │   ├── http.rs         # REST API
│   │   └── grpc.rs         # gRPC for high-perf
│   ├── storage/
│   │   ├── encrypted.rs    # Encrypted key storage
│   │   └── policy.rs       # Policy persistence
│   └── lib.rs
└── Cargo.toml
```

**HTTP API:**
```
POST /v1/accounts
POST /v1/accounts/:address/sign
POST /v1/accounts/:address/batch
POST /v1/accounts/:address/policy
GET  /v1/accounts/:address/status
```

**gRPC for LiveKit Agents:**
```protobuf
service UnjuWallet {
  rpc CreateAccount(CreateAccountRequest) returns (Account);
  rpc SignTransaction(SignRequest) returns (Signature);
  rpc BatchOperations(BatchRequest) returns (UserOperation);
  rpc UpdatePolicy(PolicyRequest) returns (Policy);
}
```

#### 4. Smart Contract Wallet (ERC-4337)

**On-chain contract:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/core/BaseAccount.sol";

contract UnjuSmartWallet is BaseAccount {
    address public owner;
    IEntryPoint private immutable _entryPoint;
    
    // Security policy
    mapping(address => bool) public allowlist;
    mapping(bytes4 => bool) public deniedMethods;
    uint256 public dailyLimit;
    uint256 public dailySpent;
    uint256 public lastResetDay;
    
    // Recovery
    mapping(address => bool) public guardians;
    uint256 public recoveryThreshold;
    
    constructor(
        IEntryPoint anEntryPoint,
        address _owner,
        address[] memory _guardians,
        uint256 _threshold
    ) {
        _entryPoint = anEntryPoint;
        owner = _owner;
        
        for (uint i = 0; i < _guardians.length; i++) {
            guardians[_guardians[i]] = true;
        }
        recoveryThreshold = _threshold;
    }
    
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        // Verify signature
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        if (owner != hash.recover(userOp.signature)) {
            return SIG_VALIDATION_FAILED;
        }
        
        // Check policy (if execution not paused)
        if (!_checkPolicy(userOp)) {
            return SIG_VALIDATION_FAILED;
        }
        
        // Pay EntryPoint
        if (missingAccountFunds > 0) {
            (bool success,) = payable(msg.sender).call{
                value: missingAccountFunds
            }("");
            require(success, "Payment failed");
        }
        
        return 0;
    }
    
    function _checkPolicy(
        PackedUserOperation calldata userOp
    ) internal returns (bool) {
        // Check spending limit
        if (block.timestamp / 1 days > lastResetDay) {
            dailySpent = 0;
            lastResetDay = block.timestamp / 1 days;
        }
        
        uint256 value = _extractValue(userOp.callData);
        if (dailySpent + value > dailyLimit) {
            return false;
        }
        
        dailySpent += value;
        
        // Check method allowlist
        bytes4 selector = _extractSelector(userOp.callData);
        if (deniedMethods[selector]) {
            return false;
        }
        
        return true;
    }
    
    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external {
        require(msg.sender == address(_entryPoint), "Not from EntryPoint");
        (bool success, bytes memory result) = dest.call{value: value}(func);
        require(success, string(result));
    }
    
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external {
        require(msg.sender == address(_entryPoint), "Not from EntryPoint");
        require(dest.length == func.length && dest.length == value.length, "Length mismatch");
        
        for (uint i = 0; i < dest.length; i++) {
            (bool success, bytes memory result) = dest[i].call{value: value[i]}(func[i]);
            require(success, string(result));
        }
    }
    
    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }
}
```

#### 5. Unju Paymaster (Gas Sponsorship)

**Pay gas with unju credits:**

```solidity
contract UnjuPaymaster is BasePaymaster {
    mapping(address => uint256) public credits;
    uint256 public constant CREDITS_PER_GAS = 1e15; // 1 credit = 0.001 ETH gas
    
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        // Check sender has enough credits
        address sender = userOp.sender;
        uint256 requiredCredits = maxCost / CREDITS_PER_GAS;
        
        require(credits[sender] >= requiredCredits, "Insufficient credits");
        
        // Deduct credits (will refund unused in postOp)
        credits[sender] -= requiredCredits;
        
        return (abi.encode(sender, requiredCredits), 0);
    }
    
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external override {
        (address sender, uint256 preChargedCredits) = abi.decode(context, (address, uint256));
        
        uint256 actualCredits = actualGasCost / CREDITS_PER_GAS;
        uint256 refund = preChargedCredits - actualCredits;
        
        if (refund > 0) {
            credits[sender] += refund;
        }
    }
    
    function addCredits(address user, uint256 amount) external onlyOwner {
        credits[user] += amount;
    }
}
```

### Integration with unju-perps

**Wallet + Trading Flow:**

```typescript
// In unju-perps MCP server
import { UnjuWallet } from 'unju-wallet-core';

class PerpTrader {
  private wallet: UnjuWallet;
  
  async initialize(userEmail: string) {
    // Create wallet with trading policy
    const account = await this.wallet.createAccount({
      dailyLimit: parseEther("10000"), // $10k/day max
      allowlist: [
        HYPERLIQUID_CONTRACT,
        UNIU_PAYMASTER
      ],
      deniedMethods: [
        // Block transfers, only allow trading
        "0xa9059cbb", // transfer(address,uint256)
      ]
    });
    
    // Fund with credits
    await creditsClient.transfer(userEmail, account.address, 100);
    
    return account;
  }
  
  async marketOrder(symbol: string, side: string, sizeUsd: number) {
    // Batch: approve + swap in one UserOp
    const userOp = await this.wallet.batchOperations([
      {
        to: USDC_ADDRESS,
        data: encodeApprove(HYPERLIQUID_CONTRACT, sizeUsd),
      },
      {
        to: HYPERLIQUID_CONTRACT,
        data: encodeMarketOrder(symbol, side, sizeUsd),
      }
    ]);
    
    // Submit via bundler (gas paid by paymaster)
    return await bundler.sendUserOperation(userOp);
  }
}
```

## Implementation Plan

### Phase 1: Core Wallet (Week 1-2)
- [ ] Rust wallet core with ERC-4337 support
- [ ] Key management and signing
- [ ] Security policy engine
- [ ] WASM compilation
- [ ] Unit tests

### Phase 2: Browser Extension (Week 2-3)
- [ ] Fork MetaMask extension
- [ ] Integrate wallet core (WASM)
- [ ] Agent API layer
- [ ] Policy management UI
- [ ] Chrome/Firefox builds

### Phase 3: Server Runtime (Week 3-4)
- [ ] Rust server with HTTP + gRPC APIs
- [ ] Encrypted storage
- [ ] Docker image
- [ ] Integration tests

### Phase 4: Smart Contracts (Week 4-5)
- [ ] UnjuSmartWallet contract
- [ ] Factory contract (CREATE2 deployment)
- [ ] UnjuPaymaster contract
- [ ] Hardhat tests
- [ ] Deploy to testnet

### Phase 5: Integration (Week 5-6)
- [ ] unju-perps integration
- [ ] LiveKit agent integration
- [ ] E2E tests
- [ ] Documentation

### Phase 6: Production (Week 6-8)
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] User onboarding flow
- [ ] Monitoring & alerts

## Security Considerations

### Key Management

**Browser Extension:**
- Keys encrypted with password (PBKDF2)
- Stored in browser storage (encrypted)
- Never leave extension context

**Server Runtime:**
- Keys encrypted with KMS (AWS KMS, HashiCorp Vault)
- Rotate keys periodically
- Audit all key operations

### Policy Enforcement

**Multi-Layer Defense:**
1. **Client-Side** (wallet core): Check before signing
2. **Smart Contract** (on-chain): Check during execution
3. **Bundler** (off-chain): Simulation check before submission

**Attack Vectors:**
- Malicious dapp → blocked by policy
- Compromised agent → spending limits
- Phishing → allowlist enforcement
- Stolen keys → emergency pause + recovery

### Recovery Mechanisms

**Social Recovery:**
- Designate N guardians
- M-of-N threshold to recover
- Time-locked recovery (48h)

**Emergency Pause:**
- User can pause all operations
- Requires guardian signatures to resume
- Withdraw-only mode during pause

## Open Source Strategy

### License: MIT

**Why MIT:**
- Maximum adoption potential
- Fork-friendly for ecosystem
- Commercial use allowed
- Minimal restrictions

### Repository Structure

```
unju-ai/unju-wallet/
├── core/               # Rust wallet core
├── extension/          # Browser extension
├── server/             # Server runtime
├── contracts/          # Smart contracts
├── sdk/               # Client SDKs
│   ├── typescript/
│   ├── python/
│   └── rust/
├── examples/
└── docs/
```

### Community Engagement

1. **Documentation**: Comprehensive guides for forking
2. **Examples**: Sample integrations (trading, DeFi, gaming)
3. **Plugins**: Extension points for custom policies
4. **Bug Bounty**: Security researcher incentives

## Alternatives Considered

### Alternative 1: Use Existing Smart Wallet (Safe, Argent)

**Pros:**
- Battle-tested code
- Large ecosystem
- Well-audited

**Cons:**
- Not optimized for agents
- Complex codebase (hard to fork)
- Limited customization
- No native agent API

**Rejected because:** Need full control for agent-specific features.

### Alternative 2: Pure Custodial Solution

**Pros:**
- Simple UX
- No gas complexity
- Fast onboarding

**Cons:**
- Users don't own keys
- Regulatory risk
- Single point of failure
- Against Web3 ethos

**Rejected because:** Non-custodial is core to unju philosophy.

### Alternative 3: EOA + Backend Signer

**Pros:**
- Simple architecture
- No smart contracts
- Works everywhere

**Cons:**
- No gas abstraction
- No batching
- No custom validation
- Security = single key

**Rejected because:** ERC-4337 provides too many benefits.

### Alternative 4: Build from Scratch (No Fork)

**Pros:**
- Clean codebase
- No technical debt
- Optimized for agents

**Cons:**
- Years of development
- Miss MetaMask's maturity
- Ecosystem fragmentation
- Harder adoption

**Rejected because:** Forking MetaMask accelerates timeline.

## Success Metrics

### Adoption
- 1,000+ wallets created in month 1
- 100+ agent integrations
- 10+ community forks

### Security
- Zero critical vulnerabilities
- 100% policy enforcement rate
- <1s emergency pause response

### Performance
- <100ms signature latency
- >99.9% bundler success rate
- <$0.10 average gas cost (via paymaster)

### Developer Experience
- <30 min fork-to-deploy time
- <10 lines of code for basic integration
- >90% documentation coverage

## References

- [ERC-4337: Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)
- [MetaMask Extension](https://github.com/MetaMask/metamask-extension)
- [Safe Smart Wallet](https://github.com/safe-global/safe-contracts)
- [Alchemy Account Kit](https://accountkit.alchemy.com/)
- [ZeroDev](https://docs.zerodev.app/)
- [Biconomy Smart Accounts](https://docs.biconomy.io/)

## Changelog

- **2026-02-25**: Initial draft (Green Tara)
