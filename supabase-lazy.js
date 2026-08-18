/* ============================================================
   SUPABASE — ON-DEMAND LOADER
   ============================================================
   supabase-js is 207 KB from a CDN. It used to load on every visit
   even though most visits never touch the database: the page reads
   fine from the markup in index.html, and the library is only
   genuinely needed to submit the contact and newsletter forms, or to
   pull content when the schema actually exists.

   window.loadSupabase() fetches it at most once per page and resolves
   to a client, or to null when there is no config, no network, or the
   CDN is blocked. Every caller already has a fallback path for null,
   so nothing here can take the page down.
   ============================================================ */
(function () {
  'use strict';

  var CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

  /* Remembers that the last real attempt found no tables. A project
     without the schema would otherwise pay 207 KB on every single
     visit to re-learn the same thing. Re-checked after this window so
     running admin-schema.sql later still takes effect on its own. */
  var MISS_FOR = 24 * 60 * 60 * 1000;
  var key = function (what) { return 'sbMissing.' + (what || 'default'); };

  /* Scoped per concern on purpose. The site_* content tables and the
     projects/certificates tables are installed by different SQL files,
     so one being absent says nothing about the other — a single shared
     flag meant a missing site_sections silently stopped real project
     rows from ever loading. */
  window.supabaseSchemaMissing = function (what) {
    try { localStorage.setItem(key(what), String(Date.now() + MISS_FOR)); } catch (e) {}
  };
  window.supabaseSchemaPresent = function (what) {
    try { localStorage.removeItem(key(what)); } catch (e) {}
  };

  /* Content loaders check this before reaching for the network.
     Forms ignore it — a person pressing Send always gets a real try. */
  window.supabaseWorthTrying = function (what) {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return false;
    try {
      var until = parseInt(localStorage.getItem(key(what)), 10);
      return !(until && Date.now() < until);
    } catch (e) { return true; }
  };

  /* Rows the card sections already fetched. Lets a repeat visit paint
     real content with no network and no 207 KB library. */
  window.sbCache = {
    read: function (name, maxAgeMs) {
      try {
        var raw = JSON.parse(localStorage.getItem('sbCache.' + name));
        if (!raw || (Date.now() - raw.t) > maxAgeMs) return null;
        return raw.d;
      } catch (e) { return null; }
    },
    write: function (name, data) {
      try {
        localStorage.setItem('sbCache.' + name, JSON.stringify({ t: Date.now(), d: data }));
      } catch (e) {}
    }
  };

  window.loadSupabase = function () {
    if (window.__sbPromise) return window.__sbPromise;

    window.__sbPromise = new Promise(function (resolve) {
      if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return resolve(null);
      if (window.__sbClient) return resolve(window.__sbClient);

      var done = function () {
        if (!window.supabase) return resolve(null);
        if (!window.__sbClient) {
          window.__sbClient = window.supabase.createClient(
            window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        }
        resolve(window.__sbClient);
      };

      if (window.supabase) return done();

      var el = document.createElement('script');
      el.src = CDN;
      el.async = true;
      el.onload = done;
      el.onerror = function () { resolve(null); };
      document.head.appendChild(el);
    });

    return window.__sbPromise;
  };

  /* Run work when the browser is idle, so a background content refresh
     never competes with first paint. */
  window.whenIdle = function (fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 3000 });
    else setTimeout(fn, 1200);
  };
})();
