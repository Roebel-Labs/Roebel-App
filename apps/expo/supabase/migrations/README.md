# Database Migrations

This directory contains SQL migration scripts for the Röbel/Müritz app Supabase database.

## Running Migrations

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to the **SQL Editor** section
3. Open the migration file (`create_feedback_table.sql`)
4. Copy and paste the SQL script
5. Click "Run" to execute the migration

### Option 2: Supabase CLI
If you have the Supabase CLI installed:

```bash
# Link your project (first time only)
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Available Migrations

### create_feedback_table.sql
Creates the `feedback` table for storing user feedback submissions.

**Features:**
- Stores feedback type (bug reports, feature requests, improvements, general)
- Optional user wallet address for authenticated feedback
- Device information capture (OS, app version, device model)
- Status tracking (new, in_review, resolved, closed)
- Row Level Security (RLS) enabled
- Automatic timestamp updates
- Indexes for performance

**Security:**
- Anyone can submit feedback (INSERT policy)
- Users can view their own feedback if authenticated
- Admin access can be configured by uncommenting the admin policy

## Verification

After running the migration, verify the table was created:

```sql
SELECT * FROM feedback LIMIT 1;
```

You should see the table structure with no errors.
