# Citizen Verification Implementation Status

## ✅ Completed

### 1. Database Schema
- ✅ `supabase-citizen-verification.sql` - Complete SQL schema
  - Added verification fields to users table
  - Created phone_verification_sessions table
  - Created verification_audit_log table
  - Added PostgreSQL functions for verification flow
  - Unique constraints (one phone per wallet)

### 2. TypeScript Types
- ✅ Updated `src/lib/user-types.ts`
  - Added citizen verification fields to User interface
  - Created PhoneVerificationSession interface
  - Created VerificationAuditLog interface
  - Created PendingVerification interface
  - Added helper functions for verification status
  - Added phone number formatting/validation functions

### 3. Components
- ✅ `src/components/auth/PhoneVerificationForm.tsx`
  - Two-step form (phone → code)
  - SMS OTP input with auto-formatting
  - Countdown timer for resend
  - Error handling and validation

---

## 🔄 In Progress / TODO

### 4. Wallet Connection Component
- ⏳ `src/components/auth/WalletConnectionStep.tsx` - NEEDED
  - Show thirdweb social login after phone verified
  - Connect wallet (Google/Apple/Facebook/Email)
  - Link wallet to verified phone number
  - Handle linking errors

### 5. Login Page
- ⏳ `src/app/login/page.tsx` - NEEDED
  - Two-column layout (50/50)
  - Left: Phone verification → Wallet connection
  - Right: Hometown image placeholder
  - Progress indicator
  - Responsive design

### 6. API Endpoints

#### Phone Verification APIs
- ⏳ `src/app/api/auth/verify-phone/send/route.ts` - NEEDED
  - Generate 6-digit code
  - Send SMS via Supabase Auth (Twilio)
  - Create phone_verification_session
  - Rate limiting

- ⏳ `src/app/api/auth/verify-phone/verify/route.ts` - NEEDED
  - Verify OTP code
  - Mark session as verified
  - Return success/failure

#### Wallet Linking API
- ⏳ `src/app/api/auth/link-wallet/route.ts` - NEEDED
  - Link wallet address to verified phone
  - Create/update user in database
  - Check for existing phone/wallet conflicts
  - Return user record

#### Admin Verification API
- ⏳ `src/app/api/admin/verify-citizen/route.ts` - NEEDED
  - Approve/reject citizen verification
  - Update is_verified_citizen flag
  - Log to audit table
  - Send notification email

- ⏳ `src/app/api/admin/pending-verifications/route.ts` - NEEDED
  - Get list of pending verifications
  - For admin dashboard

### 7. Admin Dashboard
- ⏳ `src/app/admin/verify-citizens/page.tsx` - NEEDED
  - List pending verifications
  - Show phone number + wallet address
  - Approve/Reject buttons
  - Add notes field
  - Search and filter

### 8. Mint Page Guard
- ⏳ Update `src/app/mint/page.tsx` - NEEDED
  - Check `user.is_verified_citizen`
  - Show "Pending Verification" if not verified
  - Show approval message if verified
  - Explain verification process

### 9. Header/Navigation
- ⏳ Update `src/components/layout/Header.tsx` - NEEDED
  - Add "Login" link when not connected
  - Remove/simplify ConnectButton (since login page handles auth)
  - Show user profile when logged in

---

## 📋 Implementation Steps Remaining

### Step 1: Complete API Routes (Priority)
```
1. Create /api/auth/verify-phone/send
   - Generate random 6-digit code
   - Call Supabase Auth to send SMS
   - Store in phone_verification_sessions table

2. Create /api/auth/verify-phone/verify
   - Check code matches session
   - Verify not expired
   - Mark as verified

3. Create /api/auth/link-wallet
   - Take session_id + wallet_address
   - Call Postgres function link_wallet_to_phone
   - Return user record
```

### Step 2: Create Wallet Connection Component
```
- Show social login options (Google/Apple/Facebook/Email)
- Use thirdweb ConnectButton with custom config
- After wallet connected, call /api/auth/link-wallet
- Handle success → redirect to dashboard
- Handle errors → show message
```

### Step 3: Create Login Page
```
- Two-column layout
- Left: Step 1 (PhoneVerificationForm) → Step 2 (WalletConnectionStep)
- Right: Image placeholder
- Progress indicator (Step 1 of 2, Step 2 of 2)
- Redirect to dashboard after complete
```

### Step 4: Create Admin Dashboard
```
- Fetch pending verifications
- Display table with phone/wallet/date
- Approve button → calls /api/admin/verify-citizen
- Reject button → same API with different action
- Notes textarea
- Success/error messages
```

### Step 5: Update Mint Page
```
- Add check at top of page:
  if (!user.is_verified_citizen) {
    return <PendingVerificationMessage />
  }
- Show status badge
- Explain approval process
- Link to contact support
```

---

## 🔐 Security Checklist

- ✅ Unique constraints on phone_number and wallet_address
- ✅ OTP expiry (5 minutes)
- ⏳ Rate limiting on SMS sending (3 per hour per phone)
- ⏳ Admin authentication for approve/reject
- ⏳ Audit logging for all verifications
- ⏳ Email notifications on approval
- ⏳ Block disposable phone numbers

---

## 🧪 Testing Plan

### Manual Testing Steps
```
1. Visit /login page
2. Enter phone number (+1234567890)
3. Receive SMS with 6-digit code
4. Enter code → Phone verified ✓
5. Click "Connect Wallet"
6. Choose Google/Apple/Facebook
7. Authenticate via social login
8. Wallet linked to phone ✓
9. Redirect to dashboard
10. Navigate to /mint
11. See "Pending Verification" message
12. Admin approves via /admin/verify-citizens
13. User refreshes /mint
14. Can now mint NFT ✓
```

### API Testing
```
# Send OTP
curl -X POST http://localhost:3000/api/auth/verify-phone/send \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+1234567890"}'

# Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-phone/verify \
  -H "Content-Type: application/json" \
  -d '{"session_id": "uuid", "verification_code": "123456"}'

# Link Wallet
curl -X POST http://localhost:3000/api/auth/link-wallet \
  -H "Content-Type: application/json" \
  -d '{"session_id": "uuid", "wallet_address": "0x..."}'

# Approve Citizen
curl -X POST http://localhost:3000/api/admin/verify-citizen \
  -H "Content-Type: application/json" \
  -d '{"user_id": "uuid", "action": "approved", "admin_address": "0x..."}'
```

---

## 📊 Current Progress: ~40%

**Completed:**
- Database schema ✅
- TypeScript types ✅
- Phone verification UI component ✅

**Remaining:**
- API routes (4-5 endpoints)
- Wallet connection component
- Login page
- Admin dashboard
- Mint page guard

**Estimated Time:** 2-3 hours more work

---

## 🚀 Next Steps

**Immediate priority:**
1. Create phone verification API routes (send + verify)
2. Create wallet linking API route
3. Create WalletConnectionStep component
4. Create login page with two-column layout
5. Test end-to-end flow

**After core flow works:**
6. Create admin dashboard
7. Create admin verification API
8. Update mint page guard
9. Add email notifications
10. Add rate limiting

---

## 💡 Key Design Decisions

### Why Phone First?
- Ensures phone is verified before wallet created
- Prevents fake wallets without valid phone numbers
- Allows admin to verify against town records

### Why Separate Tables?
- `phone_verification_sessions` - Temporary, expires after 5 min
- `users` - Permanent, stores verified phone-wallet pairs
- `verification_audit_log` - Immutable history of all approvals

### Why Manual Approval?
- Town phone book may not have API
- Allows human verification of edge cases
- Prevents automated abuse
- Builds trust in community

### Why Social Login for Wallet?
- Easy for non-crypto users
- No seed phrases to manage
- Familiar OAuth flow
- thirdweb handles wallet creation

---

## 🎯 Success Criteria

✅ User can verify phone number via SMS
✅ User can create wallet via social login
✅ Wallet is linked to verified phone
✅ Admin can see pending verifications
✅ Admin can approve/reject citizens
✅ Only verified citizens can mint NFT
✅ All actions logged in audit trail
✅ Clear error messages at each step
✅ Mobile-responsive design

---

## 📝 Notes

- Currently using Supabase Auth with Twilio for SMS
- You've already enabled phone verification in Supabase dashboard
- thirdweb client ID already configured
- Base chain already set up for NFT contract

**Key Files to Create Next:**
1. `src/app/api/auth/verify-phone/send/route.ts`
2. `src/app/api/auth/verify-phone/verify/route.ts`
3. `src/app/api/auth/link-wallet/route.ts`
4. `src/components/auth/WalletConnectionStep.tsx`
5. `src/app/login/page.tsx`

Would you like me to continue implementing these files?
