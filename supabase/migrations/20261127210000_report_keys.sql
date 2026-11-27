-- Private key that opens the encrypted named county lists published with the site. One row per allowed account.
create table public.report_keys (
    user_id uuid primary key references auth.users(id) on delete cascade,
    private_key text not null
);
alter table public.report_keys enable row level security;
revoke all on public.report_keys from public, anon, authenticated;
grant select on public.report_keys to authenticated;
create policy report_keys_for_owner on public.report_keys
    for select to authenticated using ((select auth.uid()) = user_id);
