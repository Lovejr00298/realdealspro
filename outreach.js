'use strict';
// Outreach campaigns: drafts and queues compliant email, text and mail steps. Sending is manual until a provider is connected.
const orCampaignKey = 'rdp_campaigns_v1';
const orLogKey = 'rdp_outreach_log_v1';
const orConsentKey = 'rdp_sms_consent_v1';
const orSuppressionKeys = ['rdp_suppression_v1', 'rdp_surplus_email_suppression'];
const orQuietStart = 9;
const orQuietEnd = 20;

function orRead(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
const orWrite = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const orNorm = v => { const s = String(v || '').trim().toLowerCase(); return s.includes('@') ? s : s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); };

function orSuppressed(contact) {
  const value = orNorm(contact);
  return Boolean(value) && orSuppressionKeys.some(key => orRead(key, []).map(orNorm).includes(value));
}

function orSuppress(contact, reason) {
  const value = orNorm(contact);
  if (!value) return;
  const list = orRead('rdp_suppression_v1', []);
  if (!list.includes(value)) orWrite('rdp_suppression_v1', [...list, value]);
  orLog('Opt-out recorded', value, reason);
  if (cloudSession) cloudRequest('/rest/v1/outreach_suppression', {method: 'POST', headers: {Prefer: 'resolution=ignore-duplicates'}, body: JSON.stringify({contact: value, reason: String(reason || '').slice(0, 200)})}).catch(() => {});
}

let orProviders = null;
async function orCloud(body) {
  await cloudRefresh();
  return cloudRequest('/functions/v1/outreach-send', {method: 'POST', body: JSON.stringify(body)});
}

async function orSyncCloud() {
  if (!cloudSession) { orProviders = null; return; }
  try {
    orProviders = await orCloud({status: true});
    const remote = await cloudRequest('/rest/v1/outreach_suppression?select=contact');
    const list = new Set(orRead('rdp_suppression_v1', []));
    remote.forEach(r => list.add(r.contact));
    orWrite('rdp_suppression_v1', [...list]);
  } catch (error) {
    orProviders = {error: error.message};
  }
}

function orCanSend(channel) {
  return Boolean(cloudSession && orProviders && orProviders[channel] === true);
}

async function orSendNow(i, quiet) {
  const q = orQueue[i];
  const b = ddBrand();
  try {
    await orCloud({channel: q.c.channel, to: q.contact, name: q.r.name, subject: q.subject, body: q.body, campaignKey: q.key, fromName: b.company || b.name, fromAddress: b.address});
    orLog('Sent', q.contact, q.key);
    return true;
  } catch (error) {
    if (/opted out|STOP/i.test(error.message)) orSuppress(q.contact, error.message);
    else if (/already sent/i.test(error.message)) orLog('Sent', q.contact, q.key);
    else orLog('Send failed', q.contact, q.c.name + ': ' + error.message);
    if (!quiet) alert(error.message);
    return false;
  } finally {
    if (!quiet) orRender();
  }
}

async function orSendAll() {
  const sendable = orQueue.map((q, i) => i).filter(i => orCanSend(orQueue[i].c.channel));
  if (!sendable.length) { alert('Nothing due can be sent automatically. Connect a sending service or sign in to cloud.'); return; }
  if (!confirm('Send ' + sendable.length + ' due messages now?')) return;
  const status = document.getElementById('orQueueInfo');
  let sent = 0;
  for (const [n, i] of sendable.entries()) {
    status.textContent = 'Sending ' + (n + 1) + ' of ' + sendable.length + '…';
    if (await orSendNow(i, true)) sent++;
    await new Promise(r => setTimeout(r, 1100));
  }
  orRender();
  alert(sent + ' of ' + sendable.length + ' messages sent. See the activity log for any failures.');
}

function orLog(action, contact, detail) {
  const log = orRead(orLogKey, []);
  log.unshift({at: new Date().toISOString(), action, contact: orNorm(contact), detail: detail || ''});
  orWrite(orLogKey, log.slice(0, 2000));
}

function orAudience(c) {
  if (c.audience === 'buyers') return investors.map(b => ({key: 'buyer:' + b.n, name: b.n, email: b.e, phone: b.p, mail: '', fields: {name: b.n, city: b.city || '', buybox: b.box || ''}}));
  if (c.audience === 'surplus') return surplus.filter(s => s.status !== 'Claimed').map(s => ({key: 'surplus:' + s.c + ':' + s.caseNo, name: s.owner, email: s.emailPreference?.state === 'opted-in' ? s.emailPreference.email : '', phone: '', mail: s.mail || '',
    fields: {name: s.owner, address: s.a, county: s.c, case: s.caseNo, amount: fmt(Math.max(0, s.sale - s.debt))}}));
  return leads.filter(l => scoreOf(l) >= (c.minScore || 0)).map(l => ({key: 'lead:' + String(l.a).toLowerCase(), name: l.owner, email: l.email, phone: l.phone, mail: l.mail,
    fields: {name: l.owner, address: l.a, county: l.c, city: l.city || ''}}));
}

function orFooter(channel, audience) {
  const b = ddBrand();
  const who = b.company || b.name;
  if (channel === 'sms') return '\n' + who + '. Reply STOP to opt out.';
  if (channel === 'email') return '\n\n—\n' + [who, b.address].join(' · ') + '\n' + (audience === 'buyers' ? 'You are receiving this because you asked to hear about investment properties.' : 'You are receiving this because of a public record related to you.') + ' Reply "unsubscribe" and we will not contact you again.';
  return '\n\n' + who + ' · ' + b.address + '\nTo stop receiving mail, contact us at ' + [b.phone, b.email].filter(Boolean).join(' or ') + '.';
}

function orMerge(text, r) {
  const b = ddBrand();
  const fields = {...r.fields, agent: b.agent, company: b.company || b.name, phone: b.phone, email: b.email};
  return text.replace(/\{(\w+)\}/g, (m, k) => fields[k] ?? m);
}

function orContact(channel, r) {
  return channel === 'email' ? r.email : channel === 'sms' ? r.phone : r.mail;
}

function orEasternHour() {
  return Number(new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23'}).format(new Date()));
}

function orDue() {
  const today = todayEastern();
  const sent = orRead(orLogKey, []).filter(e => e.action === 'Sent');
  const sentKeys = new Set(sent.map(e => e.detail));
  const due = [];
  const skipped = {suppressed: 0, noContact: 0, noConsent: 0};
  for (const c of orRead(orCampaignKey, [])) {
    if (c.status !== 'Active') continue;
    const sentToday = sent.filter(e => e.at.slice(0, 10) === today && e.detail.startsWith(c.id + '|')).length;
    let capacity = Math.max(0, c.dailyCap - sentToday);
    for (const r of orAudience(c)) {
      const contact = orContact(c.channel, r);
      if (!contact) { skipped.noContact++; continue; }
      if (orSuppressed(contact) || orSuppressed(r.email) || orSuppressed(r.phone)) { skipped.suppressed++; continue; }
      if (c.channel === 'sms' && !orRead(orConsentKey, {})[orNorm(contact)]) { skipped.noConsent++; continue; }
      for (let i = 0; i < c.steps.length; i++) {
        const key = c.id + '|' + r.key + '|' + i;
        if (sentKeys.has(key)) continue;
        const prev = i ? sent.find(e => e.detail === c.id + '|' + r.key + '|' + (i - 1)) : null;
        if (i && !prev) break;
        const dueDate = i ? new Date(Date.parse(prev.at) + c.steps[i].delay * 86400000).toISOString().slice(0, 10) : c.start;
        if (dueDate <= today && capacity > 0) { due.push({c, r, step: i, key, contact, body: orMerge(c.steps[i].body, r) + orFooter(c.channel, c.audience), subject: orMerge(c.subject || '', r)}); capacity--; }
        break;
      }
    }
  }
  return {due, skipped};
}

function orSaveCampaign(event) {
  event.preventDefault();
  const f = event.target;
  const status = document.getElementById('orStatus');
  try {
    const v = n => f.elements[n].value.trim();
    const b = ddBrand();
    if (!v('name')) throw Error('Name the campaign.');
    if (!b.company || !b.address) throw Error('Add your legal company name and postal address in Settings → Branding first.');
    const steps = [1, 2, 3].map(i => ({body: v('body' + i), delay: Number(v('delay' + i) || 0)})).filter(s => s.body);
    if (!steps.length) throw Error('Write at least the first message.');
    if (steps.some(s => !Number.isInteger(s.delay) || s.delay < 0 || s.delay > 90)) throw Error('Wait days must be whole numbers from 0 to 90.');
    if (v('channel') === 'email' && !v('subject')) throw Error('Add an email subject.');
    if (/guarantee|government|official notice|final notice|you are owed/i.test(steps.map(s => s.body).join(' ') + v('subject'))) throw Error('Remove wording that implies a guarantee, a government notice, or a confirmed amount owed.');
    const cap = Number(v('dailyCap'));
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) throw Error('Daily limit must be from 1 to 500.');
    if (!validDate(v('start'))) throw Error('Choose a start date.');
    const campaigns = orRead(orCampaignKey, []);
    campaigns.push({id: 'c' + Date.now(), name: v('name'), audience: v('audience'), minScore: Number(v('minScore') || 0), channel: v('channel'), subject: v('subject'),
      steps, dailyCap: cap, start: v('start'), status: 'Draft', created: new Date().toISOString()});
    orWrite(orCampaignKey, campaigns);
    orLog('Campaign created', '', v('name'));
    f.reset();
    f.elements.start.value = todayEastern();
    status.textContent = 'Campaign saved as a draft. Review and approve it below.';
    orRender();
  } catch (error) {
    status.textContent = error.message;
  }
}

function orApprove(i) {
  const campaigns = orRead(orCampaignKey, []);
  const c = campaigns[i];
  const checks = [...document.querySelectorAll('#orChecks' + i + ' input')];
  if (checks.some(x => !x.checked)) { alert('Confirm every compliance item before approving.'); return; }
  c.status = 'Active'; c.approved = new Date().toISOString();
  orWrite(orCampaignKey, campaigns);
  orLog('Campaign approved', '', c.name);
  orRender();
}

function orSetStatus(i, status) {
  const campaigns = orRead(orCampaignKey, []);
  if (status === 'Deleted') { if (!confirm('Delete this campaign?')) return; orLog('Campaign deleted', '', campaigns[i].name); campaigns.splice(i, 1); }
  else { campaigns[i].status = status; orLog('Campaign ' + status.toLowerCase(), '', campaigns[i].name); }
  orWrite(orCampaignKey, campaigns);
  orRender();
}

let orQueue = [];
function orOpen(i) {
  const q = orQueue[i];
  const h = orEasternHour();
  if (q.c.channel !== 'mail' && (h < orQuietStart || h >= orQuietEnd)) { alert('Quiet hours: send between 9 AM and 8 PM Eastern.'); return; }
  const href = q.c.channel === 'email' ? 'mailto:' + encodeURIComponent(q.contact) + '?subject=' + encodeURIComponent(q.subject) + '&body=' + encodeURIComponent(q.body)
    : 'sms:' + q.contact.replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent(q.body);
  window.open(href, '_blank');
}

function orMarkSent(i) {
  const q = orQueue[i];
  orLog('Sent', q.contact, q.key);
  orRender();
}

function orOptOut(i) {
  const q = orQueue[i];
  [q.contact, q.r.email, q.r.phone].forEach(x => orSuppress(x, 'From campaign ' + q.c.name));
  orRender();
}

function orRecordConsent(event) {
  event.preventDefault();
  const f = event.target;
  const phone = orNorm(f.elements.phone.value);
  const source = f.elements.source.value.trim();
  const status = document.getElementById('orConsentStatus');
  if (phone.length !== 10) { status.textContent = 'Enter a 10-digit US phone number.'; return; }
  if (source.length < 5) { status.textContent = 'Describe how and when written consent was given.'; return; }
  const consent = orRead(orConsentKey, {});
  consent[phone] = {source, at: new Date().toISOString()};
  orWrite(orConsentKey, consent);
  orLog('SMS consent recorded', phone, source);
  f.reset();
  status.textContent = 'Consent recorded.';
  orRender();
}

function orManualOptOut(event) {
  event.preventDefault();
  const value = event.target.elements.contact.value;
  if (!orNorm(value)) return;
  orSuppress(value, 'Manual entry');
  event.target.reset();
  document.getElementById('orConsentStatus').textContent = 'Added to do-not-contact list.';
  orRender();
}

function orExportMail() {
  const rows = orQueue.filter(q => q.c.channel === 'mail');
  if (!rows.length) { alert('No mail pieces are due.'); return; }
  const cell = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  const csv = ['name,mailing_address,campaign,step,letter'].concat(rows.map(q => [q.r.name, q.contact, q.c.name, q.step + 1, q.body].map(cell).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  a.download = 'mail-due-' + todayEastern() + '.csv';
  a.click();
  rows.forEach(q => orLog('Sent', q.contact, q.key));
  orRender();
}

function orRender() {
  const box = document.getElementById('orCampaigns');
  if (!box) return;
  const campaigns = orRead(orCampaignKey, []);
  const audienceLabel = {leads: 'Property owners', surplus: 'Surplus claimants', buyers: 'Buyers & investors'};
  box.innerHTML = campaigns.map((c, i) => `<article class="lead"><strong>${escapeHtml(c.name)}</strong> <span class="pill ${c.status === 'Active' ? 'surplus' : c.status === 'Paused' ? 'warm' : 'cold'}">${c.status}</span>
    <div class="small">${audienceLabel[c.audience]} · ${c.channel.toUpperCase()} · ${c.steps.length} step${c.steps.length > 1 ? 's' : ''} · up to ${c.dailyCap}/day · starts ${c.start} · ${orAudience(c).length} recipients</div>
    ${c.status === 'Draft' ? `<div id="orChecks${i}" class="small">
      <label><input type="checkbox" style="width:auto"> Messages are truthful, identify my business, and do not imply a government notice or guaranteed amount.</label>
      <label><input type="checkbox" style="width:auto"> ${c.channel === 'sms' ? 'Every recipient gave prior express written consent to texts, and I checked the National Do Not Call Registry where required.' : c.channel === 'email' ? 'Each email includes my postal address and a working opt-out, and opt-outs will be honored within 10 business days.' : 'Each letter includes my business name, address and a way to stop mail.'}</label>
      ${c.audience === 'surplus' ? '<label><input type="checkbox" style="width:auto"> An attorney confirmed this state\'s surplus solicitation, fee and timing rules for these claims.</label>' : ''}
      <button type="button" class="btn green" onclick="orApprove(${i})">Approve and activate</button></div>` : ''}
    <div class="flex">${c.status === 'Active' ? `<button type="button" onclick="orSetStatus(${i},'Paused')">Pause</button>` : c.status === 'Paused' ? `<button type="button" onclick="orSetStatus(${i},'Active')">Resume</button>` : ''}<button type="button" onclick="orSetStatus(${i},'Deleted')">Delete</button></div></article>`).join('') || '<p class="small">No campaigns yet.</p>';
  const {due, skipped} = orDue();
  orQueue = due;
  const h = orEasternHour();
  document.getElementById('orQueueInfo').textContent = due.length + ' messages due today · skipped: ' + skipped.suppressed + ' opted out, ' + skipped.noContact + ' missing contact, ' + skipped.noConsent + ' without text consent' +
    (h < orQuietStart || h >= orQuietEnd ? ' · Quiet hours now (email and text sending paused until 9 AM Eastern)' : '');
  document.getElementById('orQueue').innerHTML = due.map((q, i) => `<article class="lead"><div class="small">${escapeHtml(q.c.name)} · step ${q.step + 1} · ${q.c.channel.toUpperCase()}</div><strong>${escapeHtml(q.r.name || 'Unknown')}</strong> <span class="small">${escapeHtml(q.contact)}</span>
    <textarea rows="5" readonly>${escapeHtml((q.subject ? 'Subject: ' + q.subject + '\n\n' : '') + q.body)}</textarea>
    <div class="flex">${orCanSend(q.c.channel) ? `<button type="button" class="btn green" onclick="orSendNow(${i})">Send now</button>` : ''}${q.c.channel !== 'mail' ? `<button type="button" onclick="orOpen(${i})">Open ${q.c.channel === 'email' ? 'email' : 'text'}</button>` : ''}<button type="button" onclick="orMarkSent(${i})">Mark sent</button><button type="button" onclick="orOptOut(${i})">Opted out</button></div></article>`).join('');
  const log = orRead(orLogKey, []);
  document.getElementById('orLog').innerHTML = log.slice(0, 30).map(e => `<div class="log">${escapeHtml(new Date(e.at).toLocaleString('en-US', {timeZone: 'America/New_York'}))} — ${escapeHtml(e.action)} ${escapeHtml(e.contact)} <span class="small">${escapeHtml(e.detail.split('|')[0])}</span></div>`).join('') || '<p class="small">No activity yet.</p>';
  const p = orProviders;
  document.getElementById('orProviderInfo').textContent = !cloudSession ? 'Sending services: sign in to cloud (Settings) to send automatically. Until then, messages open in your email or text app.' :
    !p ? 'Checking sending services…' : p.error ? 'Sending services unavailable: ' + p.error :
    'Sending services — Email: ' + (p.email ? 'connected' : 'not connected') + ' · Text: ' + (p.sms ? 'connected' : 'not connected') + ' · Mail: ' + (p.mail ? 'connected' + (p.mailMode === 'test' ? ' (test mode, nothing is printed)' : '') : 'not connected');
  document.getElementById('orSuppressCount').textContent = orRead('rdp_suppression_v1', []).length + ' contacts on the do-not-contact list · ' + Object.keys(orRead(orConsentKey, {})).length + ' text consents recorded';
}

function outreachShown() {
  const start = document.querySelector('#orForm [name=start]');
  if (!start.value) start.value = todayEastern();
  orRender();
  orSyncCloud().then(orRender);
}
