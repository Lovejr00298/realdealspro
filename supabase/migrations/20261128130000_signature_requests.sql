-- Documents sent for electronic signature. The random request id is the signer's access link.
create table public.signature_requests (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null check (length(title) between 1 and 200),
    document_html text not null check (length(document_html) <= 200000),
    signer_name text not null check (length(signer_name) between 1 and 200),
    case_key text check (length(case_key) <= 300),
    status text not null default 'sent' check (status in ('sent', 'signed', 'void')),
    signature text check (length(signature) <= 300000),
    signed_name text check (length(signed_name) <= 200),
    signed_at timestamptz,
    signer_user_agent text check (length(signer_user_agent) <= 500),
    created_at timestamptz not null default now()
);
alter table public.signature_requests enable row level security;
revoke all on public.signature_requests from public, anon, authenticated;
grant select, insert, delete on public.signature_requests to authenticated;
grant update (status) on public.signature_requests to authenticated;
create policy signature_requests_select on public.signature_requests
    for select to authenticated using ((select auth.uid()) = owner_id);
create policy signature_requests_insert on public.signature_requests
    for insert to authenticated with check ((select auth.uid()) = owner_id and status = 'sent' and signature is null and signed_at is null);
create policy signature_requests_void on public.signature_requests
    for update to authenticated using ((select auth.uid()) = owner_id and status = 'sent') with check (status = 'void');
create policy signature_requests_delete on public.signature_requests
    for delete to authenticated using ((select auth.uid()) = owner_id);

create function public.get_signature_request(request_id uuid)
returns table (title text, document_html text, signer_name text, status text, signature text, signed_name text, signed_at timestamptz)
language sql stable security definer set search_path = '' as $$
    select r.title, r.document_html, r.signer_name, r.status, r.signature, r.signed_name, r.signed_at
    from public.signature_requests r where r.id = request_id and r.status <> 'void'
$$;

create function public.sign_signature_request(request_id uuid, typed_name text, signature_png text, user_agent text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
    if length(trim(coalesce(typed_name, ''))) not between 2 and 200
       or coalesce(signature_png, '') not like 'data:image/png;base64,%'
       or length(signature_png) > 300000 then
        raise exception 'Invalid signature';
    end if;
    update public.signature_requests
       set status = 'signed', signature = signature_png, signed_name = trim(typed_name),
           signed_at = now(), signer_user_agent = left(coalesce(user_agent, ''), 500)
     where id = request_id and status = 'sent';
    return found;
end
$$;

revoke all on function public.get_signature_request(uuid) from public;
revoke all on function public.sign_signature_request(uuid, text, text, text) from public;
grant execute on function public.get_signature_request(uuid) to anon, authenticated;
grant execute on function public.sign_signature_request(uuid, text, text, text) to anon, authenticated;
