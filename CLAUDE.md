# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A frontend-only Astro website for the CMU Badminton Team's open gym court signup/queue system. Handles high concurrent traffic (~70 people) signing up from mobile devices during sessions.

**Stack:** Astro + React (islands) + Supabase (Postgres + Auth + Realtime) + Tailwind CSS

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:4321)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run astro check
```

## Architecture

### Frontend Structure

- **Astro pages** (`src/pages/`) - Static routes with React island components using `client:load`
- **React components** (`src/components/`) - Interactive UI with real-time Supabase subscriptions
- **Utilities** (`src/lib/`) - Supabase client, TypeScript types, queue logic

### Backend (Supabase)

**Database Tables:**
- `signups` - Court signup records (first_name, last_name, court_number, status, created_by, created_at)
- `admins` - Admin user allow-list (user_id only)

**Authentication:**
- **Players** - Anonymous auth (automatic, invisible, persistent session via Supabase SDK)
- **Admins** - Email/password auth + manual allow-list in `admins` table

**Authorization:** Entirely via Row Level Security (RLS) policies on Postgres tables. No custom API routes or RPC functions.

**Realtime:** Components subscribe to `postgres_changes` on `signups` table for live queue updates.

### Queue Logic (Important!)

Queue order is **computed dynamically, never stored**:

1. Fetch all `status='waiting'` signups for a court, ordered by `created_at ASC`
2. Group into chunks of 4: `groupIndex = floor(position / 4)`
3. Label groups: "Now Playing" (0), "Up Next" (1), "On Deck" (2), etc.

**Why:** Pure append-only inserts avoid race conditions when many people sign up simultaneously. Partial groups auto-fill as new signups arrive.

**Implementation:** See `src/lib/queue.ts` - `groupSignupsByCourt()` and `getQueuePosition()`

### Key Files

- `src/lib/supabase.ts` - Supabase client singleton (reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` env vars)
- `src/lib/types.ts` - Database TypeScript types (manually maintained to match schema)
- `src/lib/queue.ts` - Queue grouping and position calculation
- `supabase/schema.sql` - Database schema + RLS policies (run this in Supabase SQL editor during setup)

### Pages & Routes

| Route | Component | Auth | Purpose |
|-------|-----------|------|---------|
| `/` | `QueueDisplay.tsx` | Public | Live queue display for all 3 courts + user's signups |
| `/signup` | `SignupForm.tsx` | Anonymous | Sign up for a court (auto-creates anon session) |
| `/admin` | `AdminPanel.tsx` | Admin | Control panel (advance queue, remove entries, reset) |
| `/admin/login` | `AdminLogin.tsx` | Public | Email/password login |
| `/admin/signup` | `AdminSignup.tsx` | Public | Create admin account (must be manually added to `admins` table after) |

### Environment Setup

Required env vars in `.env` (see `.env.example`):
```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from Supabase project: **Project Settings → API**

### Supabase Setup Checklist

1. Create Supabase project
2. Run `supabase/schema.sql` in SQL Editor
3. Enable **Anonymous Sign-ins** in Auth → Providers (OFF by default!)
4. Bootstrap first admin:
   - Sign up at `/admin/signup`
   - Find user_id: `SELECT id, email FROM auth.users;`
   - Insert: `INSERT INTO admins (user_id) VALUES ('user-id-here');`

### Common Tasks

**Adding a new admin:**
1. Have them sign up at `/admin/signup`
2. Query their user_id: `SELECT id, email FROM auth.users WHERE email = 'their-email';`
3. Insert into admins: `INSERT INTO admins (user_id) VALUES ('user-id-here');`

**Debugging RLS issues:**
- Check policies in Supabase → Database → Tables → signups/admins → Policies
- Test auth state: `supabase.auth.getUser()` in browser console
- Verify admin status: `SELECT * FROM admins WHERE user_id = auth.uid();` (will only work for own user_id)

**Adding a new court:**
- Update `court_number` check constraint in schema: `check (court_number in (1,2,3,4))`
- Update hard-coded court loops in components: `[1, 2, 3, 4].map(...)`
- Update signup form dropdown options

### Security Notes

- All client-side queries use Supabase anon key (safe - RLS protects data)
- Never expose service_role key to frontend
- RLS policies are the **only** authorization layer (no server-side checks)
- Anonymous auth sessions persist in browser localStorage (managed by Supabase SDK)
- Admin status checked by querying `admins` table (RLS allows self-lookup only)

### Mobile Considerations

- Tailwind uses mobile-first breakpoints (`md:` for tablets/desktop)
- Queue display uses single column on mobile, 3 columns on desktop (`grid-cols-1 md:grid-cols-3`)
- Form inputs are sized for touch (min 44px tap targets via `py-3 px-4`)
- Text is readable at small sizes (minimum `text-sm`)

### Deployment

Standard Astro SSG build - outputs to `dist/` folder. Deploy to:
- Vercel (recommended - auto-detects Astro)
- Netlify
- Cloudflare Pages
- Any static host

**Must set env vars in hosting platform:** `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
