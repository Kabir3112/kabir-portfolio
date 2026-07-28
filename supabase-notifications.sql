-- ============================================================
--  FORM NOTIFICATIONS — email via Resend
--
--  Emails kabirmehta3112@gmail.com whenever someone subscribes to
--  the newsletter or submits the contact form.
--
--  Run this AFTER supabase.sql, and AFTER storing your Resend API
--  key in Vault (step 2 below). Order matters.
-- ============================================================


-- ------------------------------------------------------------
--  STEP 1 — enable pg_net (lets Postgres make HTTP calls)
-- ------------------------------------------------------------
create extension if not exists pg_net with schema extensions;


-- ------------------------------------------------------------
--  STEP 2 — store the Resend API key in Vault
--
--  Do this in the Supabase dashboard, NOT by editing this file:
--    Project Settings → Vault → New secret
--    Name:   resend_api_key
--    Secret: re_xxxxxxxxxx   (from resend.com/api-keys)
--
--  Using Vault keeps the key out of this repo. Never paste the
--  key into a file that gets committed.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
--  STEP 3 — helpers
-- ------------------------------------------------------------

-- Form input ends up inside an HTML email, so it must be escaped.
-- Without this, a message containing markup would render as live
-- HTML in your inbox.
create or replace function html_escape(input text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(
    coalesce(input, ''),
    '&', '&amp;'),
    '<', '&lt;'),
    '>', '&gt;'),
    '"', '&quot;'),
    '''', '&#39;');
$$;


-- Sends one email through Resend. Failures are swallowed on purpose:
-- a notification problem must never roll back the visitor's insert,
-- because that would show them an error for a submission you did
-- actually receive.
create or replace function notify_via_resend(subject text, html_body text)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  api_key text;
begin
  select decrypted_secret into api_key
    from vault.decrypted_secrets
    where name = 'resend_api_key';

  if api_key is null then
    raise warning 'notify_via_resend: no resend_api_key in Vault, skipping';
    return;
  end if;

  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type',  'application/json'
    ),
    body := jsonb_build_object(
      -- onboarding@resend.dev works immediately with no DNS setup.
      -- Swap for an address on your own verified domain later.
      'from',    'Portfolio <onboarding@resend.dev>',
      'to',      jsonb_build_array('kabirmehta3112@gmail.com'),
      'subject', subject,
      'html',    html_body
    )
  );
exception when others then
  raise warning 'notify_via_resend failed: %', sqlerrm;
end;
$$;


-- ------------------------------------------------------------
--  STEP 4 — triggers
-- ------------------------------------------------------------

create or replace function on_new_subscriber()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform notify_via_resend(
    'New newsletter subscriber',
    format(
      '<h2>New newsletter subscriber</h2><p><strong>%s</strong></p><p>%s</p>',
      html_escape(new.email),
      new.created_at
    )
  );
  return new;
end;
$$;

drop trigger if exists newsletter_notify on newsletter_subscribers;
create trigger newsletter_notify
  after insert on newsletter_subscribers
  for each row execute function on_new_subscriber();


create or replace function on_new_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform notify_via_resend(
    format('Portfolio contact: %s', new.name),
    format(
      '<h2>New contact form submission</h2>
       <p><strong>Name:</strong> %s</p>
       <p><strong>Email:</strong> %s</p>
       <p><strong>Phone:</strong> %s</p>
       <p><strong>Reason:</strong> %s</p>
       <p><strong>Message:</strong></p>
       <p>%s</p>',
      html_escape(new.name),
      html_escape(new.email),
      html_escape(coalesce(new.phone,  'not given')),
      html_escape(coalesce(new.reason, 'not given')),
      html_escape(new.message)
    )
  );
  return new;
end;
$$;

drop trigger if exists contact_notify on contact_submissions;
create trigger contact_notify
  after insert on contact_submissions
  for each row execute function on_new_contact();


-- ------------------------------------------------------------
--  STEP 5 — test it
-- ------------------------------------------------------------
-- Run these, then check your inbox (and spam folder on first send):
--
--   insert into newsletter_subscribers (email) values ('test@example.com');
--   insert into contact_submissions (name, email, message)
--     values ('Test Person', 'test@example.com', 'Testing notifications.');
--
-- Then clean up:
--   delete from newsletter_subscribers where email = 'test@example.com';
--   delete from contact_submissions     where email = 'test@example.com';
--
-- If no email arrives, check the pg_net response log:
--   select * from net._http_response order by created desc limit 5;
