-- Create the signups table
create table signups (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  court_number int not null check (court_number in (1,2,3)),
  group_index int not null default 0 check (group_index >= 0),
  status text not null default 'waiting' check (status in ('waiting', 'done')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Create the admins table
create table admins (
  user_id uuid primary key references auth.users(id)
);

-- Enable Row Level Security on both tables
alter table signups enable row level security;
alter table admins enable row level security;

-- RLS Policies for signups table

-- Anyone can read signups (queue is public)
create policy "Anyone can read signups"
  on signups for select
  using (true);

-- Authenticated users can insert their own signups
create policy "Authenticated users can insert signups"
  on signups for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());

-- Admins can update any signup
create policy "Admins can update signups"
  on signups for update
  using (
    exists (
      select 1 from admins where user_id = auth.uid()
    )
  );

-- Users can delete their own signups, or admins can delete any signup
create policy "Users can delete their own signups or admins can delete any"
  on signups for delete
  using (
    created_by = auth.uid() or
    exists (
      select 1 from admins where user_id = auth.uid()
    )
  );

-- RLS Policies for admins table

-- Users can only see their own admin status
create policy "Users can see their own admin status"
  on admins for select
  using (user_id = auth.uid());

-- No insert/update/delete from client - admins are added manually via Supabase dashboard

-- Create an index on court_number and created_at for efficient queue ordering
create index signups_court_created_idx on signups (court_number, created_at);

-- Create an index on created_by for efficient user signup lookups
create index signups_created_by_idx on signups (created_by);

-- Enforce a hard cap of 4 waiting players per (court, group_index).
-- See supabase/migrations/20260912000000_enforce_group_capacity.sql for the
-- rationale. The advisory lock serializes concurrent inserts into one group.
create or replace function enforce_group_capacity()
returns trigger
language plpgsql
as $$
declare
  waiting_count int;
begin
  if new.status <> 'waiting' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'waiting'
     and old.court_number = new.court_number
     and old.group_index = new.group_index then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('signups:' || new.court_number || ':' || new.group_index));

  select count(*) into waiting_count
  from signups
  where court_number = new.court_number
    and group_index = new.group_index
    and status = 'waiting'
    and id <> new.id;

  if waiting_count >= 4 then
    raise exception 'Group % on court % is full', new.group_index + 1, new.court_number
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger signups_enforce_group_capacity
  before insert or update of court_number, group_index, status on signups
  for each row execute function enforce_group_capacity();

create index signups_court_group_waiting_idx
  on signups (court_number, group_index)
  where status = 'waiting';
