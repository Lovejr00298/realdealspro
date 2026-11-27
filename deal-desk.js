'use strict';
// Deal review queue, white-label branding and legal document templates.
const ddBrandKey = 'rdp_brand_v1';
const ddReviewKey = 'rdp_review_v1';
let ddShown = [];
const ddDefaultBrand = {name: 'SQPR RealDealsPro™', tagline: 'Surplus Funds & Off-Market Deal System', agent: '', company: '', phone: '', email: '', address: '', color: '#0b1e3a', logo: ''};

function ddRead(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function ddBrand() {
  return {...ddDefaultBrand, ...ddRead(ddBrandKey, {})};
}

function ddApplyBrand() {
  const b = ddBrand();
  document.title = b.name + ' - ' + b.tagline;
  const h1 = document.querySelector('header h1');
  h1.innerHTML = (b.logo ? `<img src="${escapeHtml(b.logo)}" alt="" style="height:28px;vertical-align:middle;margin-right:8px;border-radius:6px">` : '') + escapeHtml(b.name);
  document.querySelector('header p').textContent = b.tagline;
  let style = document.getElementById('ddBrandStyle');
  if (!style) { style = document.createElement('style'); style.id = 'ddBrandStyle'; document.head.append(style); }
  const color = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : ddDefaultBrand.color;
  style.textContent = `header,.btn:not(.green):not(.blue):not(.ghost):not(.orange),.tabs button.on{background:${color}}.tabs button.on{border-color:${color}}`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', color);
}

function ddBrandForm() {
  const b = ddBrand();
  const form = document.getElementById('ddBrandForm');
  for (const key of ['name', 'tagline', 'agent', 'company', 'phone', 'email', 'address', 'color']) form.elements[key].value = b[key];
  document.getElementById('ddLogoPreview').innerHTML = b.logo ? `<img src="${escapeHtml(b.logo)}" alt="Current logo" style="max-height:48px">` : '<span class="small">No logo uploaded.</span>';
}

async function ddSaveBrand(event) {
  event.preventDefault();
  const form = event.target;
  const status = document.getElementById('ddBrandStatus');
  try {
    const b = ddBrand();
    for (const key of ['name', 'tagline', 'agent', 'company', 'phone', 'email', 'address', 'color']) b[key] = form.elements[key].value.trim();
    if (!b.name) throw Error('Enter a brand name.');
    if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw Error('Enter a valid email address.');
    const file = form.elements.logo.files[0];
    if (file) {
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw Error('Logo must be a PNG, JPG, WebP or SVG image.');
      if (file.size > 300 * 1024) throw Error('Logo must be under 300 KB.');
      b.logo = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    }
    localStorage.setItem(ddBrandKey, JSON.stringify(b));
    form.elements.logo.value = '';
    ddApplyBrand();
    ddBrandForm();
    status.textContent = 'Branding saved.';
  } catch (error) {
    status.textContent = error.message;
  }
}

function ddResetBrand() {
  if (!confirm('Restore the default branding?')) return;
  localStorage.removeItem(ddBrandKey);
  ddApplyBrand();
  ddBrandForm();
  document.getElementById('ddBrandStatus').textContent = 'Default branding restored.';
}

// ---- Deal review queue ----
function ddSurplusScore(s) {
  const amount = Math.max(0, (s.sale || 0) - (s.debt || 0));
  const factors = [];
  factors.push(amount >= 50000 ? ['Surplus $50k+', 40] : amount >= 25000 ? ['Surplus $25k+', 30] : amount >= 10000 ? ['Surplus $10k+', 20] : amount >= 5000 ? ['Surplus $5k+', 10] : ['Surplus under $5k', 0]);
  const deadline = deadlineOf(s);
  if (deadline) {
    factors.push(['Verified source and deadline', 20]);
    const days = Math.round((Date.parse(deadline) - Date.parse(todayEastern())) / 86400000);
    if (days > 30) factors.push(['More than 30 days to deadline', 20]);
    else if (days >= 15) factors.push(['15–30 days to deadline', 10]);
    else if (days >= 0) factors.push(['Deadline within 14 days', 5]);
    else factors.push(['Planning date has passed', -40]);
  }
  if (String(s.owner || '').trim() && !/^former owner/i.test(s.owner)) factors.push(['Owner identified', 10]);
  return {amount, factors, score: Math.max(0, Math.min(100, factors.reduce((t, [, p]) => t + p, 0)))};
}

function ddDeals() {
  const deals = [];
  leads.forEach((l, i) => {
    const factors = acceptanceFactors(l).filter(f => f.applies).map(f => [f.label, f.points]);
    const value = Number(l.estimatedValue) || 0;
    deals.push({id: 'lead:' + String(l.a).trim().toLowerCase(), kind: 'Property', index: i, title: l.a, county: l.c, owner: l.owner,
      score: scoreOf(l), factors, detail: [l.propertyType, value ? 'Value ' + fmt(value) : '', l.equity != null ? 'Equity ' + l.equity + '%' : ''].filter(Boolean).join(' · ')});
  });
  surplus.forEach((s, i) => {
    if (s.status === 'Claimed') return;
    const r = ddSurplusScore(s);
    deals.push({id: 'surplus:' + s.c + ':' + s.caseNo, kind: 'Surplus', index: i, title: s.a, county: s.c, owner: s.owner,
      score: r.score, factors: r.factors, detail: 'Case ' + s.caseNo + ' · ' + fmt(r.amount) + ' estimated · ' + caseState(s)});
  });
  const review = ddRead(ddReviewKey, {});
  return deals.map(d => ({...d, review: review[d.id] || {status: 'New'}})).sort((a, b) => b.score - a.score);
}

function ddSetReview(rank, status) {
  const id = ddShown[rank]?.id;
  if (!id) return;
  const review = ddRead(ddReviewKey, {});
  const note = document.getElementById('ddNote' + rank).value.trim();
  if (status === 'Rejected' && !note) { alert('Add a short note explaining why this deal is rejected.'); return; }
  review[id] = {status, note, at: new Date().toISOString()};
  localStorage.setItem(ddReviewKey, JSON.stringify(review));
  ddRenderReview();
}

function ddBuyersFor(d) {
  if (d.kind !== 'Property') return [];
  return investors.filter(b => matchesBuyer(b, leads[d.index]));
}

function ddShareText(d) {
  const b = ddBrand();
  const lead = leads[d.index];
  return ['New off-market opportunity from ' + (b.company || b.name),
    lead.a + (lead.c ? ' (' + lead.c + ' County)' : ''),
    d.detail, 'Deal score ' + d.score + '/100 — ' + d.factors.map(([label]) => label).join(', '),
    'Reply for details. Information is believed reliable but not guaranteed; verify independently.',
    [b.agent, b.phone, b.email].filter(Boolean).join(' · '),
    'Reply STOP to stop receiving deal alerts.'].filter(Boolean).join('\n');
}

function ddShare(rank) {
  const id = ddShown[rank]?.id;
  const d = ddDeals().find(x => x.id === id);
  const box = document.getElementById('ddShare' + rank);
  if (!d || d.review.status !== 'Approved') { alert('Approve this deal before sharing it.'); return; }
  const buyers = ddBuyersFor(d).filter(b => !ddSuppressed(b.e) && !ddSuppressed(b.p));
  const text = ddShareText(d);
  const emails = buyers.map(b => b.e).filter(Boolean);
  box.innerHTML = `<div class="greenBox" style="margin-top:8px"><b>${buyers.length} matching buyer${buyers.length === 1 ? '' : 's'}</b>
    <div class="small">${buyers.map(b => escapeHtml(b.n)).join(', ') || 'No buyers match this county or city. Add buyers on the Buyers tab.'}</div>
    <textarea id="ddShareText${rank}" rows="7" readonly>${escapeHtml(text)}</textarea>
    ${emails.length ? `<a class="btn blue" style="text-align:center;text-decoration:none" href="mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent('Off-market deal: ' + d.title)}&body=${encodeURIComponent(text)}">Email matching buyers (BCC)</a>` : ''}
    <button type="button" class="btn ghost" onclick="navigator.clipboard.writeText(document.getElementById('ddShareText${rank}').value).then(()=>this.textContent='Copied')">Copy message</button></div>`;
  if (buyers.length) ddSetReviewQuiet(id, 'Shared');
}

function ddSetReviewQuiet(id, status) {
  const review = ddRead(ddReviewKey, {});
  review[id] = {...review[id], status, at: new Date().toISOString()};
  localStorage.setItem(ddReviewKey, JSON.stringify(review));
}

function ddSuppressed(contact) {
  const value = String(contact || '').trim().toLowerCase();
  return Boolean(value) && ddRead('rdp_suppression_v1', []).some(entry => entry.value === value);
}

function ddRenderReview() {
  const list = document.getElementById('ddReviewList');
  if (!list) return;
  const status = document.getElementById('ddStatusFilter').value;
  const kind = document.getElementById('ddKindFilter').value;
  const min = Number(document.getElementById('ddMinScore').value) || 0;
  const deals = ddDeals();
  const counts = deals.reduce((c, d) => (c[d.review.status] = (c[d.review.status] || 0) + 1, c), {});
  document.getElementById('ddCounts').textContent = ['New', 'Approved', 'Shared', 'Rejected'].map(s => s + ' ' + (counts[s] || 0)).join(' · ');
  const shown = ddShown = deals.filter(d => (!status || d.review.status === status) && (!kind || d.kind === kind) && d.score >= min);
  list.innerHTML = shown.map((d, rank) => {
    const cls = d.score >= 80 ? 'hot' : d.score >= 50 ? 'warm' : 'cold';
    return `<article class="lead"><div class="small">#${rank + 1} · ${d.kind} · ${escapeHtml(d.county || '')} County</div>
      <strong>${escapeHtml(d.title)}</strong> <span class="pill ${cls}">Deal score ${d.score}/100</span> <span class="pill ${d.review.status === 'Approved' || d.review.status === 'Shared' ? 'surplus' : d.review.status === 'Rejected' ? 'urgent' : 'cold'}">${escapeHtml(d.review.status)}</span>
      <div class="small">${escapeHtml(d.detail)}${d.owner ? ' · Owner: ' + escapeHtml(d.owner) : ''}</div>
      <div class="small">${d.factors.map(([label, points]) => escapeHtml(label) + ' (' + (points >= 0 ? '+' : '') + points + ')').join(' · ') || 'No scoring signals recorded.'}</div>
      <input id="ddNote${rank}" placeholder="Review note (required to reject)" value="${escapeHtml(d.review.note || '')}">
      <div class="flex"><button type="button" onclick="ddSetReview(${rank},'Approved')">Approve</button><button type="button" onclick="ddSetReview(${rank},'Rejected')">Reject</button><button type="button" onclick="ddSetReview(${rank},'New')">Reset</button>
      ${d.kind === 'Property' ? `<button type="button" onclick="ddShare(${rank})" ${d.review.status === 'Approved' || d.review.status === 'Shared' ? '' : 'disabled title="Approve first"'}>Share with buyers</button>` : ''}</div>
      <div id="ddShare${rank}"></div></article>`;
  }).join('') || '<p class="small">No deals match these filters.</p>';
}

// ---- Legal document templates ----
const ddStates = {
  FL: {name: 'Florida', rules: [
    ['Mortgage foreclosure surplus — Fla. Stat. 45.032 and 45.033', 'http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0000-0099/0045/Sections/0045.033.html',
      'An assignment must be in writing, include a financial disclosure and a statement that the owner does not need an attorney or other representative, specify all consideration, be filed with the court within 60 days after the certificate of disbursements, and total compensation may not exceed 12% of the surplus.'],
    ['Tax deed surplus — Fla. Stat. 197.582', 'http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0100-0199/0197/Sections/0197.582.html',
      'The clerk holds the surplus for 120 days from the notice date; claimants must file a notarized statement of claim within that period.'],
    ['Unclaimed property — Fla. Stat. 717.135', 'http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0717/Sections/0717.135.html',
      'Claimant representatives must use the Department of Financial Services recovery or purchase agreement forms; total fees may not exceed 30% of the claimed amount. Do not use these templates for Chapter 717 claims.']]},
  GA: {name: 'Georgia', rules: [['Tax sale excess funds — O.C.G.A. 48-4-5', 'https://law.justia.com/codes/georgia/title-48/chapter-4/article-1/section-48-4-5/',
    'Confirm current notice, claim, assignment and fee rules with a Georgia attorney before contracting.']]},
  NC: {name: 'North Carolina', rules: [['Foreclosure sale surplus — N.C.G.S. 105-374 and 1-339.71', 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-374.html',
    'Disputed surplus is held by the clerk until rights are established in a special proceeding. Confirm assignment and fee rules with a North Carolina attorney.']]},
  SC: {name: 'South Carolina', rules: [['Tax sale overages — S.C. Code 12-51-130', 'https://www.scstatehouse.gov/code/t12c051.php',
    'The delinquent tax collector retains excess funds and notifies the former owner. Confirm assignment and fee rules with a South Carolina attorney.']]}
};

const ddDocs = {
  surplusAgreement: {title: 'Surplus Funds Recovery Services Agreement', fields: ['client', 'caseNo', 'county', 'property', 'saleDate', 'salePrice', 'surplus', 'assessed', 'debt', 'feePct', 'saleType']},
  surplusPoa: {title: 'Limited Power of Attorney — Surplus Funds Claim', fields: ['client', 'caseNo', 'county', 'property', 'surplus']},
  purchase: {title: 'Real Estate Purchase and Sale Agreement (As-Is Cash)', fields: ['seller', 'buyer', 'property', 'county', 'price', 'deposit', 'closeDate', 'inspectionDays']},
  assignment: {title: 'Assignment of Purchase and Sale Agreement', fields: ['seller', 'buyer', 'assignee', 'property', 'contractDate', 'assignFee', 'deposit']},
  jv: {title: 'Joint Venture Agreement (Single Transaction)', fields: ['partner', 'property', 'county', 'splitPct', 'duties']},
  nda: {title: 'Buyer Confidentiality and Non-Circumvention Agreement', fields: ['buyer', 'property', 'termMonths']}
};

const ddFieldLabels = {client: 'Client / former owner name', caseNo: 'Case or tax deed number', county: 'County', property: 'Property address', saleDate: 'Sale date',
  salePrice: 'Sale price $', surplus: 'Surplus amount $', assessed: 'Assessed value $', debt: 'Approximate debt $', feePct: 'Fee % of surplus', saleType: 'Sale type',
  seller: 'Seller name', buyer: 'Buyer name', assignee: 'Assignee (end buyer)', price: 'Purchase price $', deposit: 'Earnest money deposit $', closeDate: 'Closing date',
  inspectionDays: 'Inspection period (days)', contractDate: 'Original contract date', assignFee: 'Assignment fee $', partner: 'Joint venture partner name',
  splitPct: 'Your share of net profit %', duties: 'Partner responsibilities', termMonths: 'Term (months)'};
const ddNumberFields = new Set(['salePrice', 'surplus', 'assessed', 'debt', 'feePct', 'price', 'deposit', 'inspectionDays', 'assignFee', 'splitPct', 'termMonths']);

function ddDocFields() {
  const doc = ddDocs[document.getElementById('ddDocType').value];
  document.getElementById('ddDocFields').innerHTML = doc.fields.map(name => {
    if (name === 'saleType') return `<label class="small">${ddFieldLabels[name]}<select name="saleType"><option value="mortgage">Mortgage foreclosure sale</option><option value="taxdeed">Tax deed / tax sale</option></select></label>`;
    const type = ddNumberFields.has(name) ? 'number" min="0" step="any' : /Date$/.test(name) ? 'date' : 'text';
    return `<label class="small">${ddFieldLabels[name]}<input name="${name}" type="${type}" required></label>`;
  }).join('');
  ddRenderRules();
}

function ddRenderRules() {
  const st = ddStates[document.getElementById('ddDocState').value];
  document.getElementById('ddRules').innerHTML = '<b>' + st.name + ' rules to confirm</b><ul class="small">' + st.rules.map(([label, url, text]) =>
    `<li><a href="${url}" target="_blank" rel="noopener">${escapeHtml(label)}</a> — ${escapeHtml(text)}</li>`).join('') + '</ul>';
}

function ddMoney(v) { return '$' + Number(v || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}); }

function ddDocBody(kind, state, v, b) {
  const you = b.company || b.name;
  const st = ddStates[state].name;
  const sig = (...names) => '<div class="sig">' + names.map(n => `<div><div class="line"></div>${escapeHtml(n)}<br>Date: ____________</div>`).join('') + '</div>';
  const notary = `<h3>Notary Acknowledgment</h3><p>State of ${st}, County of ______________. Sworn to (or affirmed) and subscribed before me by means of ☐ physical presence or ☐ online notarization, this ____ day of __________, 20__, by ______________________, who is personally known to me or produced ______________________ as identification.</p><p>Notary Public: ______________________ My commission expires: __________</p>`;
  if (kind === 'surplusAgreement') {
    const fee = Number(v.feePct);
    const feeAmt = Number(v.surplus) * fee / 100;
    const flMortgage = state === 'FL' && v.saleType === 'mortgage';
    return `<p>This Agreement is between <b>${escapeHtml(v.client)}</b> ("Client") and <b>${escapeHtml(you)}</b> ("Company") regarding surplus funds from the ${v.saleType === 'taxdeed' ? 'tax deed / tax sale' : 'foreclosure sale'} in Case No. <b>${escapeHtml(v.caseNo)}</b>, ${escapeHtml(v.county)} County, ${st}, for the property at <b>${escapeHtml(v.property)}</b>.</p>
    <h3>1. Important notice to Client</h3><p><b>You do not need an attorney or any other representative to recover surplus funds. You may file a claim directly with the Clerk of Court at no cost other than any filing or service fees the Clerk requires.</b> You may cancel this Agreement as provided in Section 7.</p>
    <h3>2. Financial disclosure</h3><table><tr><td>Sale date</td><td>${escapeHtml(v.saleDate)}</td></tr><tr><td>Sale price</td><td>${ddMoney(v.salePrice)}</td></tr><tr><td>Assessed value (may be lower than actual market value)</td><td>${ddMoney(v.assessed)}</td></tr><tr><td>Approximate debt encumbering the property</td><td>${ddMoney(v.debt)}</td></tr><tr><td>Approximate equity</td><td>${ddMoney(Math.max(0, v.assessed - v.debt))}</td></tr><tr><td>Surplus reported by the Clerk (subject to change and to timely lienholder claims)</td><td>${ddMoney(v.surplus)}</td></tr></table>
    <h3>3. Services</h3><p>Company will research the case record, locate and prepare claim documents, coordinate filings with the Clerk and the court, and keep Client informed. Company is not a law firm and does not give legal advice. If a hearing or contested proceeding is required, Client may retain an attorney of Client's choosing.</p>
    <h3>4. Compensation — all consideration</h3><p>Client agrees to pay Company <b>${fee}%</b> of the surplus actually received (estimated ${ddMoney(feeAmt)} based on the amount above). This is the total compensation Company will receive. Client pays nothing up front and nothing if no funds are recovered. No other fees, costs or consideration are charged${flMortgage ? ', and total compensation does not exceed 12% of the surplus as required by Fla. Stat. 45.033(3)(d)' : ''}.</p>
    <h3>5. Payment</h3><p>Funds will be disbursed as ordered by the court or Clerk. If funds are paid to Client directly, Client will pay Company's fee within 10 days of receipt.</p>
    ${flMortgage ? '<h3>6. Court filing</h3><p>If this Agreement is used as an assignment of the right to collect surplus, it must be filed with the court on or before 60 days after the filing of the certificate of disbursements (Fla. Stat. 45.033(3)(b)), and is payable only after timely filed claims of subordinate lienholders.</p>' : '<h3>6. Deadlines</h3><p>Client understands that claim deadlines apply and that Company does not guarantee recovery or the amount recovered.</p>'}
    <h3>7. Cancellation</h3><p>Client may cancel this Agreement without penalty by written notice to Company within 3 business days after signing.</p>
    <h3>8. Other terms</h3><p>Governed by the laws of ${st}. This is the entire agreement and may be changed only in writing signed by both parties.</p>
    ${sig(v.client + ' (Client)', you + (b.agent ? ' — by ' + b.agent : '') + ' (Company)')}${notary}`;
  }
  if (kind === 'surplusPoa') return `<p>I, <b>${escapeHtml(v.client)}</b>, appoint <b>${escapeHtml(b.agent || you)}</b> of ${escapeHtml(you)} as my limited agent and attorney-in-fact solely to: (a) request and obtain records relating to surplus funds in Case No. <b>${escapeHtml(v.caseNo)}</b>, ${escapeHtml(v.county)} County, ${st}, property at ${escapeHtml(v.property)} (reported surplus ${ddMoney(v.surplus)}); (b) prepare and file claim documents on my behalf; and (c) communicate with the Clerk of Court regarding this claim.</p><p>This power does <b>not</b> authorize my agent to endorse, cash or receive funds payable to me, to sell or encumber any property, or to act in any other matter. Funds must be paid as the court or Clerk directs. This power ends when the claim is paid or denied, or when I revoke it in writing.</p><p>I understand that I do not need an attorney or other representative to recover surplus funds.</p>${sig(v.client + ' (Principal)')}<p>Witnesses (if required in ${st}):</p>${sig('Witness 1', 'Witness 2')}${notary}`;
  if (kind === 'purchase') return `<p><b>${escapeHtml(v.seller)}</b> ("Seller") agrees to sell and <b>${escapeHtml(v.buyer)}</b> and/or assigns ("Buyer") agrees to buy the property at <b>${escapeHtml(v.property)}</b>, ${escapeHtml(v.county)} County, ${st}, including all fixtures (the "Property").</p>
    <h3>1. Price</h3><p>Purchase price ${ddMoney(v.price)}, paid in cash or other immediately available funds at closing. Earnest money ${ddMoney(v.deposit)} will be deposited with a licensed title company or closing attorney within 3 business days.</p>
    <h3>2. Condition</h3><p>The Property is sold AS-IS. Buyer has ${Number(v.inspectionDays)} days to inspect and may cancel in writing during that period and receive a full refund of the deposit. Seller will disclose all known material defects as required by ${st} law.</p>
    <h3>3. Title and closing</h3><p>Seller will convey marketable title by general warranty deed, free of liens except those paid at closing. Closing on or before ${escapeHtml(v.closeDate)} at a title company or attorney chosen by Buyer. Costs are allocated per local custom unless stated: ______________________.</p>
    <h3>4. Assignment disclosure</h3><p>Buyer may assign this Agreement. <b>Seller understands that Buyer may assign this contract to another buyer for a fee, and that Buyer is not representing Seller as a real estate agent.</b> Seller is encouraged to obtain independent legal advice and a professional valuation.</p>
    <h3>5. Default</h3><p>If Buyer defaults, Seller's sole remedy is to keep the deposit. If Seller defaults, Buyer may seek specific performance or a refund of the deposit.</p>
    <h3>6. Other terms</h3><p>Governed by ${st} law. Entire agreement; changes only in signed writing. Time is of the essence.</p>${sig(v.seller + ' (Seller)', v.buyer + ' (Buyer)')}`;
  if (kind === 'assignment') return `<p><b>${escapeHtml(v.buyer)}</b> ("Assignor") assigns to <b>${escapeHtml(v.assignee)}</b> ("Assignee") all rights under the Purchase and Sale Agreement dated ${escapeHtml(v.contractDate)} between ${escapeHtml(v.seller)} (Seller) and Assignor for <b>${escapeHtml(v.property)}</b>.</p>
    <h3>1. Assignment fee</h3><p>Assignee will pay Assignor ${ddMoney(v.assignFee)} at closing through the closing agent. Assignee will also deposit ${ddMoney(v.deposit)} as non-refundable earnest money with the closing agent within 2 business days, credited at closing.</p>
    <h3>2. Assumption</h3><p>Assignee assumes all of Assignor's obligations under the Agreement. Assignor makes no warranty of the Property's condition, value or title; Assignee relies on its own inspection.</p>
    <h3>3. Disclosure</h3><p>The assignment fee will be disclosed to the Seller and on the settlement statement as required by ${st} law and the closing agent.</p>${sig(v.buyer + ' (Assignor)', v.assignee + ' (Assignee)')}`;
  if (kind === 'jv') return `<p>${escapeHtml(you)} ("Company") and <b>${escapeHtml(v.partner)}</b> ("Partner") agree to work together on one transaction: <b>${escapeHtml(v.property)}</b>, ${escapeHtml(v.county)} County, ${st}.</p>
    <h3>1. Duties</h3><p>Company: deal sourcing, contract and analysis. Partner: ${escapeHtml(v.duties)}.</p>
    <h3>2. Profit split</h3><p>Net profit (after documented closing costs) is split ${Number(v.splitPct)}% to Company and ${100 - Number(v.splitPct)}% to Partner, paid through the closing agent.</p>
    <h3>3. Licensing</h3><p>Neither party will perform services that require a real estate license unless properly licensed.</p>
    <h3>4. Term</h3><p>This Agreement ends when the transaction closes or is cancelled. It does not create a general partnership.</p>${sig(you + ' (Company)', v.partner + ' (Partner)')}`;
  if (kind === 'nda') return `<p><b>${escapeHtml(v.buyer)}</b> ("Buyer") will receive confidential information from ${escapeHtml(you)} ("Company") about <b>${escapeHtml(v.property)}</b> and other properties Company presents.</p>
    <h3>1. Confidentiality</h3><p>Buyer will not share the property address, seller identity, or deal terms with anyone other than its lenders and advisors.</p>
    <h3>2. Non-circumvention</h3><p>For ${Number(v.termMonths)} months, Buyer will not contact the seller or the seller's representatives about a property Company presented except through Company.</p>
    <h3>3. No warranty</h3><p>Information is provided as-is. Buyer will verify all facts independently.</p>${sig(v.buyer + ' (Buyer)', you + ' (Company)')}`;
  return '';
}

function ddGenerateDoc(event) {
  event.preventDefault();
  const status = document.getElementById('ddDocStatus');
  try {
    const kind = document.getElementById('ddDocType').value;
    const state = document.getElementById('ddDocState').value;
    const v = Object.fromEntries(new FormData(document.getElementById('ddDocForm')));
    for (const name of ddDocs[kind].fields) {
      if (!String(v[name] ?? '').trim()) throw Error('Complete: ' + ddFieldLabels[name] + '.');
      if (ddNumberFields.has(name) && (!Number.isFinite(Number(v[name])) || Number(v[name]) < 0)) throw Error(ddFieldLabels[name] + ' must be a non-negative number.');
    }
    if (kind === 'surplusAgreement') {
      if (Number(v.feePct) > 100) throw Error('Fee % cannot exceed 100.');
      if (state === 'FL' && v.saleType === 'mortgage' && Number(v.feePct) > 12) throw Error('Florida mortgage foreclosure surplus assignments are limited to 12% total compensation (Fla. Stat. 45.033(3)(d)).');
    }
    if (kind === 'jv' && Number(v.splitPct) > 100) throw Error('Profit share cannot exceed 100%.');
    const b = ddBrand();
    const title = ddDocs[kind].title;
    const contact = [b.company || b.name, b.address, b.phone, b.email].filter(Boolean).map(escapeHtml).join(' · ');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Georgia,serif;max-width:780px;margin:24px auto;padding:0 18px;line-height:1.45;color:#111}h1{font-size:22px;text-align:center}h3{font-size:15px;margin:16px 0 4px}table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:5px}.draft{border:2px solid #b91c1c;color:#b91c1c;padding:8px;font-family:Arial,sans-serif;font-size:13px}.sig{display:flex;gap:30px;flex-wrap:wrap;margin-top:28px}.sig>div{flex:1;min-width:220px}.line{border-bottom:1px solid #000;height:34px}.hdr{text-align:center;font-family:Arial,sans-serif;font-size:12px}@media print{.noprint{display:none}}</style></head><body>
      ${b.logo ? `<div style="text-align:center"><img src="${escapeHtml(b.logo)}" alt="" style="max-height:60px"></div>` : ''}<div class="hdr">${contact}</div>
      <p class="draft"><b>DRAFT TEMPLATE — NOT LEGAL ADVICE.</b> Generated ${new Date().toLocaleDateString()} for use in ${ddStates[state].name}. Laws change and differ by county and claim type. Have a licensed ${ddStates[state].name} attorney review and approve this document before anyone signs it.</p>
      <h1>${escapeHtml(title)}</h1>${ddDocBody(kind, state, v, b)}
      <p class="noprint"><button onclick="print()">Print or save as PDF</button></p></body></html>`;
    const url = URL.createObjectURL(new Blob([html], {type: 'text/html'}));
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url; a.download = title.replace(/[^A-Za-z0-9]+/g, '-') + '.html'; a.click();
    }
    status.textContent = title + ' generated. Review it with an attorney before use.';
  } catch (error) {
    status.textContent = error.message;
  }
}

function dealDeskInit() {
  ddApplyBrand();
  ddBrandForm();
  ddDocFields();
}
dealDeskInit();
