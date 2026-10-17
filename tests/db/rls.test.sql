-- Row level security and household function tests.
-- Each block switches to the `authenticated` role with a given user's JWT
-- claims, just as PostgREST and Realtime do for a signed-in request.
\set QUIET on
\pset tuples_only on
\pset format unaligned

create schema test;
grant usage on schema test to authenticated, anon;

create function test.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'ok - %', label;
end $$;

-- Asserts that `stmt` raises; returns nothing on success.
create function test.throws(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (expected an error)', label;
end $$;

grant execute on all functions in schema test to authenticated, anon;

-- Users: Dean and Lu share a household, Eve is a stranger.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'Dean@Example.com', '{"full_name":"Dean","avatar_url":"https://x/d.png"}'),
  ('00000000-0000-0000-0000-00000000000a', 'lu@example.com',   '{"name":"Lu","picture":"https://x/l.png"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com',  '{"full_name":"Eve"}');

select test.ok((select count(*) = 3 from public.profiles), 'profiles created for new users');
select test.ok((select email = 'dean@example.com' and display_name = 'Dean' from public.profiles
  where id = '00000000-0000-0000-0000-00000000000d'), 'profile email lowercased, name copied');
select test.ok((select display_name = 'Lu' and avatar_url = 'https://x/l.png' from public.profiles
  where id = '00000000-0000-0000-0000-00000000000a'), 'profile falls back to name/picture claims');

\echo '-- anonymous'
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select test.throws('select * from public.tasks', 'anon cannot read tasks');
select test.throws('select public.ensure_household()', 'anon cannot create a household');
reset role;

\echo '-- Dean'
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","email":"dean@example.com"}';
select public.ensure_household() as dean_hid \gset
select test.ok(public.ensure_household() = :'dean_hid', 'ensure_household is idempotent');
select test.ok((select name = 'Our Tasks' from public.households), 'default list is Our Tasks');

insert into public.tasks (id, household_id, title, created_by, created_at)
values ('11111111-1111-1111-1111-111111111111', :'dean_hid', '  Buy milk  ',
        '00000000-0000-0000-0000-00000000000e', '2000-01-01');
select test.ok((select title = 'Buy milk' from public.tasks), 'title trimmed');
select test.ok((select created_by = '00000000-0000-0000-0000-00000000000d' from public.tasks),
  'created_by forced to the caller');
select test.ok((select created_at > '2020-01-01' from public.tasks), 'created_at cannot be forged');
select test.throws($$insert into public.tasks (household_id, title) values ('$$ || :'dean_hid' || $$', '   ')$$,
  'blank titles rejected');

select test.throws($$select public.invite_member('not-an-email')$$, 'invalid invite email rejected');
select public.invite_member('  LU@example.com ') as invite_id \gset
select test.ok((select email = 'lu@example.com' from public.household_invites), 'invite email normalised');
reset role;

\echo '-- Eve (stranger)'
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","email":"eve@example.com"}';
select test.ok((select count(*) = 0 from public.tasks), 'stranger sees no tasks');
select test.ok((select count(*) = 0 from public.households), 'stranger sees no households');
select test.ok((select count(*) = 0 from public.household_members), 'stranger sees no members');
select test.ok((select count(*) = 0 from public.household_invites), 'stranger sees no invites');
select test.ok((select count(*) = 1 from public.profiles), 'stranger sees only their own profile');
select test.ok((select count(*) = 0 from public.my_invites()), 'stranger has no invites');
select test.throws($$select public.accept_invite('$$ || :'invite_id' || $$')$$, 'stranger cannot accept Lu''s invite');
select test.throws($$insert into public.tasks (household_id, title) values ('$$ || :'dean_hid' || $$', 'spam')$$,
  'stranger cannot insert into another household');
update public.tasks set title = 'hacked' where id = '11111111-1111-1111-1111-111111111111';
delete from public.tasks where id = '11111111-1111-1111-1111-111111111111';
select public.ensure_household() as eve_hid \gset
select test.throws($$insert into public.household_members (household_id, user_id) values ('$$ || :'dean_hid' || $$', auth.uid())$$,
  'stranger cannot add themselves to a household');
select test.throws($$insert into public.household_invites (household_id, email) values ('$$ || :'dean_hid' || $$', 'eve@example.com')$$,
  'stranger cannot invite themselves');
select test.throws($$select public.invite_member('eve@example.com')$$, 'cannot invite someone already in the household');
reset role;
select test.ok((select title = 'Buy milk' from public.tasks where id = '11111111-1111-1111-1111-111111111111'),
  'stranger update and delete had no effect');

\echo '-- Lu signs in before accepting: gets her own household with a task'
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","email":"lu@example.com"}';
select public.ensure_household() as lu_old_hid \gset
insert into public.tasks (household_id, title) values (:'lu_old_hid', 'Book swim lessons');
select test.ok((select count(*) = 1 from public.tasks), 'Lu sees only her own task before joining');
select test.ok((select count(*) = 1 and min(inviter_name) = 'Dean' from public.my_invites()),
  'Lu sees Dean''s invite with his name');
select test.ok((select count(*) = 1 from public.household_invites), 'Lu can read the invite addressed to her');
select test.ok(public.accept_invite(:'invite_id') = :'dean_hid', 'Lu accepts');
select test.ok((select count(*) = 2 from public.tasks), 'Lu now sees both tasks (hers moved with her)');
select test.ok((select count(*) = 2 from public.profiles), 'Lu can see Dean''s profile');
select test.ok((select count(*) = 0 from public.my_invites()), 'invite no longer pending');
select test.ok(public.ensure_household() = :'dean_hid', 'Lu''s household is now Dean''s');

update public.tasks set completed = true where id = '11111111-1111-1111-1111-111111111111';
select test.ok((select completed and completed_at is not null and created_by = '00000000-0000-0000-0000-00000000000d'
  from public.tasks where id = '11111111-1111-1111-1111-111111111111'), 'Lu completes Dean''s task; author kept');
update public.tasks set completed = false where id = '11111111-1111-1111-1111-111111111111';
select test.ok((select not completed and completed_at is null from public.tasks
  where id = '11111111-1111-1111-1111-111111111111'), 'Lu reopens it');
update public.tasks set title = 'Buy oat milk' where id = '11111111-1111-1111-1111-111111111111';
select test.ok((select title = 'Buy oat milk' from public.tasks where id = '11111111-1111-1111-1111-111111111111'),
  'Lu edits the title');
select test.throws($$update public.tasks set household_id = '$$ || :'eve_hid' || $$' where id = '11111111-1111-1111-1111-111111111111'$$,
  'cannot move a task into another household');
reset role;
select test.ok((select count(*) = 0 from public.households where id = :'lu_old_hid'), 'Lu''s empty household removed');
select test.ok((select count(*) = 2 from public.household_members where household_id = :'dean_hid'), 'both are members');

\echo '-- Dean sees Lu''s changes; deletes a task'
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","email":"dean@example.com"}';
select test.ok((select count(*) = 2 from public.tasks), 'Dean sees both tasks');
select test.ok((select count(*) = 2 from public.profiles), 'Dean sees Lu''s profile');
delete from public.tasks where title = 'Book swim lessons';
select test.ok((select count(*) = 1 from public.tasks), 'Dean deletes Lu''s task');
select public.invite_member('someone@example.com') as other_invite \gset
select public.cancel_invite(:'other_invite');
select test.ok((select count(*) = 0 from public.household_invites where accepted_at is null), 'Dean cancels a pending invite');
reset role;

\echo '-- Eve still sees nothing'
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","email":"eve@example.com"}';
select test.ok((select count(*) = 0 from public.tasks), 'stranger still sees no tasks');
select test.ok((select count(*) = 1 from public.profiles), 'stranger still sees only their own profile');
reset role;

select test.ok((select count(*) = 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tasks'),
  'tasks are published to Realtime');

\echo 'All database tests passed'
