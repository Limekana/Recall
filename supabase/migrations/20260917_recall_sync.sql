create table if not exists public.recall_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null,
  device_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.recall_sync_state enable row level security;

drop policy if exists "Users can read their Recall snapshot" on public.recall_sync_state;
create policy "Users can read their Recall snapshot"
  on public.recall_sync_state
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their Recall snapshot" on public.recall_sync_state;
create policy "Users can create their Recall snapshot"
  on public.recall_sync_state
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their Recall snapshot" on public.recall_sync_state;
create policy "Users can update their Recall snapshot"
  on public.recall_sync_state
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.sync_recall_snapshot(
  expected_revision bigint,
  next_payload jsonb,
  next_hash text,
  next_device_id text
)
returns public.recall_sync_state
language plpgsql
security invoker
set search_path = public
as $$
declare
  synced_snapshot public.recall_sync_state;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  if expected_revision = 0 then
    insert into public.recall_sync_state (user_id, revision, payload, payload_hash, device_id)
    values (auth.uid(), 1, next_payload, next_hash, next_device_id)
    on conflict (user_id) do nothing
    returning * into synced_snapshot;
  else
    update public.recall_sync_state
      set revision = revision + 1,
          payload = next_payload,
          payload_hash = next_hash,
          device_id = next_device_id,
          updated_at = now()
      where user_id = auth.uid()
        and revision = expected_revision
      returning * into synced_snapshot;
  end if;

  if synced_snapshot.user_id is null then
    raise exception using errcode = '40001', message = 'sync_conflict';
  end if;

  return synced_snapshot;
end;
$$;

revoke all on function public.sync_recall_snapshot(bigint, jsonb, text, text) from public;
revoke all on function public.sync_recall_snapshot(bigint, jsonb, text, text) from anon;
grant execute on function public.sync_recall_snapshot(bigint, jsonb, text, text) to authenticated;
grant select, insert, update on public.recall_sync_state to authenticated;
