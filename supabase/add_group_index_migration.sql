-- Migration: Add group_index column to signups table
-- Run this in Supabase SQL Editor to add the group_index column

-- Add the group_index column with a default value of 0
ALTER TABLE signups
ADD COLUMN IF NOT EXISTS group_index int NOT NULL DEFAULT 0;

-- Add check constraint to ensure group_index is non-negative
ALTER TABLE signups
ADD CONSTRAINT IF NOT EXISTS signups_group_index_check CHECK (group_index >= 0);

-- Update existing records: calculate group_index based on their position in the queue
-- This ensures existing signups get proper group assignments
WITH ranked_signups AS (
  SELECT
    id,
    court_number,
    status,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY court_number, status
      ORDER BY created_at ASC
    ) - 1 AS position
  FROM signups
  WHERE status = 'waiting'
)
UPDATE signups
SET group_index = FLOOR(ranked_signups.position / 4)::int
FROM ranked_signups
WHERE signups.id = ranked_signups.id;

-- Verify the migration
SELECT
  court_number,
  group_index,
  first_name,
  last_name,
  created_at,
  status
FROM signups
WHERE status = 'waiting'
ORDER BY court_number, group_index, created_at;
