create table if not exists public.workspaces (
    user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
    data jsonb not null check (jsonb_typeof(data) = 'object'),
    version integer not null default 1 check (version >= 1),
    updated_at timestamptz not null default now()
);

create or replace function public.bump_workspace_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.version := old.version + 1;
    new.updated_at := now();
    new.user_id := old.user_id;
    return new;
end;
$$;

create trigger workspaces_bump_version
    before update on public.workspaces
    for each row execute function public.bump_workspace_version();

alter table public.workspaces enable row level security;
revoke all on public.workspaces from public, anon, authenticated;
grant select, insert, update (user_id, data) on public.workspaces to authenticated;

create policy workspaces_select_own on public.workspaces
    for select to authenticated using ((select auth.uid()) = user_id);
create policy workspaces_insert_own on public.workspaces
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workspaces_update_own on public.workspaces
    for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
