create table public.county_report_snapshots (
    user_id uuid not null references auth.users(id) on delete cascade,
    county text not null,
    kind text not null check (kind in ('surplus', 'unclaimed')),
    report_date date not null,
    source text not null,
    records jsonb not null check (jsonb_typeof(records) = 'array'),
    primary key (user_id, county, kind)
);
alter table public.county_report_snapshots enable row level security;
revoke all on public.county_report_snapshots from public, anon, authenticated;
grant select on public.county_report_snapshots to authenticated;
create policy county_reports_for_owner on public.county_report_snapshots
    for select to authenticated using ((select auth.uid()) = user_id);
