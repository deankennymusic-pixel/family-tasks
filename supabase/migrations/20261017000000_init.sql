-- Family Tasks V1: profiles, households, invites and shared tasks.
--
-- Access model: a user belongs to at most one household. Everything a client
-- can read or write is gated by household membership through row level
-- security. Privileged operations (creating a household, inviting, accepting)
-- go through SECURITY DEFINER functions that check the caller themselves.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Tasks',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  -- V1: one household per person.
  constraint household_members_one_per_user unique (user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (household_id, email)
);

create index household_invites_email_idx on public.household_invites (email) where accepted_at is null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_household_idx on public.tasks (household_id, completed, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so policies can consult membership without recursing
-- through household_members' own policy.
create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create function public.current_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Keep a profile row in sync with the Google identity on sign-up and sign-in.
create function public.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.sync_profile();

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile();

-- Server owns timestamps and authorship; clients can't forge them.
create function public.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.completed and (tg_op = 'INSERT' or not old.completed) then
    new.completed_at := now();
  elsif not new.completed then
    new.completed_at := null;
  else
    new.completed_at := old.completed_at;
  end if;

  new.title := btrim(new.title);
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.tasks enable row level security;

-- Supabase grants table access to anon by default; nothing here is public.
revoke all on public.profiles, public.households, public.household_members,
  public.household_invites, public.tasks from anon;

-- Writes to these happen only through the functions below.
revoke insert, update, delete on public.profiles, public.households,
  public.household_members, public.household_invites from authenticated;
grant select on public.profiles, public.households, public.household_members,
  public.household_invites to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

create policy "Read own profile and household members"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.household_members theirs
      where theirs.user_id = profiles.id
        and public.is_household_member(theirs.household_id)
    )
  );

create policy "Members read their household"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "Members read household membership"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

create policy "Members and invitees read invites"
  on public.household_invites for select to authenticated
  using (public.is_household_member(household_id) or email = public.current_email());

create policy "Members read tasks"
  on public.tasks for select to authenticated
  using (public.is_household_member(household_id));

create policy "Members create tasks"
  on public.tasks for insert to authenticated
  with check (public.is_household_member(household_id));

create policy "Members update tasks"
  on public.tasks for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "Members delete tasks"
  on public.tasks for delete to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Household functions (called via supabase.rpc)
-- ---------------------------------------------------------------------------

-- Returns the caller's household, creating one if they have none.
create function public.ensure_household()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select household_id into hid from public.household_members where user_id = uid;
  if hid is not null then
    return hid;
  end if;

  insert into public.households (created_by) values (uid) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, uid);
  return hid;
end;
$$;

-- Invites someone (by Google email) into the caller's household.
create function public.invite_member(invitee_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  normalized text := lower(btrim(invitee_email));
  invite_id uuid;
begin
  select household_id into hid from public.household_members where user_id = uid;
  if hid is null then
    raise exception 'You are not in a household' using errcode = '42501';
  end if;
  if normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.household_members m
    join public.profiles p on p.id = m.user_id
    where m.household_id = hid and p.email = normalized
  ) then
    raise exception 'They are already in your household' using errcode = '23505';
  end if;

  insert into public.household_invites (household_id, email, invited_by)
  values (hid, normalized, uid)
  on conflict (household_id, email)
    do update set invited_by = excluded.invited_by, created_at = now(), accepted_at = null
  returning id into invite_id;
  return invite_id;
end;
$$;

-- Pending invites for the signed-in user, with who sent them.
create function public.my_invites()
returns table (id uuid, household_id uuid, household_name text, inviter_name text, inviter_avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.household_id, h.name, coalesce(p.display_name, p.email), p.avatar_url
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.current_email()
    and i.accepted_at is null
    and not public.is_household_member(i.household_id)
  order by i.created_at desc;
$$;

-- Joins the household behind an invite addressed to the caller's email.
-- If the caller was alone in another household, their tasks come with them.
create function public.accept_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.household_invites;
  old_hid uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into inv from public.household_invites
  where id = invite_id and accepted_at is null and email = public.current_email()
  for update;
  if inv.id is null then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  select household_id into old_hid from public.household_members where user_id = uid;
  if old_hid = inv.household_id then
    update public.household_invites set accepted_at = now() where id = inv.id;
    return inv.household_id;
  end if;

  if old_hid is not null then
    delete from public.household_members where household_id = old_hid and user_id = uid;
    if not exists (select 1 from public.household_members where household_id = old_hid) then
      update public.tasks set household_id = inv.household_id where household_id = old_hid;
      delete from public.households where id = old_hid;
    end if;
  end if;

  insert into public.household_members (household_id, user_id) values (inv.household_id, uid);
  update public.household_invites set accepted_at = now() where id = inv.id;
  return inv.household_id;
end;
$$;

-- Withdraws an invite that hasn't been accepted.
create function public.cancel_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.household_invites
  where id = invite_id and accepted_at is null and public.is_household_member(household_id);
end;
$$;

revoke execute on function public.ensure_household(), public.invite_member(text), public.my_invites(),
  public.accept_invite(uuid), public.cancel_invite(uuid), public.is_household_member(uuid),
  public.current_email(), public.sync_profile(), public.tasks_before_write()
  from public, anon;
grant execute on function public.ensure_household(), public.invite_member(text), public.my_invites(),
  public.accept_invite(uuid), public.cancel_invite(uuid), public.is_household_member(uuid),
  public.current_email()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Realtime checks the select policy above before delivering each change.
alter publication supabase_realtime add table public.tasks;
