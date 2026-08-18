/* ============================================================
   config.example.js — template for config.js

   Only needed if you are pointing this site at a different
   Supabase project. The real config.js is committed, so a fresh
   clone already works.

   Values come from: supabase.com → your project → Settings → API
   Use the *anon* / publishable key. Never the service_role key —
   it bypasses every row level security policy and must not be
   sent to a browser.
   ============================================================ */

window.SUPABASE_URL      = 'https://your-project-ref.supabase.co';
window.SUPABASE_ANON_KEY = 'your-anon-key-here';
