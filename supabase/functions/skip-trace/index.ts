// Looks up owner phone numbers and emails through BatchData. The provider key lives only in Supabase secrets.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export type Lookup = { name?: string; street: string; city: string; state: string; zip: string };
type Phone = { number: string; type: string; dnc: boolean };

export function validateLookup(p: Lookup): string | null {
  if (!p || ![p.street, p.city, p.state, p.zip].every(v => typeof v === 'string' && v.trim())) return 'A full mailing address is required.';
  if (!/^[A-Za-z]{2}$/.test(p.state.trim()) || !/^\d{5}(-?\d{4})?$/.test(p.zip.trim())) return 'Enter a valid state and ZIP code.';
  if ([p.name ?? '', p.street, p.city].some(v => v.length > 200)) return 'Lookup details are too long.';
  return null;
}

export const lookupKey = (p: Lookup) =>
  [p.street, p.city, p.state, p.zip.slice(0, 5)].map(v => v.trim().toUpperCase().replace(/\s+/g, ' ')).join('|');

export function extractContacts(data: unknown) {
  const phones = new Map<string, Phone>();
  const emails = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(item => walk(item, depth + 1));
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.phoneNumbers)) for (const p of o.phoneNumbers as Record<string, unknown>[]) {
      const number = String(p?.number ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (number.length === 10 && !phones.has(number)) phones.set(number, { number, type: String(p.type ?? ''), dnc: Boolean(p.dnc) });
    }
    if (Array.isArray(o.emails)) for (const e of o.emails as unknown[]) {
      const email = String(typeof e === 'string' ? e : (e as Record<string, unknown>)?.email ?? '').trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emails.add(email);
    }
    for (const [key, item] of Object.entries(o)) if (key !== 'phoneNumbers' && key !== 'emails') walk(item, depth + 1);
  };
  walk(data, 0);
  return { phones: [...phones.values()].slice(0, 10), emails: [...emails].slice(0, 10) };
}

if (import.meta.main) Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only.' });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply(401, { error: 'Sign in to look up owners.' });
  const allowed = env('OUTREACH_ALLOWED_EMAILS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(String(user.email).toLowerCase())) return reply(403, { error: 'This account is not allowed to run owner lookups.' });
  if (!env('BATCHDATA_API_KEY')) return reply(503, { error: "Phone and email lookup isn't connected yet. Add your BatchData API key in Supabase secrets as BATCHDATA_API_KEY." });

  let p: Lookup;
  try { p = await req.json(); } catch { return reply(400, { error: 'Invalid request.' }); }
  const problem = validateLookup(p);
  if (problem) return reply(400, { error: problem });
  const key = lookupKey(p);
  const { data: cached } = await db.from('skip_trace_lookups').select('result').eq('query_key', key).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (cached) return reply(200, { ...cached.result, cached: true });
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await db.from('skip_trace_lookups').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if ((count ?? 0) >= Number(env('SKIP_TRACE_DAILY_LIMIT') || 50)) return reply(429, { error: 'Daily lookup limit reached.' });

  const r = await fetch('https://api.batchdata.com/api/v1/property/skip-trace', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env('BATCHDATA_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ requests: [{ propertyAddress: { street: p.street.trim(), city: p.city.trim(), state: p.state.trim().toUpperCase(), zip: p.zip.trim().slice(0, 5) } }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return reply(502, { error: 'BatchData rejected the lookup: ' + (data?.status?.message ?? r.status) });
  const result = extractContacts(data);
  await db.from('skip_trace_lookups').insert({ query_key: key, result });
  return reply(200, result);
});
