/* ============================================================
   config.js — Supabase connection

   This file IS committed, on purpose.

   The key below is the *anon* (publishable) key. It is sent to
   every visitor's browser so the site can read its own content —
   hiding it achieves nothing. What actually controls access is
   row level security: see the policies in supabase.sql and
   admin-schema.sql, which allow anyone to read and only the
   signed-in owner to write.

   The key that must never appear here, or anywhere in the repo,
   is service_role. That one bypasses every policy.
   ============================================================ */

window.SUPABASE_URL      = 'https://gnfqwqiegsdralfxzymn.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduZnF3cWllZ3NkcmFsZnh6eW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTQ1NjksImV4cCI6MjA5MDc5MDU2OX0.vLgmmabfHJfAjk7dWPgsxTiT39bffuhVGNRz6h-5peQ';
