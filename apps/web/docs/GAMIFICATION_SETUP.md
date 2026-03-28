# 🎮 Gamification & Social Auth - Setup Guide

## What's New

This update adds:
✅ **Email & Social Login** - Google, Apple, Facebook alongside phone auth
✅ **Vote Tracking** - Track every vote cast by users
✅ **Gamification Points** - Earn points for voting on proposals
✅ **Voting Streaks** - Bonus points for consecutive day voting
✅ **Leaderboard** - See top voters in the community
✅ **Vote History** - Detailed record of all votes

---

## 🚀 Quick Setup

### 1. Run SQL Schema Update

Open your Supabase SQL Editor and run:

```bash
supabase-gamification-update.sql
```

This will:
- Add social auth fields (`email`, `auth_provider`)
- Add gamification columns (`total_votes_cast`, `voting_streak`, `gamification_points`)
- Create `vote_history` table
- Create functions for recording votes and getting stats
- Set up leaderboard query

**Verify it worked:**
```sql
-- Check new columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('email', 'total_votes_cast', 'gamification_points');

-- Check vote_history table exists
SELECT * FROM information_schema.tables WHERE table_name = 'vote_history';
```

---

### 2. Enable Social Auth in Thirdweb

1. Go to [thirdweb Dashboard](https://thirdweb.com/dashboard)
2. Select your project
3. Navigate to **In-App Wallets** settings
4. Enable the following auth options:
   - ✅ Phone (already enabled)
   - ✅ Email
   - ✅ Google
   - ✅ Apple
   - ✅ Facebook

**Note:** For Google, Apple, and Facebook, you may need to configure OAuth credentials in the thirdweb dashboard.

---

### 3. Test Authentication

The Header component now shows all auth options:

```typescript
options: ["phone", "email", "google", "apple", "facebook"]
```

Users can now sign in with:
- 📱 Phone number + OTP
- 📧 Email + password/magic link
- 🔵 Google account
- 🍎 Apple ID
- 📘 Facebook account

---

## 🎮 How Gamification Works

### Point System

**Base Points:**
- 10 points per vote cast

**Streak Bonus:**
- Vote on consecutive days to build a streak
- Streak bonus: up to 50 extra points
- Formula: `min(streak * 2, 50)`

**Examples:**
| Day | Streak | Base | Bonus | Total |
|-----|--------|------|-------|-------|
| 1   | 1      | 10   | 2     | 12    |
| 2   | 2      | 10   | 4     | 14    |
| 3   | 3      | 10   | 6     | 16    |
| 7   | 7      | 10   | 14    | 24    |
| 25  | 25     | 10   | 50    | 60    |

### Streak Rules

- **Continues:** Vote on proposal on consecutive calendar days
- **Breaks:** Miss a day of voting
- **Same Day:** Multiple votes same day don't break streak

### Vote Recording

When a user votes on a proposal:
1. Vote is recorded in `vote_history` table
2. User's `total_votes_cast` increments
3. Streak is calculated based on `last_vote_date`
4. Points are awarded (base + streak bonus)
5. User's `gamification_points` increases

---

## 📊 Database Schema Changes

### Users Table - New Columns

| Column | Type | Description |
|--------|------|-------------|
| `email` | TEXT | Email address (unique) |
| `email_verified` | BOOLEAN | Email verification status |
| `auth_provider` | TEXT | 'phone', 'email', 'google', 'apple', 'facebook' |
| `total_votes_cast` | BIGINT | Total number of votes |
| `voting_streak` | BIGINT | Current consecutive voting days |
| `last_vote_date` | TIMESTAMP | Last time user voted |
| `gamification_points` | BIGINT | Total points earned |
| `achievements` | JSONB | Array of achievements (future use) |

### Vote History Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Reference to users table |
| `wallet_address` | TEXT | User's wallet |
| `proposal_id` | TEXT | Transaction hash |
| `blockchain_proposal_id` | TEXT | Numeric proposal ID |
| `proposal_number` | INTEGER | Sequential number |
| `proposal_title` | TEXT | Proposal title |
| `vote_type` | SMALLINT | 0=Against, 1=For, 2=Abstain |
| `voting_power` | BIGINT | NFT balance at vote time |
| `points_earned` | BIGINT | Points from this vote |
| `streak_at_vote` | BIGINT | Streak when voted |
| `voted_at` | TIMESTAMP | Vote timestamp |
| `transaction_hash` | TEXT | Blockchain tx hash |
| `block_number` | BIGINT | Block number |

---

## 🔌 API Endpoints

### Record a Vote

**POST** `/api/votes/record`

```json
{
  "wallet_address": "0x...",
  "proposal_id": "0x...", // Transaction hash
  "blockchain_proposal_id": "123456...", // Numeric ID
  "proposal_number": 1,
  "proposal_title": "Improve Community Park",
  "vote_type": 1, // 0=Against, 1=For, 2=Abstain
  "voting_power": "1",
  "transaction_hash": "0x...",
  "block_number": "12345678"
}
```

**Response:**
```json
{
  "success": true,
  "points_earned": 12,
  "new_streak": 3,
  "streak_bonus": 6,
  "total_votes": 15
}
```

### Get Voting Stats

**GET** `/api/votes/stats?wallet_address=0x...`

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_votes_cast": 15,
    "voting_streak": 3,
    "gamification_points": 180,
    "last_vote_date": "2025-01-15T10:00:00Z",
    "for_votes": 10,
    "against_votes": 3,
    "abstain_votes": 2
  }
}
```

### Get Leaderboard

**GET** `/api/votes/leaderboard?limit=10`

**Response:**
```json
{
  "success": true,
  "leaderboard": [
    {
      "rank": 1,
      "wallet_address": "0x...",
      "username": "alice",
      "profile_picture_url": "https://...",
      "total_votes_cast": 50,
      "gamification_points": 650,
      "voting_streak": 15
    }
  ]
}
```

---

## 📱 User Interface Updates

### Profile Page

New **Gamification Stats** section shows:
- 💰 Points earned
- 🗳️ Total votes cast
- 🔥 Voting streak (with fire emoji indicators)
- 📅 Last vote date

### Streak Indicators

| Streak | Emoji | Description |
|--------|-------|-------------|
| 0      | ⭐    | No votes yet |
| 1-2    | 🔥    | Getting started |
| 3-6    | 🔥🔥  | On fire! |
| 7-13   | 🔥🔥🔥 | Unstoppable! |
| 14+    | 🔥🔥🔥🔥 | Legendary! |

---

## 🔧 Integration with Voting

### Auto-Recording Votes

To automatically record votes when users vote on proposals, update your voting handler in `[id]/page.tsx`:

```typescript
const handleVote = async (support: VoteType) => {
  // ... existing vote logic ...

  sendTransaction(transaction, {
    onSuccess: async (result) => {
      console.log("✅ Vote submitted successfully");

      // Record vote for gamification
      try {
        await fetch("/api/votes/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet_address: account.address,
            proposal_id: proposal.proposal_id,
            blockchain_proposal_id: proposal.blockchain_proposal_id,
            proposal_number: proposal.proposal_number,
            proposal_title: proposal.title,
            vote_type: support,
            voting_power: votingPower || 0n,
            transaction_hash: result.transactionHash,
            block_number: 0, // Can be updated later
          }),
        });

        console.log("🎮 Vote recorded for gamification");
      } catch (err) {
        console.error("❌ Failed to record vote:", err);
        // Don't fail the whole flow
      }

      // ... rest of success handler ...
    },
  });
};
```

---

## 🏆 Leaderboard Page (Future)

You can create a leaderboard page at `/leaderboard/page.tsx`:

```typescript
export default async function LeaderboardPage() {
  const response = await fetch("/api/votes/leaderboard?limit=50");
  const { leaderboard } = await response.json();

  return (
    <div>
      <h1>🏆 Voting Leaderboard</h1>
      {leaderboard.map((entry, i) => (
        <div key={entry.wallet_address}>
          <span>#{entry.rank}</span>
          <span>{entry.username || formatAddress(entry.wallet_address)}</span>
          <span>{entry.gamification_points} points</span>
          <span>{entry.total_votes_cast} votes</span>
        </div>
      ))}
    </div>
  );
}
```

---

## 🎯 Gamification Best Practices

### Encourage Participation

1. **Show Progress** - Display points and streaks prominently
2. **Celebrate Milestones** - Congratulate users on streak achievements
3. **Leaderboard** - Friendly competition motivates participation
4. **Achievements** - Future: Badge system for special accomplishments

### Reward Consistency

- Streak bonuses reward regular participation
- Daily voting builds community engagement
- Long-term members earn more points over time

### Keep It Fair

- Points only awarded for actual blockchain votes
- Can't game the system by fake voting
- Transparent calculation visible to all users

---

## 🔒 Security Considerations

✅ **RLS Policies** - Only users can insert their own votes
✅ **Unique Constraint** - One vote per proposal per user
✅ **Blockchain Verification** - Votes recorded after tx success
✅ **SQL Injection** - Using parameterized queries
✅ **Rate Limiting** - Consider adding to API routes

---

## 📈 Analytics & Insights

### Track Engagement

```sql
-- Most active voters
SELECT username, total_votes_cast, gamification_points
FROM users
ORDER BY gamification_points DESC
LIMIT 10;

-- Voting trends over time
SELECT DATE(voted_at) as date, COUNT(*) as votes
FROM vote_history
GROUP BY DATE(voted_at)
ORDER BY date DESC;

-- Vote type distribution
SELECT vote_type, COUNT(*) as count
FROM vote_history
GROUP BY vote_type;
```

---

## 🐛 Troubleshooting

### Votes Not Recording

1. **Check SQL function exists:**
   ```sql
   SELECT * FROM pg_proc WHERE proname = 'record_vote';
   ```

2. **Check vote_history table:**
   ```sql
   SELECT * FROM vote_history ORDER BY voted_at DESC LIMIT 5;
   ```

3. **Check API logs:**
   - Look for "🗳️ [API] Recording vote" in console
   - Verify no errors in response

### Points Not Updating

1. **Check user record:**
   ```sql
   SELECT wallet_address, total_votes_cast, gamification_points
   FROM users
   WHERE wallet_address = '0x...';
   ```

2. **Verify trigger fired:**
   - Check `updated_at` timestamp changed

3. **Check calculation:**
   - Base: 10 points
   - Streak bonus: `min(streak * 2, 50)`

### Streak Not Incrementing

1. **Check last_vote_date:**
   ```sql
   SELECT last_vote_date, voting_streak
   FROM users
   WHERE wallet_address = '0x...';
   ```

2. **Verify consecutive days:**
   - Streak only increments on consecutive calendar days
   - Same-day votes don't increment streak

---

## ✅ Success Checklist

- [ ] SQL schema executed successfully
- [ ] New columns added to users table
- [ ] vote_history table created
- [ ] Functions (record_vote, get_user_voting_stats, get_voting_leaderboard) created
- [ ] Social auth enabled in thirdweb
- [ ] Email/Google/Apple/Facebook options showing in connect button
- [ ] Profile page showing gamification stats
- [ ] Voting integration recording votes
- [ ] Points awarded correctly
- [ ] Streaks calculating properly
- [ ] Leaderboard API working

---

## 🎉 You're Done!

Users can now:
✅ Sign in with phone, email, Google, Apple, or Facebook
✅ Earn points by voting on proposals
✅ Build voting streaks for bonus points
✅ See their rank on the leaderboard
✅ Track all their voting activity

**Next steps:**
- Create leaderboard page
- Add achievement badges
- Show point notifications after voting
- Add weekly/monthly challenges

For questions or issues, check the browser console and Supabase logs!
