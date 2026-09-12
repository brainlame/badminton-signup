-- Enforce a hard cap of 4 waiting players per (court, group_index).
--
-- Why: the signup form's "group is full" check runs against the browser's
-- snapshot of the queue. Two people looking at a stale "3/4" can both submit
-- and both inserts succeed, producing a 5-player group. The UI then computes
-- Array(4 - 5) and crashes for every visitor (RangeError: Invalid array length).
--
-- The advisory lock serializes writers targeting the same group so the count
-- check below can't race under READ COMMITTED. It is released at transaction end.

create or replace function enforce_group_capacity()
returns trigger
language plpgsql
as $$
declare
  waiting_count int;
begin
  -- Only rows entering (or moving within) the waiting queue can overfill a group.
  if new.status <> 'waiting' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'waiting'
     and old.court_number = new.court_number
     and old.group_index = new.group_index then
    return new; -- same group as before; nothing to check
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

-- One-time repair of any group that is already over capacity: players beyond
-- the first 4 (by created_at) are bumped to the next group. Loops so a bump
-- that overfills the next group cascades forward. No-op when data is clean.
do $$
declare
  moved int;
begin
  loop
    with ranked as (
      select id,
             row_number() over (partition by court_number, group_index order by created_at, id) as rn
      from signups
      where status = 'waiting'
    )
    update signups s
    set group_index = s.group_index + 1
    from ranked r
    where s.id = r.id and r.rn > 4;
    get diagnostics moved = row_count;
    exit when moved = 0;
  end loop;
end $$;

drop trigger if exists signups_enforce_group_capacity on signups;
create trigger signups_enforce_group_capacity
  before insert or update of court_number, group_index, status on signups
  for each row execute function enforce_group_capacity();

-- Index the exact lookup the trigger (and the queue display) performs.
create index if not exists signups_court_group_waiting_idx
  on signups (court_number, group_index)
  where status = 'waiting';
