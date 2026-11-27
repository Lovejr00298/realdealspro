create table public.outreach_sends (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    channel text not null check (channel in ('email', 'sms', 'mail')),
    contact text not null,
    campaign_key text not null,
    provider_id text,
    status text not null check (status in ('sent', 'failed', 'blocked')),
    detail text,
    created_at timestamptz not null default now()
);
create index outreach_sends_user_day on public.outreach_sends (user_id, created_at desc);
alter table public.outreach_sends enable row level security;
revoke all on public.outreach_sends from public, anon, authenticated;
grant select, insert on public.outreach_sends to authenticated;
create policy outreach_sends_owner_read on public.outreach_sends
    for select to authenticated using ((select auth.uid()) = user_id);
create policy outreach_sends_owner_insert on public.outreach_sends
    for insert to authenticated with check ((select auth.uid()) = user_id);

create table public.outreach_suppression (
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    contact text not null,
    reason text,
    created_at timestamptz not null default now(),
    primary key (user_id, contact)
);
alter table public.outreach_suppression enable row level security;
revoke all on public.outreach_suppression from public, anon, authenticated;
grant select, insert on public.outreach_suppression to authenticated;
create policy outreach_suppression_owner_read on public.outreach_suppression
    for select to authenticated using ((select auth.uid()) = user_id);
create policy outreach_suppression_owner_insert on public.outreach_suppression
    for insert to authenticated with check ((select auth.uid()) = user_id);
