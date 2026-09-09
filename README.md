# CMU Badminton Open Gym - Queue System

A frontend-only Astro website for managing court signups and queues for the CMU Badminton Team's open gym sessions. Built to handle high concurrent traffic (~70 people signing up simultaneously on mobile devices).

## Tech Stack

- **Astro** - Static site framework
- **React** - Interactive components with `client:load` islands
- **Supabase** - Backend (Postgres + Auth + Realtime)
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## Features

- **Real-time queue display** for 3 courts
- **Anonymous authentication** for players (zero-friction signup)
- **Email/password authentication** for admins
- **Row Level Security (RLS)** for all authorization
- **Live updates** via Supabase Realtime
- **Mobile-first responsive design**
- **Queue grouping** - Automatic groups of 4 players per court

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once your project is created, go to the SQL Editor
3. Run the database schema from `supabase/schema.sql` to create tables and RLS policies

### 2. Enable Anonymous Sign-ins

1. In your Supabase project, go to **Authentication** → **Providers**
2. Find **Anonymous Sign-ins** and toggle it **ON** (it's off by default)
3. Confirm that **Email/Password** authentication is also enabled

### 3. Set Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Get your Supabase credentials:
   - Go to **Project Settings** → **API**
   - Copy your **Project URL** and **anon/public key**

3. Update `.env` with your values:
   ```
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 4. Install Dependencies

```bash
npm install
```

### 5. Bootstrap First Admin

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:4321/admin/signup` and create an admin account

3. After signup, go to your Supabase dashboard → **SQL Editor** and run:
   ```sql
   -- First, find your user_id
   SELECT id, email FROM auth.users;

   -- Then insert it into the admins table
   INSERT INTO admins (user_id) VALUES ('your-user-id-here');
   ```

4. Now you can log in at `/admin/login` and access the admin panel

### 6. Add Additional Admins

After the first admin is set up, repeat steps 2-3 above for each new admin account:
- Have them sign up at `/admin/signup`
- Manually insert their user_id into the `admins` table via the Supabase SQL editor

## Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
/
├── public/              # Static assets
├── src/
│   ├── components/      # React components (islands)
│   │   ├── QueueDisplay.tsx
│   │   ├── SignupForm.tsx
│   │   ├── AdminPanel.tsx
│   │   ├── AdminLogin.tsx
│   │   └── AdminSignup.tsx
│   ├── lib/            # Utilities and configuration
│   │   ├── supabase.ts # Supabase client setup
│   │   ├── types.ts    # TypeScript types
│   │   └── queue.ts    # Queue grouping logic
│   └── pages/          # Routes
│       ├── index.astro         # Main queue display (/)
│       ├── signup.astro        # Signup form (/signup)
│       └── admin/
│           ├── index.astro     # Admin panel (/admin)
│           ├── login.astro     # Admin login
│           └── signup.astro    # Admin signup
├── supabase/
│   └── schema.sql      # Database schema & RLS policies
└── .env.example        # Environment variables template
```

## How It Works

### Queue Logic

- Queue is computed dynamically, not stored
- Players are grouped by court in groups of 4 based on signup time
- Groups are labeled: "Now Playing" (group 0), "Up Next" (group 1), "On Deck" (group 2), etc.
- Partial groups (e.g., 2/4 players) automatically fill as new signups come in
- No race conditions on signup - it's a pure append operation

### Authentication

**Players:**
- Automatically get an anonymous session on first page load
- Session persists across visits (stored in browser)
- Can sign up and cancel their own entries
- No visible login/signup required

**Admins:**
- Create account via email/password at `/admin/signup`
- Must be manually added to `admins` table in Supabase
- Can advance queues, remove entries, and reset all courts
- Authorization enforced entirely by RLS policies

### Security

All security is handled by Supabase Row Level Security (RLS):

- **Signups table:**
  - Anyone can SELECT (public queue)
  - Authenticated users can INSERT (players)
  - Admins can UPDATE (advance queue)
  - Users can DELETE their own signups, admins can delete any

- **Admins table:**
  - Users can only see their own admin status
  - No client-side INSERT/UPDATE/DELETE (manual only)

## Pages

- **`/`** - Main queue display (public)
- **`/signup`** - Signup form (public)
- **`/admin`** - Admin control panel (protected)
- **`/admin/login`** - Admin login
- **`/admin/signup`** - Admin account creation

## Deployment

This is a standard Astro SSG site. You can deploy to:

- Vercel
- Netlify
- Cloudflare Pages
- Any static hosting service

Make sure to set your environment variables (`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`) in your hosting platform's settings.

## License

MIT
# badminton-signup
