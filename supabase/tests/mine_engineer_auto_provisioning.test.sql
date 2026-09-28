-- pgTAP tests for 106_mine_engineer_auto_provisioning.sql.
-- Run against the local Supabase stack: npx supabase test db
--
-- Everything runs in one transaction and is rolled back at the end.

begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures. handle_new_user() (073) creates the public.users rows from the
-- signup metadata, exactly as a real Mine / Engineer Match signup does.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'new-mine@example.test', now(), '{"role":"INDIVIDUAL","name":"New Mine"}', '{"provider":"email"}'),
  ('22222222-2222-4222-8222-222222222222', 'linked-mine@example.test', now(), '{"role":"INDIVIDUAL","name":"Linked Mine"}', '{"provider":"email"}'),
  ('33333333-3333-4333-8333-333333333333', 'existing-engineer@example.test', now(), '{"role":"ENGINEER","name":"Existing Engineer"}', '{"provider":"email"}'),
  ('44444444-4444-4444-8444-444444444444', 'company@example.test', now(), '{"role":"COMPANY","name":"Company"}', '{"provider":"email"}'),
  ('55555555-5555-4555-8555-555555555555', 'unverified@example.test', null, '{"role":"INDIVIDUAL","name":"Unverified"}', '{"provider":"email"}'),
  ('66666666-6666-4666-8666-666666666666', 'no-consent@example.test', now(), '{"role":"INDIVIDUAL","name":"No Consent"}', '{"provider":"email"}');

-- Everyone except no-consent has agreed to connect Engineer Match in Mine.
insert into public.mine_service_preferences (user_id, service_code, is_enabled, enabled_at)
select id, 'engineer_match', true, now() from auth.users
where id <> '66666666-6666-4666-8666-666666666666';

-- linked-mine was linked earlier (098 manual flow) to existing-engineer.
insert into public.mine_engineer_account_links (mine_user_id, engineer_user_id)
values ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

create temp table tokens (label text primary key, token text not null);
grant all on tokens to authenticated, service_role;

-- Issue a ticket as a signed-in Mine user (the browser-facing path).
create function pg_temp.issue(p_label text, p_user uuid, p_path text default '/engineer/jobs')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  insert into tokens values (p_label, public.create_mine_engineer_sso_token(p_path));
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Consume a ticket as Engineer Match's server (service_role).
create function pg_temp.consume(p_label text)
returns table(engineer_user_id uuid, return_path text) language plpgsql as $$
declare v_token text;
begin
  select t.token into v_token from tokens t where t.label = p_label;
  set local role service_role;
  return query select * from public.consume_mine_engineer_sso_token(v_token);
  reset role;
end $$;

create temp table auth_count as select count(*) as n from auth.users;

-- ---------------------------------------------------------------------------
-- 1. New Mine-only user: account is provisioned and linked on first handoff.
-- ---------------------------------------------------------------------------
select lives_ok($$ select pg_temp.issue('new', '11111111-1111-4111-8111-111111111111') $$,
  'unlinked user with consent can get a handoff ticket');
select is((select engineer_user_id from public.mine_engineer_sso_requests
           where token_digest = md5((select token from tokens where label = 'new'))),
  null::uuid, 'ticket for an unlinked user carries no engineer yet');

create temp table new_result as select * from pg_temp.consume('new');
select is((select count(*)::int from new_result), 1, 'new user: consumption returns a session target');
select is((select engineer_user_id from new_result), '11111111-1111-4111-8111-111111111111'::uuid,
  'new user: the Mine account itself is the engineer account');
select is((select return_path from new_result), '/engineer/jobs', 'new user: return path comes from the ticket');
select is((select role from public.users where id = '11111111-1111-4111-8111-111111111111'), 'ENGINEER',
  'new user: role upgraded INDIVIDUAL -> ENGINEER');
select is((select engineer_user_id from public.mine_engineer_account_links
           where mine_user_id = '11111111-1111-4111-8111-111111111111'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'new user: link row created');
select is((select count(*) from auth.users), (select n from auth_count),
  'new user: no additional auth user is created');

-- ---------------------------------------------------------------------------
-- 2. Existing linked user: behaves exactly as before.
-- ---------------------------------------------------------------------------
select pg_temp.issue('linked', '22222222-2222-4222-8222-222222222222');
select is((select engineer_user_id from pg_temp.consume('linked')),
  '33333333-3333-4333-8333-333333333333'::uuid, 'linked user: logs in to the existing engineer account');
select is((select role from public.users where id = '22222222-2222-4222-8222-222222222222'), 'INDIVIDUAL',
  'linked user: Mine account role is untouched');
select is((select count(*)::int from public.mine_engineer_account_links
           where mine_user_id = '22222222-2222-4222-8222-222222222222'), 1,
  'linked user: no extra link is created');

-- ---------------------------------------------------------------------------
-- 3. Reused and expired tickets are rejected.
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from pg_temp.consume('new') $$, '22023', null,
  'a consumed ticket cannot be used again');

select pg_temp.issue('expired', '11111111-1111-4111-8111-111111111111');
update public.mine_engineer_sso_requests set expires_at = now() - interval '1 second'
where token_digest = md5((select token from tokens where label = 'expired'));
select throws_ok($$ select * from pg_temp.consume('expired') $$, '22023', null,
  'an expired ticket is rejected');
select throws_ok($$ select * from public.consume_mine_engineer_sso_token('not-a-real-token') $$, '22023', null,
  'an unknown ticket is rejected');

-- ---------------------------------------------------------------------------
-- 4. Duplicate prevention: two tickets opened before either is used
--    (neither carries an engineer) converge on one link.
-- ---------------------------------------------------------------------------
-- Reset the user to "never linked" first.
delete from public.mine_engineer_account_links where mine_user_id = '11111111-1111-4111-8111-111111111111';
update public.users set role = 'INDIVIDUAL' where id = '11111111-1111-4111-8111-111111111111';
select pg_temp.issue('dup-b', '11111111-1111-4111-8111-111111111111');
select pg_temp.issue('dup-c', '11111111-1111-4111-8111-111111111111');
select is((select engineer_user_id from pg_temp.consume('dup-b')),
  '11111111-1111-4111-8111-111111111111'::uuid, 'duplicate: first pending ticket provisions');
select is((select engineer_user_id from pg_temp.consume('dup-c')),
  '11111111-1111-4111-8111-111111111111'::uuid, 'duplicate: second pending ticket reuses the same account');
select is((select count(*)::int from public.mine_engineer_account_links
           where mine_user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'duplicate: exactly one link row');
select is((select count(*) from auth.users), (select n from auth_count),
  'duplicate: still no additional auth user');

-- ---------------------------------------------------------------------------
-- 5. An existing Engineer Match engineer using Mine with the same account
--    links to itself -- no second account.
-- ---------------------------------------------------------------------------
delete from public.mine_engineer_account_links where mine_user_id = '22222222-2222-4222-8222-222222222222';
select pg_temp.issue('self-engineer', '33333333-3333-4333-8333-333333333333');
select is((select engineer_user_id from pg_temp.consume('self-engineer')),
  '33333333-3333-4333-8333-333333333333'::uuid, 'existing engineer account links to itself');

-- ---------------------------------------------------------------------------
-- 6. Refusals. A refused provisioning still burns the ticket.
-- ---------------------------------------------------------------------------
select pg_temp.issue('company', '44444444-4444-4444-8444-444444444444');
select is((select count(*)::int from pg_temp.consume('company')), 0, 'COMPANY account is not converted');
select is((select role from public.users where id = '44444444-4444-4444-8444-444444444444'), 'COMPANY',
  'COMPANY role is unchanged');
select throws_ok($$ select * from pg_temp.consume('company') $$, '22023', null,
  'a ticket whose provisioning failed cannot be retried');

select pg_temp.issue('unverified', '55555555-5555-4555-8555-555555555555');
select is((select count(*)::int from pg_temp.consume('unverified')), 0, 'unverified email is not provisioned');
select is((select role from public.users where id = '55555555-5555-4555-8555-555555555555'), 'INDIVIDUAL',
  'unverified user role is unchanged');

select throws_ok($$ select pg_temp.issue('no-consent', '66666666-6666-4666-8666-666666666666') $$, '42501', null,
  'unlinked user without Engineer Match consent cannot get a ticket');
select throws_ok($$ select pg_temp.issue('bad-path', '11111111-1111-4111-8111-111111111111', 'https://evil.example/') $$,
  '22023', null, 'return path outside the allow-list is rejected');

-- The browser role can never consume tickets itself.
select pg_temp.issue('browser', '11111111-1111-4111-8111-111111111111');
create function pg_temp.consume_as_browser(p_label text)
returns void language plpgsql as $$
declare v_token text;
begin
  select t.token into v_token from tokens t where t.label = p_label;
  perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  set local role authenticated;
  perform public.consume_mine_engineer_sso_token(v_token);
end $$;
select throws_ok($$ select pg_temp.consume_as_browser('browser') $$, '42501', null,
  'authenticated (browser) role cannot consume tickets');

select * from finish();
rollback;
