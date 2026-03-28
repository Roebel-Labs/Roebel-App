# Phone Authentication & User Profiles - Setup Guide

## 🎉 Implementation Complete!

This guide will help you set up phone authentication, user profiles, and NFT status display for HomeTown DAO.

---

## 📋 What's Been Implemented

✅ Phone-only authentication via thirdweb in-app wallets
✅ User profiles with optional username and profile picture
✅ Supabase users table with phone numbers and wallet addresses
✅ Profile page displaying Citizen Membership NFT status
✅ Real-time NFT balance and delegation status
✅ Profile picture upload with Supabase Storage
✅ Complete CRUD operations for user profiles

---

## 🚀 Setup Steps

### 1. Run SQL Schema in Supabase

Open your Supabase SQL Editor and run the SQL file:

```bash
supabase-users-schema.sql
```

This will:
- Create the `users` table with all fields
- Add indexes for performance
- Set up Row Level Security (RLS) policies
- Create storage bucket for profile pictures
- Add `blockchain_proposal_id` column to proposals table

**Verify it worked:**
```sql
SELECT * FROM information_schema.tables WHERE table_name = 'users';
SELECT * FROM storage.buckets WHERE name = 'profile-pictures';
```

---

### 2. Configure Thirdweb In-App Wallets

1. Go to [thirdweb Dashboard](https://thirdweb.com/dashboard)
2. Navigate to your project settings
3. Enable **In-App Wallets**
4. Under **Auth Options**, enable **Phone Authentication**
5. No additional API keys needed - thirdweb handles OTP sending

**Your `.env.local` should already have:**
```bash
NEXT_PUBLIC_TEMPLATE_CLIENT_ID=your_thirdweb_client_id
```

---

### 3. Verify Supabase Storage

In Supabase Dashboard:

1. Go to **Storage** section
2. Verify `profile-pictures` bucket exists
3. Check bucket is **public** (for viewing uploaded images)
4. Policies should be automatically created by SQL script

If bucket doesn't exist, create it manually:
- Bucket name: `profile-pictures`
- Public: Yes
- File size limit: 2MB (recommended)

---

### 4. Test the Implementation

1. **Start the dev server** (should already be running):
   ```bash
   cd dao-app
   npm run dev
   ```

2. **Test Phone Authentication**:
   - Click "Sign In with Phone" in header
   - Enter phone number (with country code)
   - Enter OTP code sent to your phone
   - Wallet should connect automatically

3. **Test Profile Page**:
   - Navigate to `/profile`
   - Should see your wallet address and phone number
   - NFT Status Card shows membership status
   - Try uploading a profile picture
   - Set a username and bio
   - Click "Save Changes"

4. **Test NFT Status**:
   - If no NFT: Should see "Not a Member" badge
   - Click "Mint Citizen NFT" button
   - After minting: Badge should change to "Citizen Member" ✅
   - Delegate voting power
   - Status should update automatically

---

## 📁 Files Created/Modified

### New Files Created:

```
dao-app/
├── supabase-users-schema.sql          # Database schema
├── src/
│   ├── lib/
│   │   ├── user-types.ts              # User TypeScript types
│   │   └── supabase-users.ts          # User CRUD functions
│   ├── hooks/
│   │   └── useUserProfile.ts          # User profile hook
│   ├── components/
│   │   └── profile/
│   │       ├── NFTStatusCard.tsx      # NFT status display
│   │       ├── ProfileForm.tsx        # Profile edit form
│   │       └── ProfilePictureUpload.tsx # Image upload
│   └── app/
│       ├── profile/
│       │   └── page.tsx               # Profile page
│       └── api/
│           └── users/
│               ├── profile/
│               │   └── route.ts       # Profile API
│               └── nft-status/
│                   └── route.ts       # NFT status API
```

### Files Modified:

```
dao-app/
└── src/
    └── components/
        └── layout/
            └── Header.tsx             # Added phone auth + profile link
```

---

## 🔧 Configuration Details

### Phone Authentication

The Header component now uses:
```typescript
import { inAppWallet } from "thirdweb/wallets";

const wallets = [
  inAppWallet({
    auth: {
      options: ["phone"], // Only phone authentication
    },
  }),
];
```

This **restricts authentication to phone only** - no wallet connections, email, or social auth.

---

### User Profile Hook

The `useUserProfile` hook automatically:
- Creates/updates user record when wallet connects
- Syncs NFT balance from blockchain
- Updates delegation status
- Provides loading states and error handling

Usage:
```typescript
const { user, isLoading, error, refreshUser } = useUserProfile();
```

---

### Profile Picture Storage

Images are stored in Supabase Storage:
- Bucket: `profile-pictures`
- Max size: 2MB
- Formats: JPG, PNG, GIF
- Public URLs for fast access

---

## 📊 Database Schema

### Users Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `wallet_address` | TEXT | Unique wallet address |
| `phone_number` | TEXT | E.164 format: +1234567890 |
| `phone_verified` | BOOLEAN | Phone verification status |
| `username` | TEXT | Optional username (3-30 chars) |
| `profile_picture_url` | TEXT | Supabase Storage URL |
| `bio` | TEXT | User bio (max 500 chars) |
| `nft_balance` | BIGINT | Cached NFT balance |
| `has_delegated` | BOOLEAN | Delegation status |
| `delegate_address` | TEXT | Delegate wallet address |
| `created_at` | TIMESTAMP | Join date |
| `updated_at` | TIMESTAMP | Last profile update |
| `last_login_at` | TIMESTAMP | Last login timestamp |

### Proposals Table Update

Added column:
- `blockchain_proposal_id` (TEXT) - Numeric proposalId from blockchain

---

## 🎨 User Flow

1. **First Time User**:
   - Click "Sign In with Phone"
   - Enter phone number
   - Enter OTP
   - Wallet created automatically
   - User record created in Supabase
   - Redirected to home page
   - "Profile" link appears in header

2. **Profile Setup**:
   - Navigate to `/profile`
   - Upload profile picture (optional)
   - Set username (optional)
   - Write bio (optional)
   - Click "Save Changes"

3. **Mint NFT**:
   - Profile shows "Not a Member" badge
   - Click "Mint Citizen NFT"
   - After minting: Badge updates to "Citizen Member" ✅
   - NFT Status Card updates automatically

4. **Delegate Voting Power**:
   - Profile shows "Delegated: ❌ No"
   - Click "Delegate Voting Power"
   - Delegate to self or another address
   - Status updates to "Delegated: ✅ Yes"

5. **Participate in DAO**:
   - Create proposals
   - Vote on proposals
   - Profile tracks activity

---

## 🔒 Security Features

✅ Row Level Security (RLS) enabled on users table
✅ Phone numbers stored in secure E.164 format
✅ Profile pictures size limited (2MB max)
✅ Username validation (alphanumeric + underscore only)
✅ Bio limited to 500 characters
✅ Wallet address verification through thirdweb
✅ Storage policies restrict unauthorized uploads

---

## 🐛 Troubleshooting

### Phone Auth Not Working

1. **Check thirdweb dashboard**:
   - In-App Wallets enabled?
   - Phone auth enabled?

2. **Check console for errors**:
   - Open browser DevTools
   - Look for authentication errors

3. **Verify client ID**:
   ```bash
   echo $NEXT_PUBLIC_TEMPLATE_CLIENT_ID
   ```

### Profile Not Loading

1. **Check Supabase connection**:
   ```bash
   echo $NEXT_PUBLIC_SUPABASE_URL
   echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

2. **Verify users table exists**:
   - Go to Supabase Dashboard → Database
   - Check `users` table exists

3. **Check browser console**:
   - Look for Supabase errors
   - Verify API calls are successful

### Profile Picture Upload Fails

1. **Check storage bucket**:
   - Supabase Dashboard → Storage
   - `profile-pictures` bucket exists and is public

2. **Check file size**:
   - Must be under 2MB
   - JPG, PNG, or GIF only

3. **Check storage policies**:
   - Re-run SQL schema if policies missing

### NFT Status Not Updating

1. **Check blockchain connection**:
   - Wallet connected to Base chain?
   - NFT contract address correct?

2. **Check console logs**:
   - Look for "Syncing NFT status..." messages
   - Check for blockchain read errors

3. **Manually refresh**:
   - The `useUserProfile` hook auto-syncs
   - Try disconnecting and reconnecting wallet

---

## 📱 Mobile Considerations

The phone authentication works great on mobile:
- ✅ SMS OTP delivery
- ✅ Auto-fill OTP codes (iOS/Android)
- ✅ Responsive profile page
- ✅ Mobile-optimized image upload

---

## 🚀 Next Steps

After setup, you can:

1. **Customize the UI**:
   - Update colors in Tailwind config
   - Modify profile page layout
   - Add more profile fields

2. **Add Features**:
   - User followers/following
   - Achievement badges
   - Voting history display
   - Proposal creation count

3. **Enhance Security**:
   - Add rate limiting to API routes
   - Implement email notifications
   - Add 2FA options

4. **Analytics**:
   - Track user signups
   - Monitor NFT minting rate
   - Analyze voting participation

---

## 📚 API Reference

### GET /api/users/profile?wallet_address=0x...

Fetch user profile by wallet address.

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "...",
    "wallet_address": "0x...",
    "phone_number": "+1234567890",
    "username": "alice",
    "profile_picture_url": "https://...",
    "bio": "DAO enthusiast!",
    "nft_balance": "1",
    "has_delegated": true,
    "delegate_address": "0x...",
    "created_at": "2025-01-15T10:00:00Z"
  }
}
```

### POST /api/users/profile

Create new user profile.

**Request:**
```json
{
  "wallet_address": "0x...",
  "phone_number": "+1234567890",
  "phone_verified": true
}
```

### PATCH /api/users/profile

Update user profile.

**Request:**
```json
{
  "wallet_address": "0x...",
  "username": "alice",
  "profile_picture_url": "https://...",
  "bio": "Updated bio"
}
```

### POST /api/users/nft-status

Update cached NFT status.

**Request:**
```json
{
  "wallet_address": "0x...",
  "nft_balance": "1",
  "has_delegated": true,
  "delegate_address": "0x..."
}
```

---

## ✅ Success Checklist

Before going live, verify:

- [ ] SQL schema executed successfully
- [ ] Users table exists with correct columns
- [ ] Storage bucket created and public
- [ ] Thirdweb in-app wallets enabled
- [ ] Phone auth working (test with your phone)
- [ ] Profile page loads correctly
- [ ] Profile picture upload works
- [ ] Username/bio can be saved
- [ ] NFT status displays correctly
- [ ] Badge updates after minting NFT
- [ ] Delegation status syncs properly
- [ ] No console errors
- [ ] Mobile responsive

---

## 🎉 You're Done!

Users can now:
✅ Sign in with phone number only
✅ Create personalized profiles
✅ Upload profile pictures
✅ View their Citizen Membership NFT status
✅ Track delegation status
✅ Participate in DAO governance

For questions or issues, check the browser console and Supabase logs first!
