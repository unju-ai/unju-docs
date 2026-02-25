# RFC-018: Wallet-First Identity System

**Status:** Draft  
**Author:** Green Tara (AI Agent)  
**Date:** 2026-02-25  
**Repo:** unju-ai/unju-wallet

## Summary

A wallet-first identity system where Ethereum addresses serve as primary identifiers, with virtual email addresses (`address@unju.ai`) for service compatibility and Sign In With Ethereum (SIWE) for platform authentication. No email signup required—users create wallets locally and optionally connect to platform features.

## Problem

Current Web3 onboarding creates unnecessary friction:

1. **Email Gatekeeping**: Users must provide email to create accounts, even when they have wallets
2. **Platform Lock-in**: Wallet creation tied to centralized services (Magic, Privy)
3. **Privacy Leaks**: Email associates real identity with on-chain activity
4. **Poor UX**: Sign up → verify email → create wallet → fund wallet = too many steps
5. **Custody Confusion**: Users don't know if they control their keys

## Proposal

### Core Principle

**Your wallet address IS your identity. Everything else is optional.**

### Architecture

```
┌─────────────────────────────────────────────────┐
│        Identity Layer (Decentralized)           │
│                                                 │
│  Ethereum Address: 0x742d35...f0bEb (primary)  │
│  Virtual Email: 0x742d35...f0bEb@unju.ai       │
│  ENS (optional): esper.eth                     │
│                                                 │
└──────────────────┬──────────────────────────────┘
                   │
                   │ SIWE (Sign In With Ethereum)
                   │
┌──────────────────▼──────────────────────────────┐
│      Platform Layer (Centralized, Optional)     │
│                                                 │
│  Features:                                      │
│  - Credits balance                              │
│  - Trading history                              │
│  - Cloud sync                                   │
│  - Email notifications                          │
│  - Premium features                             │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Wallet Creation (Client-Side Only)

**No server interaction required:**

```typescript
// In browser, CLI, or mobile app
import { UnjuWallet } from 'unju-wallet-core';

// Generate wallet locally (WASM runs client-side)
const wallet = UnjuWallet.create();

console.log({
  address: wallet.address,
  identity: `${wallet.address}@unju.ai`,
  mnemonic: wallet.mnemonic // User must save this!
});

// Wallet is ready to use immediately
// No server call, no signup, no email verification
```

### Virtual Email System

**Format:** `<ethereum-address>@unju.ai`

**Examples:**
- Full: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb@unju.ai`
- Short: `0x742d...f0bEb@unju.ai`

**Why:**
- Many services require email (OAuth, notifications, password reset)
- Deterministic from address (no extra storage)
- Privacy-preserving (address is already public)
- No verification needed (cryptographic proof via SIWE)

**Implementation:**

```typescript
export class WalletIdentity {
  address: string; // 0x742d35Cc...
  
  get email(): string {
    return `${this.address}@unju.ai`;
  }
  
  get shortEmail(): string {
    const start = this.address.slice(0, 6);
    const end = this.address.slice(-4);
    return `${start}...${end}@unju.ai`;
  }
  
  // ENS support (optional)
  get ensName(): string | null {
    return this.resolveENS(); // esper.eth
  }
  
  // Display name priority: ENS > short address
  get displayName(): string {
    return this.ensName || this.shortEmail;
  }
}
```

### Sign In With Ethereum (SIWE)

**Standard:** [EIP-4361](https://eips.ethereum.org/EIPS/eip-4361)

**Flow:**

```
1. User: "Connect wallet"
2. Backend: Generate nonce
3. Frontend: Create SIWE message
4. User: Sign message with wallet
5. Frontend: Send message + signature
6. Backend: Verify signature, create session
7. Done: User authenticated
```

**Message Format:**

```
unju.ai wants you to sign in with your Ethereum account:
0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

Virtual identity: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb@unju.ai

URI: https://unju.ai
Version: 1
Chain ID: 42161
Nonce: 7g8f3h9d2j
Issued At: 2026-02-25T17:00:00.000Z
```

**Backend Verification:**

```typescript
// unju-api/src/auth/siwe.ts
import { SiweMessage } from 'siwe';

export async function verifySIWE(req: Request) {
  const { message, signature } = req.body;
  
  // Parse and verify
  const siweMessage = new SiweMessage(message);
  const { data: fields } = await siweMessage.verify({ signature });
  
  const address = fields.address.toLowerCase();
  const email = `${address}@unju.ai`;
  
  // Find or create user
  let user = await db.user.findUnique({ 
    where: { address } 
  });
  
  if (!user) {
    user = await db.user.create({
      data: {
        address,
        email, // Virtual email
        emailVerified: new Date(), // Auto-verified
        authMethod: 'WALLET',
        credits: 0
      }
    });
  }
  
  // Create session
  const session = await createSession(user.id);
  
  return { user, session };
}
```

### Database Schema

```prisma
model User {
  id            String    @id @default(cuid())
  
  // Primary identity (wallet-first)
  address       String    @unique       // Ethereum address
  email         String    @unique       // Virtual: address@unju.ai OR real
  emailVerified DateTime?               // Auto for wallet, manual for email
  
  // Optional: Real email for notifications
  realEmail     String?   @unique
  realEmailVerified DateTime?
  
  // Optional: ENS name
  ensName       String?
  
  // Auth method
  authMethod    AuthMethod @default(WALLET)
  
  // Platform features
  credits       Int       @default(0)
  subscriptionTier String @default("free")
  
  // Multiple smart contract wallets
  wallets       Wallet[]
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum AuthMethod {
  WALLET    // Sign In With Ethereum (default)
  EMAIL     // Traditional (for legacy users)
  GOOGLE    // OAuth (optional)
}

model Wallet {
  id        String     @id @default(cuid())
  address   String     @unique
  type      WalletType
  userId    String
  user      User       @relation(fields: [userId], references: [id])
  createdAt DateTime   @default(now())
}

enum WalletType {
  EOA             // Externally Owned Account
  SMART_CONTRACT  // ERC-4337 Smart Wallet
}
```

### Email Service (Virtual Address Routing)

**Inbound:** Route emails sent to `address@unju.ai` to user's account

```typescript
// Email webhook handler
export async function handleInboundEmail(email: InboundEmail) {
  // Parse: 0x742d35...@unju.ai → 0x742d35...
  const address = email.to.split('@')[0].toLowerCase();
  
  const user = await db.user.findUnique({ 
    where: { address } 
  });
  
  if (user) {
    // Store in user's inbox
    await db.inbox.create({
      data: {
        userId: user.id,
        from: email.from,
        subject: email.subject,
        body: email.body,
        receivedAt: new Date()
      }
    });
    
    // Notify user (if connected to platform)
    if (user.notificationPreferences?.email) {
      await sendNotification(user, {
        type: 'EMAIL_RECEIVED',
        title: `Email from ${email.from}`,
        body: email.subject
      });
    }
  } else {
    // Unknown address - bounce
    await bounceEmail(email, 'Address not found');
  }
}
```

**Outbound:** Allow users to send email as `address@unju.ai`

```typescript
export async function sendEmailAsVirtualAddress(req: Request) {
  const { to, subject, body } = req.body;
  const { user } = req.session;
  
  // Send with DKIM signature
  await emailService.send({
    from: user.email, // address@unju.ai
    to,
    subject,
    body,
    headers: {
      'X-Unju-Address': user.address,
      'X-Unju-Verified': 'true'
    }
  });
}
```

### User Journeys

#### Journey 1: Pure Wallet (No Platform)

```
1. Download unju-wallet extension or CLI
2. Create wallet locally (no server, no signup)
3. Save recovery phrase
4. Fund wallet with USDC/ETH
5. Use with any dapp (OpenSea, Uniswap, etc.)
6. Trade on unju-perps (self-funded)

Identity: 0x742d35...f0bEb
Email: Not needed
Platform: Not connected
```

#### Journey 2: Wallet + Platform (Recommended)

```
1. Create wallet locally
2. Visit unju.ai
3. Click "Sign In With Ethereum"
4. Sign message with wallet
5. Access platform features:
   - Buy credits
   - Enable paymaster for gas-free trading
   - View trading history
   - Sync settings across devices
   
Identity: 0x742d35...f0bEb@unju.ai
Email: Virtual (auto-verified)
Platform: Connected
```

#### Journey 3: Add Real Email (Optional)

```
User wants actual email notifications:

1. Go to Settings → Notifications
2. Add real email: esper@gmail.com
3. Verify email (click link)
4. Set notification preferences
5. Receive emails at real address

Identity: 0x742d35...f0bEb@unju.ai
Real Email: esper@gmail.com (verified)
Platform: Connected
```

#### Journey 4: Legacy Email User Migration

```
Existing users with email-based accounts:

1. User logs in with email/password
2. Click "Connect Wallet"
3. Sign SIWE message
4. Wallet linked to account
5. Can now sign in either way:
   - Email/password OR
   - Sign In With Ethereum
   
Gradual migration to wallet-first.
```

### CLI Experience

```bash
# Install CLI
npm install -g unju-wallet

# Create wallet (fully offline)
$ unju-wallet create

🎉 Wallet Created!

Address:  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Identity: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb@unju.ai

⚠️  SAVE YOUR RECOVERY PHRASE:
witch collapse practice feed shame open despair creek road again ice least

Your keys never left this device.
No registration required.

# Optional: Connect to platform
$ unju-wallet connect

Opening browser for Sign In With Ethereum...

✅ Connected to unju.ai!

Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Credits: 0 (buy at https://unju.ai/credits)
Tier: free

# Check identity
$ unju-wallet whoami

Address:  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Identity: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb@unju.ai
ENS:      (not registered)
Platform: ✅ Connected
Credits:  0
```

### Browser Extension Experience

```typescript
// First launch - no signup screen!
const WelcomeScreen = () => (
  <div>
    <Logo />
    <h1>Welcome to Unju Wallet</h1>
    <p>Your wallet, your identity. No email required.</p>
    
    <Button primary onClick={createWallet}>
      Create New Wallet
    </Button>
    
    <Button secondary onClick={importWallet}>
      Import Existing Wallet
    </Button>
    
    <InfoBox>
      💡 Your wallet address is your identity.
      No server signup needed.
    </InfoBox>
  </div>
);

// After wallet creation
const DashboardScreen = () => (
  <div>
    <WalletHeader>
      <Address>0x742d...f0bEb</Address>
      <CopyButton />
    </WalletHeader>
    
    {!platformConnected && (
      <ConnectBanner>
        <h3>Optional: Connect to unju.ai</h3>
        <p>Access credits, trading history, and premium features</p>
        <Button onClick={connectPlatform}>
          Sign In With Ethereum
        </Button>
      </ConnectBanner>
    )}
    
    <Balances>
      <Token symbol="ETH" balance={balance.eth} />
      <Token symbol="USDC" balance={balance.usdc} />
    </Balances>
    
    <Actions>
      <ActionButton icon="↑" label="Send" />
      <ActionButton icon="↓" label="Receive" />
      <ActionButton icon="⇄" label="Swap" />
    </Actions>
  </div>
);
```

## Migration Strategy

### Phase 1: New Users (Immediate)
- All new users create wallet-first
- No email required for wallet creation
- SIWE for platform features

### Phase 2: Existing Email Users (Gradual)
- Prompt to connect wallet on login
- Show benefits (gas-free trading, better security)
- Allow both auth methods during transition
- Eventually deprecate email-only accounts

### Phase 3: Full Wallet-First (6 months)
- Email auth becomes "legacy mode"
- All features optimized for wallet-first
- Email only used for notifications

## Security Considerations

### Key Management
- Keys generated client-side (never touch server)
- Encrypted with user password (PBKDF2 + AES-256-GCM)
- Stored in browser local storage (encrypted)
- Recovery phrase shown once, user must save

### SIWE Security
- Nonce prevents replay attacks
- Signature proves ownership without revealing key
- Domain binding prevents phishing
- Timestamp prevents message reuse

### Email Privacy
- Virtual address doesn't leak real identity
- Optional real email for those who want it
- User controls which emails go where

### Account Recovery
- Recovery phrase (BIP-39 mnemonic)
- Social recovery (guardians, M-of-N)
- Hardware wallet support
- No "forgot password" needed (self-custody)

## Benefits

### For Users
1. **Privacy**: No KYC, no email, no phone number
2. **Sovereignty**: You own your keys
3. **Simplicity**: One identity for all Web3
4. **Portability**: Take your wallet anywhere
5. **Security**: Cryptographic proof > passwords

### For unju
1. **Compliance**: No custody = no custodial regulations
2. **Scalability**: No email verification delays
3. **Trust**: Open source + self-custody
4. **Ecosystem**: Works with all EVM chains
5. **Differentiation**: First wallet-first AI agent platform

### For Ecosystem
1. **Standardization**: SIWE is EIP-4361 standard
2. **Interoperability**: Works with all dapps
3. **Composability**: Other services can adopt pattern
4. **Decentralization**: No single point of failure

## Alternatives Considered

### Alternative 1: Email-First (Current Web2 Pattern)

**Pros:**
- Familiar to users
- Easy password reset
- Standard OAuth flows

**Cons:**
- Centralizes identity
- Requires email verification
- Privacy leaks
- Against Web3 ethos

**Rejected because:** Not aligned with decentralization goals.

### Alternative 2: Phone Number as Identity

**Pros:**
- Unique per person
- 2FA built-in
- Global reach

**Cons:**
- KYC implications
- Privacy worse than email
- SMS costs
- Not Web3 native

**Rejected because:** Even worse privacy trade-offs.

### Alternative 3: DID (Decentralized Identifiers)

**Pros:**
- W3C standard
- Fully decentralized
- Rich metadata

**Cons:**
- Complex to implement
- Poor ecosystem support
- Overkill for our use case
- Hard to explain to users

**Rejected because:** Ethereum addresses already serve as DIDs.

### Alternative 4: OAuth Only (Google, Twitter, etc.)

**Pros:**
- Zero friction signup
- Familiar to users
- Social graph

**Cons:**
- Custodial keys
- Censorship risk
- Platform lock-in
- Not self-sovereign

**Rejected because:** Against non-custodial principles.

## Open Questions

1. **ENS Integration**: Should we auto-register ENS names for users?
   - **Lean**: No, let users register if they want
   - **Rich**: Yes, subsidize .unju.eth subdomains

2. **Email Deliverability**: Will `address@unju.ai` emails be trusted?
   - **Risk**: Some services may flag as spam
   - **Mitigation**: DKIM signing, SPF records, gradual rollout

3. **Multi-Chain**: Should virtual email include chain info?
   - **Current**: `0x742d...@unju.ai` (chain agnostic)
   - **Alternative**: `0x742d...@arbitrum.unju.ai` (chain specific)

4. **Legacy Migration**: Force wallet connection or allow email-only?
   - **Aggressive**: Require wallet within 6 months
   - **Gradual**: Support both indefinitely, encourage wallet

## Success Metrics

### Adoption
- 80% of new users create wallet-first (vs email)
- 50% of legacy users connect wallet within 3 months
- Zero support tickets about "forgot password"

### UX
- <30 seconds from landing page to wallet creation
- <5 clicks to create wallet and start trading
- >90% complete wallet creation (vs abandon)

### Security
- Zero key leaks (keys never hit server)
- 100% SIWE verification success rate
- <0.1% account recovery requests

### Platform
- 60% of wallet-first users connect to platform
- 40% of wallet-first users buy credits
- 20% of wallet-first users use paymaster

## Implementation Plan

### Week 1: Backend
- [ ] SIWE endpoint (`POST /auth/siwe`)
- [ ] Virtual email system (inbox, routing)
- [ ] User schema updates (address, authMethod)
- [ ] Session management (JWT with address)

### Week 2: Wallet Core
- [ ] Local wallet creation (Rust)
- [ ] SIWE message generation
- [ ] SIWE signature verification
- [ ] Recovery phrase UI

### Week 3: Extension
- [ ] No-signup welcome screen
- [ ] Wallet creation flow
- [ ] SIWE integration
- [ ] Platform connection banner

### Week 4: Testing & Launch
- [ ] E2E tests (create → connect → trade)
- [ ] Security audit
- [ ] Documentation
- [ ] Public launch

## References

- [EIP-4361: Sign In With Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
- [SIWE Implementation](https://github.com/spruceid/siwe)
- [ENS Documentation](https://docs.ens.domains/)
- [BIP-39: Mnemonic Code](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- [Rainbow Wallet](https://rainbow.me/) (inspiration for UX)
- [Frame Wallet](https://frame.sh/) (inspiration for sovereignty)

## Changelog

- **2026-02-25**: Initial draft (Green Tara)
