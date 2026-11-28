-- Paid owner phone/email lookups, cached per account so the same address is never paid for twice.
create table public.skip_trace_lookups (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    query_key text not null check (length(query_key) <= 700),
    result jsonb not null,
    created_at timestamptz not null default now()
);
create index skip_trace_lookups_user_key on public.skip_trace_lookups (user_id, query_key);
alter table public.skip_trace_lookups enable row level security;
revoke all on public.skip_trace_lookups from public, anon, authenticated;
grant select, insert on public.skip_trace_lookups to authenticated;
create policy skip_trace_lookups_select on public.skip_trace_lookups
    for select to authenticated using ((select auth.uid()) = user_id);
create policy skip_trace_lookups_insert on public.skip_trace_lookups
    for insert to authenticated with check ((select auth.uid()) = user_id);
