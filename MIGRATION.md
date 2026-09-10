# Database Migration: Add group_index Field

This migration adds the `group_index` field to freeze queue positions.

## What Changed

**Before:** Groups were calculated dynamically by position. When someone canceled, everyone below them moved up automatically.

**After:** Groups are "frozen" - when you sign up for a specific group, you stay in that group even if people ahead of you cancel.

## Migration Steps

### 1. Add the new column to your Supabase database

Run this SQL in the Supabase SQL Editor:

```sql
-- Add the group_index column
ALTER TABLE signups
ADD COLUMN group_index int NOT NULL DEFAULT 0 CHECK (group_index >= 0);

-- Update existing records to set their group_index based on their current position
-- This is a one-time migration to assign existing signups to groups
WITH ranked_signups AS (
  SELECT
    id,
    court_number,
    status,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY court_number, status
      ORDER BY created_at
    ) - 1 AS position
  FROM signups
  WHERE status = 'waiting'
)
UPDATE signups
SET group_index = FLOOR(ranked_signups.position / 4)
FROM ranked_signups
WHERE signups.id = ranked_signups.id;

-- For 'done' signups, we can leave group_index as 0 since they're not displayed
```

### 2. Verify the migration

Check that existing signups have been assigned to groups:

```sql
SELECT
  court_number,
  group_index,
  first_name,
  last_name,
  created_at
FROM signups
WHERE status = 'waiting'
ORDER BY court_number, group_index, created_at;
```

### 3. Deploy the updated code

The code changes are already in place. Once you run the migration, the new behavior will take effect immediately.

## How It Works Now

- **Signing up:** Users select a group (Now Playing, Up Next, On Deck, Group 4, Group 5). The `group_index` is saved to the database.
- **Displaying queues:** Groups are displayed based on `group_index`, not position.
- **Canceling:** When someone cancels, they're removed from their group. Other groups stay in place - no one moves up automatically.
- **Advancing queue:** Admins advance the lowest `group_index` group (all players in that group are marked as done).

## Example

**Before (dynamic grouping):**
- Alice, Bob, Charlie, Dave = Now Playing
- Eve, Frank = Up Next

If Charlie cancels:
- Alice, Bob, Dave, Eve = Now Playing (Eve moved up!)
- Frank = Up Next

**After (frozen groups):**
- Alice (group 0), Bob (group 0), Charlie (group 0), Dave (group 0) = Now Playing
- Eve (group 1), Frank (group 1) = Up Next

If Charlie cancels:
- Alice (group 0), Bob (group 0), Dave (group 0) = Now Playing (3/4)
- Eve (group 1), Frank (group 1) = Up Next (still Up Next!)
