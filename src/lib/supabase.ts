import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

// Conditionally import ws for Node.js environments (SSR)
// In browsers, native WebSocket is used automatically
let wsTransport: any;
if (typeof window === 'undefined') {
  // Server-side (Node.js) - use ws package
  const ws = await import('ws');
  wsTransport = ws.default as any;
}

// Create client with placeholder values if env vars are missing (for build time)
// At runtime, the components will check for valid credentials
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    ...(wsTransport && {
      realtime: {
        transport: wsTransport,
      },
    }),
  }
);
