# Expo Mobile App - Citizen Verification Implementation Guide

## Overview
This guide provides a complete implementation plan for integrating the HomeTown DAO Citizen Verification System into your Expo mobile app. The system includes QR code scanning, encrypted evidence submission, request approval, and NFT management.

---

## Table of Contents
1. [Smart Contract Information](#smart-contract-information)
2. [Architecture Overview](#architecture-overview)
3. [Required Dependencies](#required-dependencies)
4. [Core Features to Implement](#core-features-to-implement)
5. [File Structure](#file-structure)
6. [Implementation Steps](#implementation-steps)
7. [Code References](#code-references)
8. [API Endpoints](#api-endpoints)
9. [Testing Checklist](#testing-checklist)

---

## Smart Contract Information

### Deployed Contracts (Base Mainnet)

```typescript
export const VERIFICATION_CONTRACTS = {
  attesterNFT: "0xDC9e7C03d354F78475E8bC35a166A784319C56ae",
  citizenNFT: "0xB7B767f472200C3240bd5cab33df801Bbe1519D5",
  governor: "0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A",
};
```

### Smart Contract Files
- **AttesterNFT**: `/governor-contract/contracts/verification-system/AttesterNFT.sol`
- **CitizenNFT**: `/governor-contract/contracts/verification-system/CitizenNFT.sol`

### Key Contract Functions

**CitizenNFT (Primary):**
- `createAttestationRequest(string evidenceURI)` - Create new citizen request
- `approveRequest(uint256 requestId, bool signAsAttester)` - Approve a request
- `rejectRequest(uint256 requestId)` - Reject a request
- `getRequest(uint256 requestId)` - Get request details
- `hasCitizenNFT(address account)` - Check if address has citizen NFT
- `delegate(address delegatee)` - Delegate voting power

**AttesterNFT:**
- `createAttestationRequest(string evidenceURI)` - Create attester request
- `approveRequest(uint256 requestId)` - Approve request (3 signatures required)
- `rejectRequest(uint256 requestId)` - Reject request
- `getRequest(uint256 requestId)` - Get request details
- `hasAttesterNFT(address account)` - Check if address has attester NFT

### Signature Requirements
- **Citizen Attestation**: 1 Attester + 1 Citizen (minimum 2 different people)
- **Attester Attestation**: 2 Attesters
- **Citizen Revocation**: 1 Attester
- **Attester Revocation**: 2 Attesters

---

## Architecture Overview

### Data Flow

```
1. Request Creation
   ↓
   User fills form → Encrypt data → Store in Supabase → Submit to blockchain
   ↓
   Generate QR code with request URL

2. Request Approval
   ↓
   Scanner app → Camera QR scan → Open request details → Decrypt (if owner)
   ↓
   Approve/Reject → Transaction → NFT minted (if threshold met)

3. NFT Management
   ↓
   View NFTs → Delegate voting power → Participate in governance
```

### Privacy Architecture
- **Personal Data (name, address)**: Encrypted with TweetNaCl (XSalsa20-Poly1305)
- **Public Metadata (reason, timestamp)**: Stored in plaintext
- **Encryption Key**: Derived from EIP-712 typed data signature
- **Storage**: Supabase (encrypted blobs + metadata)
- **Blockchain**: Only stores Supabase reference URI (no personal data on-chain)

---

## Required Dependencies

### NPM Packages

```bash
# Core blockchain
npm install thirdweb

# Encryption
npm install tweetnacl tweetnacl-util
npm install @types/tweetnacl-util --save-dev

# QR Code
npm install react-native-qrcode-svg
npm install expo-camera
npm install expo-barcode-scanner

# Utilities
npm install react-native-svg
```

### Expo Configuration

Add to `app.json`:
```json
{
  "expo": {
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to scan verification QR codes."
        }
      ]
    ]
  }
}
```

---

## Core Features to Implement

### 1. QR Code Scanner
- Camera-based QR code scanning
- Parse verification request URLs
- Navigate to request details

### 2. Request Creation
- Forms for Citizen and Attester requests
- Client-side encryption of personal data
- Upload to Supabase
- Submit transaction to blockchain
- Generate and display QR code

### 3. Request Details/Approval
- Fetch request from blockchain
- Fetch encrypted evidence from Supabase
- Decrypt if user is owner
- Show public metadata to approvers
- Approve/Reject buttons with role selection (for dual NFT holders)

### 4. Request List
- Display all pending/approved/executed requests
- Filter by status and type
- Show signature progress

### 5. Profile/NFT Management
- Display Citizen/Attester NFT status
- Delegate voting power button

---

## File Structure

Recommended structure for your Expo app:

```
expo-app/
├── lib/
│   ├── contracts/
│   │   └── verification-contracts.ts    # Contract addresses, ABIs, instances
│   ├── crypto/
│   │   └── encryption.ts                # Encryption utilities
│   ├── api/
│   │   └── evidence.ts                  # API calls to your backend
│   └── utils/
│       └── verification-utils.ts        # Helper functions
├── hooks/
│   ├── useVerificationStatus.ts         # Check NFT ownership
│   └── useCamera.ts                     # Camera permissions
├── components/
│   ├── verification/
│   │   ├── QRScanner.tsx               # QR code scanner
│   │   ├── RequestCard.tsx             # Request list item
│   │   ├── StatusBadge.tsx             # Status indicator
│   │   └── SignatureProgress.tsx       # Progress bar
│   └── forms/
│       ├── CitizenRequestForm.tsx      # Citizen request form
│       └── AttesterRequestForm.tsx     # Attester request form
├── screens/
│   ├── ScannerScreen.tsx               # QR scanner screen
│   ├── RequestDetailsScreen.tsx        # View/approve request
│   ├── CreateRequestScreen.tsx         # Create new request
│   ├── RequestListScreen.tsx           # List all requests
│   └── ProfileScreen.tsx               # User profile/NFTs
└── types/
    └── verification.ts                  # TypeScript types
```

---

## Implementation Steps

### Step 1: Copy Core Files

Copy these files from the web app to your Expo app (with React Native adjustments):

#### 1.1 Contract Configuration
**Source**: `/dao-app/src/lib/verification-contracts.ts`
**Destination**: `lib/contracts/verification-contracts.ts`
**Changes Needed**: None (thirdweb SDK v5 works in React Native)

#### 1.2 TypeScript Types
**Source**: `/dao-app/src/types/verification.ts`
**Destination**: `types/verification.ts`
**Changes Needed**: None

#### 1.3 Encryption Library
**Source**: `/dao-app/src/lib/crypto/encryption.ts`
**Destination**: `lib/crypto/encryption.ts`
**Changes Needed**:
- Replace `crypto.subtle` with React Native compatible crypto
- Use `expo-random` for random bytes if needed
- TweetNaCl works in React Native without changes

#### 1.4 Verification Utilities
**Source**: `/dao-app/src/lib/verification-utils.ts`
**Destination**: `lib/utils/verification-utils.ts`
**Changes Needed**: None

#### 1.5 Verification Status Hook
**Source**: `/dao-app/src/hooks/useVerificationStatus.ts`
**Destination**: `hooks/useVerificationStatus.ts`
**Changes Needed**: None (thirdweb hooks work in React Native)

---

### Step 2: Implement QR Code Scanner

**Reference**: Web app uses `qrcode.react` for generation, you need scanning

Create `components/verification/QRScanner.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { Camera } from 'expo-camera';
import { BarCodeScanner } from 'expo-barcode-scanner';

interface QRScannerProps {
  onScan: (url: string) => void;
  onCancel: () => void;
}

export function QRScanner({ onScan, onCancel }: QRScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    // Parse verification URL
    if (data.includes('roebel.app/verifizierung/nachweis/')) {
      onScan(data);
    }
  };

  if (hasPermission === null) {
    return <Text>Requesting camera permission...</Text>;
  }

  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFillObject}
        onBarCodeScanned={handleBarCodeScanned}
        barCodeScannerSettings={{
          barCodeTypes: [BarCodeScanner.Constants.BarCodeType.qr],
        }}
      />
      <Button title="Cancel" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
});
```

---

### Step 3: Create Request Forms

#### 3.1 Citizen Request Form

**Reference**: `/dao-app/src/app/verifizierung/buerger-beantragen/page.tsx`

Key steps:
1. Form inputs for name, address, reason
2. Encrypt personal data with `deriveEncryptionKey()` + `encryptEvidence()`
3. Store in Supabase via API endpoint
4. Submit transaction to `citizenNFT.createAttestationRequest(evidenceURI)`
5. Show QR code with `react-native-qrcode-svg`

```typescript
// Encryption (lines 98-118 in reference)
const { key, timestamp } = await deriveEncryptionKey(account);
const encrypted = encryptEvidence(
  { name: formData.name, address: formData.address },
  key
);

const evidence = {
  encrypted,
  metadata: {
    reason: formData.reason,
    timestamp: new Date().toISOString(),
    type: 'citizen_attestation',
    requester: account.address,
    encrypted: true,
    encryptionTimestamp: timestamp,
  },
};

// Store in Supabase (lines 123-133)
const storeResponse = await fetch('/api/evidence/store', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ evidence, contract: 'citizen' }),
});

const { evidenceId } = await storeResponse.json();
const evidenceURI = `supabase://${evidenceId}`;

// Submit to blockchain (lines 138-151)
const transaction = prepareContractCall({
  contract: citizenNFTContract,
  method: "function createAttestationRequest(string evidenceURI) returns (uint256)",
  params: [evidenceURI],
});

sendTransaction(transaction, { gasless: true });
```

#### 3.2 Attester Request Form

**Reference**: `/dao-app/src/app/verifizierung/bescheiniger-beantragen/page.tsx`

Same flow as Citizen, but uses `attesterNFTContract` instead.

---

### Step 4: Request Details/Approval Screen

**Reference**: `/dao-app/src/app/verifizierung/nachweis/[id]/page.tsx`

Key features:
1. Fetch request from blockchain (`getRequest()`)
2. Fetch encrypted evidence from Supabase
3. Check if user is owner (can decrypt)
4. Decrypt if owner
5. Show approve/reject buttons

```typescript
// Fetch request (lines 87-137)
const result = await readContract({
  contract: citizenNFTContract,
  method: "function getRequest(uint256 requestId) view returns (...)",
  params: [BigInt(requestId)],
});

// Fetch evidence (lines 139-178)
const response = await fetch(`/api/evidence/${requestId}?contract=citizen`);
const evidenceData = await response.json();

// Check ownership and decrypt (lines 227-280)
const isOwner = account?.address?.toLowerCase() === request.requester.toLowerCase();

if (isOwner && isEvidenceEncrypted && evidence.metadata?.encryptionTimestamp) {
  try {
    const { key } = await deriveEncryptionKey(account, evidence.metadata.encryptionTimestamp);
    const decrypted = decryptEvidence(evidence.encrypted, key);
    setDecryptedData(decrypted);
  } catch (error) {
    setDecryptionError(error.message);
  }
}

// Approve request (lines 282-336)
const transaction = prepareContractCall({
  contract: citizenNFTContract,
  method: "function approveRequest(uint256 requestId, bool signAsAttester)",
  params: [BigInt(requestId), signAsAttester],
});

sendTransaction(transaction, { gasless: true });
```

---

### Step 5: Request List Screen

**Reference**: `/dao-app/src/app/verifizierung/antraege/page.tsx`

Display all requests with:
- Status badges (Pending, Approved, Executed, Rejected)
- Signature progress bars
- Filter by status
- Click to navigate to details

---

### Step 6: Backend API Endpoints

You need to implement these API endpoints (serverless functions or Express):

#### 6.1 Store Evidence
**Reference**: `/dao-app/src/app/api/evidence/store/route.ts`

```typescript
POST /api/evidence/store

Body: {
  evidence: EncryptedEvidence,
  contract: "citizen" | "attester"
}

Response: {
  success: true,
  evidenceId: "uuid"
}
```

Stores encrypted evidence in Supabase and returns ID.

#### 6.2 Get Evidence
**Reference**: `/dao-app/src/app/api/evidence/[id]/route.ts`

```typescript
GET /api/evidence/:id?contract=citizen

Response: {
  evidence: EncryptedEvidence,
  requestId: string,
  contract: string
}
```

Retrieves encrypted evidence from Supabase.

#### 6.3 List Evidence
**Reference**: `/dao-app/src/app/api/evidence/list/route.ts`

```typescript
GET /api/evidence/list?contract=citizen

Response: {
  evidence: EncryptedEvidence[],
  count: number
}
```

Lists all evidence for debugging/admin purposes.

---

## Code References

### Smart Contracts
| File | Path |
|------|------|
| CitizenNFT.sol | `/governor-contract/contracts/verification-system/CitizenNFT.sol` |
| AttesterNFT.sol | `/governor-contract/contracts/verification-system/AttesterNFT.sol` |

### Frontend (Web App - Adapt for React Native)
| Component | Path | Purpose |
|-----------|------|---------|
| Contract Config | `/dao-app/src/lib/verification-contracts.ts` | Contract addresses, ABIs, instances |
| Types | `/dao-app/src/types/verification.ts` | TypeScript interfaces |
| Encryption | `/dao-app/src/lib/crypto/encryption.ts` | TweetNaCl encryption utilities |
| Utils | `/dao-app/src/lib/verification-utils.ts` | Helper functions |
| Verification Hook | `/dao-app/src/hooks/useVerificationStatus.ts` | Check NFT ownership |
| Request Details | `/dao-app/src/app/verifizierung/nachweis/[id]/page.tsx` | View/approve requests (470 lines) |
| Citizen Form | `/dao-app/src/app/verifizierung/buerger-beantragen/page.tsx` | Create citizen request |
| Attester Form | `/dao-app/src/app/verifizierung/bescheiniger-beantragen/page.tsx` | Create attester request |
| Request List | `/dao-app/src/app/verifizierung/antraege/page.tsx` | List all requests |
| Profile Page | `/dao-app/src/app/profile/page.tsx` | User NFTs and delegation |

### Backend (API Routes)
| Endpoint | Path | Purpose |
|----------|------|---------|
| Store Evidence | `/dao-app/src/app/api/evidence/store/route.ts` | Save encrypted evidence |
| Get Evidence | `/dao-app/src/app/api/evidence/[id]/route.ts` | Retrieve evidence |
| List Evidence | `/dao-app/src/app/api/evidence/list/route.ts` | List all evidence |

### Components (Adapt for React Native)
| Component | Path | Purpose |
|-----------|------|---------|
| StatusBadge | `/dao-app/src/components/verification/StatusBadge.tsx` | Status indicator |
| RequestCard | `/dao-app/src/components/verification/RequestCard.tsx` | Request list item |

---

## API Endpoints

### Your Backend Needs

You'll need to host these endpoints (use Vercel, AWS Lambda, or your existing backend):

```
POST   /api/evidence/store       - Store encrypted evidence in Supabase
GET    /api/evidence/:id         - Retrieve evidence by ID
GET    /api/evidence/list        - List all evidence (optional, for admin)
```

### Supabase Schema

Create a table `evidence`:

```sql
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id TEXT NOT NULL,
  contract TEXT NOT NULL CHECK (contract IN ('citizen', 'attester')),
  encrypted JSONB NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(request_id, contract)
);

CREATE INDEX idx_evidence_request ON evidence(request_id, contract);
```

---

## Testing Checklist

### Phase 1: Contract Integration
- [ ] Connect to deployed contracts on Base
- [ ] Read request data from blockchain
- [ ] Check NFT ownership (hasAttesterNFT, hasCitizenNFT)
- [ ] Submit test transaction (approve/reject)

### Phase 2: Encryption
- [ ] Generate encryption key with EIP-712 signing
- [ ] Encrypt test data
- [ ] Decrypt test data (same wallet)
- [ ] Verify decryption fails with different wallet

### Phase 3: QR Code Flow
- [ ] Generate QR code with request URL
- [ ] Scan QR code with camera
- [ ] Parse URL and navigate to request details

### Phase 4: Request Creation
- [ ] Fill form with test data
- [ ] Encrypt personal data
- [ ] Store in Supabase via API
- [ ] Submit transaction to blockchain
- [ ] Verify request appears in list

### Phase 5: Request Approval
- [ ] Open request from QR scan
- [ ] Decrypt as owner
- [ ] Approve as Attester/Citizen
- [ ] Verify signature count increments
- [ ] Verify NFT mints when threshold reached

### Phase 6: Edge Cases
- [ ] Handle rejected requests
- [ ] Handle executed requests (should show NFT minted)
- [ ] Handle dual NFT holders (role selection)
- [ ] Handle network errors gracefully
- [ ] Handle camera permissions denied

---

## Key Differences from Web App

### React Native Adjustments Needed

1. **Navigation**: Use React Navigation instead of Next.js router
   ```typescript
   // Web
   router.push('/verifizierung/nachweis/123')

   // React Native
   navigation.navigate('RequestDetails', { requestId: '123' })
   ```

2. **QR Code**: Use camera for scanning instead of generating links
   ```typescript
   // Web: Generate QR
   <QRCodeSVG value={url} />

   // Mobile: Scan QR
   <Camera onBarCodeScanned={handleScan} />
   ```

3. **Styling**: Use StyleSheet instead of Tailwind CSS
   ```typescript
   // Web
   <div className="bg-white border border-gray-200 rounded-lg p-4">

   // React Native
   <View style={styles.card}>

   const styles = StyleSheet.create({
     card: {
       backgroundColor: '#fff',
       borderColor: '#e5e7eb',
       borderWidth: 1,
       borderRadius: 8,
       padding: 16,
     },
   });
   ```

4. **Crypto**: May need polyfills for `crypto.subtle`
   ```typescript
   // Install polyfill if needed
   npm install react-native-get-random-values

   // Import at top of app
   import 'react-native-get-random-values';
   ```

5. **Forms**: Use React Native form components
   ```typescript
   // Web
   <input type="text" />

   // React Native
   <TextInput />
   ```

---

## Environment Variables

Create `.env`:

```bash
# Thirdweb
EXPO_PUBLIC_THIRDWEB_CLIENT_ID=your_client_id

# Your Backend API
EXPO_PUBLIC_API_URL=https://your-api.com

# Supabase (if using direct connection)
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## Complete Implementation Checklist

### Setup
- [ ] Install all dependencies
- [ ] Configure Expo camera plugin
- [ ] Set up environment variables
- [ ] Update contract addresses if needed

### Core Libraries
- [ ] Copy `verification-contracts.ts`
- [ ] Copy `verification.ts` types
- [ ] Copy `encryption.ts` (adjust for React Native)
- [ ] Copy `verification-utils.ts`
- [ ] Copy `useVerificationStatus.ts` hook

### Components
- [ ] Create QR Scanner component
- [ ] Create Request Card component
- [ ] Create Status Badge component
- [ ] Create Citizen Request Form
- [ ] Create Attester Request Form
- [ ] Create Signature Progress component

### Screens
- [ ] Scanner Screen (camera + QR scanning)
- [ ] Request Details Screen (view + approve/reject)
- [ ] Create Request Screen (form + encryption + submit)
- [ ] Request List Screen (filter + status)
- [ ] Profile Screen (NFTs + delegation)

### Backend
- [ ] Implement `/api/evidence/store`
- [ ] Implement `/api/evidence/:id`
- [ ] Implement `/api/evidence/list` (optional)
- [ ] Set up Supabase table

### Testing
- [ ] Test encryption roundtrip
- [ ] Test QR code scanning
- [ ] Test request creation
- [ ] Test request approval
- [ ] Test NFT minting
- [ ] Test edge cases

---

## Support & Resources

### Documentation
- **Thirdweb React Native**: https://portal.thirdweb.com/react-native
- **TweetNaCl**: https://github.com/dchest/tweetnacl-js
- **Expo Camera**: https://docs.expo.dev/versions/latest/sdk/camera/
- **Base Scan**: https://basescan.org/

### Contract Verification
View deployed contracts on BaseScan:
- Citizen NFT: https://basescan.org/address/0xB7B767f472200C3240bd5cab33df801Bbe1519D5
- Attester NFT: https://basescan.org/address/0xDC9e7C03d354F78475E8bC35a166A784319C56ae

### Example URLs
- Production domain: `https://roebel.app`
- Request details URL format: `https://roebel.app/verifizierung/nachweis/{requestId}?contract={citizen|attester}`

---

## Quick Start Commands

```bash
# 1. Install dependencies
npm install thirdweb tweetnacl tweetnacl-util react-native-qrcode-svg expo-camera expo-barcode-scanner

# 2. Configure camera permissions
# Edit app.json and add expo-camera plugin

# 3. Run development server
npx expo start

# 4. Test on device (required for camera)
# Scan QR code in terminal with Expo Go app
```

---

## Summary

This guide provides everything you need to implement the full citizen verification system in your Expo app:

1. **Smart Contracts**: Ready to use on Base Mainnet
2. **Encryption**: Copy encryption library, works in React Native with minimal adjustments
3. **QR Scanning**: Use expo-camera for scanning verification requests
4. **Forms**: Adapt web forms to React Native components
5. **Approval Flow**: Use thirdweb hooks to read/write contract data
6. **Backend**: Implement 3 simple API endpoints for Supabase storage

The core logic from the web app is fully reusable. Main changes are UI framework (React Native vs React), QR scanning (camera vs generation), and styling (StyleSheet vs Tailwind).

All file paths are provided as clickable references - just copy the code and adapt the UI layer for mobile!
