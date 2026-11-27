// Sends one approved outreach message through SendGrid, Twilio or Lob. Provider keys live only in Supabase secrets.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Payload = { channel: 'email' | 'sms' | 'mail'; to: string; name?: string; subject?: string; body: string; campaignKey: string; fromName?: string; fromAddress?: string };

export const normalize = (v: string) => {
  const s = String(v || '').trim().toLowerCase();
  return s.includes('@') ? s : s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
};

export function parseAddress(text: string) {
  const m = String(text || '').trim().match(/^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return null;
  return { address_line1: m[1], address_city: m[2], address_state: m[3].toUpperCase(), address_zip: m[4] };
}

export function easternHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));
}

export function validate(p: Payload, now = new Date()): string | null {
  if (!['email', 'sms', 'mail'].includes(p?.channel)) return 'Unknown channel.';
  if (!p.to || !p.body || !p.campaignKey) return 'Recipient, message and campaign are required.';
  if (p.body.length > (p.channel === 'sms' ? 1200 : 20000)) return 'Message is too long.';
  if (/guarantee|government|official notice|final notice|you are owed/i.test(p.body + (p.subject ?? ''))) return 'Message wording implies a guarantee or government notice.';
  if (p.channel !== 'mail') {
    const h = easternHour(now);
    if (h < 9 || h >= 20) return 'Quiet hours: email and text send between 9 AM and 8 PM Eastern.';
  }
  if (p.channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.to)) return 'Invalid email address.';
    if (!p.subject) return 'Email subject is required.';
    if (!/unsubscribe/i.test(p.body)) return 'Email must include an unsubscribe line.';
  }
  if (p.channel === 'sms') {
    if (normalize(p.to).length !== 10) return 'Enter a 10-digit US phone number.';
    if (!/reply stop/i.test(p.body)) return 'Text must include "Reply STOP to opt out".';
  }
  if (p.channel === 'mail') {
    if (!parseAddress(p.to)) return 'Mailing address must look like "123 Main St, Tampa, FL 33602".';
    if (!parseAddress(p.fromAddress ?? '')) return 'Business return address in Branding must look like "123 Main St, Tampa, FL 33602".';
  }
  return null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function sendEmail(p: Payload) {
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env('SENDGRID_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: p.to, name: p.name || undefined }] }],
      from: { email: env('SENDGRID_FROM_EMAIL'), name: p.fromName || undefined },
      subject: p.subject,
      content: [{ type: 'text/plain', value: p.body }],
    }),
  });
  if (!r.ok) throw new Error('SendGrid rejected the email (' + r.status + ').');
  return r.headers.get('x-message-id') ?? '';
}

async function sendSms(p: Payload) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(sid + ':' + env('TWILIO_AUTH_TOKEN')), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: '+1' + normalize(p.to), MessagingServiceSid: env('TWILIO_MESSAGING_SERVICE_SID'), Body: p.body }),
  });
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data.code === 21610 ? 'Recipient replied STOP; added to do-not-contact list.' : 'Twilio rejected the text (' + (data.code ?? r.status) + ').');
    (err as Error & { optedOut?: boolean }).optedOut = data.code === 21610;
    throw err;
  }
  return data.sid as string;
}

async function sendMail(p: Payload) {
  const html = `<html><body style="font-family:Georgia,serif;font-size:12pt;padding-top:3.5in">${escapeHtml(p.body).replace(/\n/g, '<br>')}</body></html>`;
  const r = await fetch('https://api.lob.com/v1/letters', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(env('LOB_API_KEY') + ':'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: { name: (p.name || 'Current Resident').slice(0, 40), ...parseAddress(p.to) },
      from: { name: (p.fromName || 'RealDealsPro').slice(0, 40), ...parseAddress(p.fromAddress!) },
      file: html,
      color: false,
      use_type: 'marketing',
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Lob rejected the letter: ' + (data.error?.message ?? r.status));
  return data.id as string;
}

const configured = {
  email: () => Boolean(env('SENDGRID_API_KEY') && env('SENDGRID_FROM_EMAIL')),
  sms: () => Boolean(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_MESSAGING_SERVICE_SID')),
  mail: () => Boolean(env('LOB_API_KEY')),
};

if (import.meta.main) Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only.' });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply(401, { error: 'Sign in to send.' });
  const allowed = env('OUTREACH_ALLOWED_EMAILS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(String(user.email).toLowerCase())) return reply(403, { error: 'This account is not allowed to send outreach.' });

  let p: Payload;
  try { p = await req.json(); } catch { return reply(400, { error: 'Invalid request.' }); }
  if (p?.channel === undefined && (p as unknown as { status?: boolean })?.status) {
    return reply(200, { email: configured.email(), sms: configured.sms(), mail: configured.mail(), mailMode: env('LOB_API_KEY').startsWith('test_') ? 'test' : 'live' });
  }
  const problem = validate(p);
  if (problem) return reply(400, { error: problem });
  if (!configured[p.channel]()) return reply(400, { error: 'The ' + p.channel + ' service is not connected yet.' });

  const contact = normalize(p.to);
  const { data: blocked } = await db.from('outreach_suppression').select('contact').eq('contact', contact).maybeSingle();
  if (blocked) return reply(409, { error: 'This contact opted out.', optedOut: true });
  const { data: dup } = await db.from('outreach_sends').select('id').eq('campaign_key', p.campaignKey).eq('status', 'sent').maybeSingle();
  if (dup) return reply(409, { error: 'This step was already sent.', alreadySent: true });
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await db.from('outreach_sends').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', since);
  if ((count ?? 0) >= Number(env('OUTREACH_DAILY_LIMIT') || 200)) return reply(429, { error: 'Daily sending limit reached.' });

  try {
    const providerId = await (p.channel === 'email' ? sendEmail(p) : p.channel === 'sms' ? sendSms(p) : sendMail(p));
    await db.from('outreach_sends').insert({ channel: p.channel, contact, campaign_key: p.campaignKey, provider_id: providerId, status: 'sent' });
    return reply(200, { ok: true, providerId });
  } catch (e) {
    const optedOut = (e as { optedOut?: boolean }).optedOut ?? false;
    if (optedOut) await db.from('outreach_suppression').insert({ contact, reason: 'Twilio STOP' });
    await db.from('outreach_sends').insert({ channel: p.channel, contact, campaign_key: p.campaignKey, status: optedOut ? 'blocked' : 'failed', detail: (e as Error).message });
    return reply(502, { error: (e as Error).message, optedOut });
  }
});
