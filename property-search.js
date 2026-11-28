'use strict';
const PS_FL_URL = 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query';
const PS_NC_URL = 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/0/query';
const PS_FL_COUNTIES = ['Alachua','Baker','Bay','Bradford','Brevard','Broward','Calhoun','Charlotte','Citrus','Clay','Collier','Columbia','Miami-Dade','DeSoto','Dixie','Duval','Escambia','Flagler','Franklin','Gadsden','Gilchrist','Glades','Gulf','Hamilton','Hardee','Hendry','Hernando','Highlands','Hillsborough','Holmes','Indian River','Jackson','Jefferson','Lafayette','Lake','Lee','Leon','Levy','Liberty','Madison','Manatee','Marion','Martin','Monroe','Nassau','Okaloosa','Okeechobee','Orange','Osceola','Palm Beach','Pasco','Pinellas','Polk','Putnam','St. Johns','St. Lucie','Santa Rosa','Sarasota','Seminole','Sumter','Suwannee','Taylor','Union','Volusia','Wakulla','Walton','Washington'];
const PS_NC_COUNTIES = ['Alamance','Alexander','Alleghany','Anson','Ashe','Avery','Beaufort','Bertie','Bladen','Brunswick','Buncombe','Burke','Cabarrus','Caldwell','Camden','Carteret','Caswell','Catawba','Chatham','Cherokee','Chowan','Clay','Cleveland','Columbus','Craven','Cumberland','Currituck','Dare','Davidson','Davie','Duplin','Durham','Edgecombe','Forsyth','Franklin','Gaston','Gates','Graham','Granville','Greene','Guilford','Halifax','Harnett','Haywood','Henderson','Hertford','Hoke','Hyde','Iredell','Jackson','Johnston','Jones','Lee','Lenoir','Lincoln','Macon','Madison','Martin','McDowell','Mecklenburg','Mitchell','Montgomery','Moore','Nash','New Hanover','Northampton','Onslow','Orange','Pamlico','Pasquotank','Pender','Perquimans','Person','Pitt','Polk','Randolph','Richmond','Robeson','Rockingham','Rowan','Rutherford','Sampson','Scotland','Stanly','Stokes','Surry','Swain','Transylvania','Tyrrell','Union','Vance','Wake','Warren','Washington','Watauga','Wayne','Wilkes','Wilson','Yadkin','Yancey'];
const PS_FL_TYPES = {sfr: u => u === '001', condo: u => u === '004', mobile: u => u === '002', multi: u => u === '003' || u === '008',
  vacant: u => ['000', '010', '040', '070'].includes(u), commercial: u => u >= '011' && u <= '039'};
const PS_FL_PAGE = 2000;
const PS_FL_MAX_PAGES = 5;
const PS_MAX_RESULTS = 200;
const PS_FL_USE = {'000':'Vacant residential','001':'Single family','002':'Mobile home','003':'Multi-family 10+','004':'Condominium','008':'Multi-family <10','010':'Vacant commercial','040':'Vacant industrial','070':'Vacant institutional'};
// GA and SC have no public statewide parcel layer with owners, so these are county assessor services.
const PS_COUNTY_SOURCES = {
  GA: {
    Chatham: {url: 'https://pub.sagis.org/arcgis/rest/services/OpenData/Parcels/FeatureServer/27/query', id: 'PIN', address: 'PropAddress_Full', city: 'PropAddress_City', zip: 'PropAddress_Zip', owner: 'Owner',
      mail: ['Mailing_Address', 'Mailing_City', 'Mailing_State', 'Mailing_Zip'], mailStreet: 'Mailing_Address', mailState: 'Mailing_State', value: 'FairMarketValue', building: 'FMV_Building', year: 'YearBuilt', use: 'Property_Use', salePrice: 'Sale_Price', saleYear: 'Sale_YY'},
    Cobb: {url: 'https://gis.cobbcounty.gov/gisserver/rest/services/tax/taxassessorsdaily/MapServer/0/query', page: 1000, id: 'PIN', address: 'SITUS_ADDR', owner: 'OWNER_NAM1',
      mail: ['OWNER_ADDR', 'OWNER_CITY', 'OWNER_STAT', 'OWNER_ZIP'], mailStreet: 'OWNER_ADDR', mailState: 'OWNER_STAT', value: 'FMV_TOTAL', building: 'FMV_BLDG', use: 'CLASS'},
    DeKalb: {url: 'https://dcgis.dekalbcountyga.gov/mapping/rest/services/Tax_Parcels_Assessment_View/FeatureServer/2/query', id: 'PARCELID', address: 'SITEADDRESS', city: 'CITY', zip: 'ZIP', owner: 'OWNERNME1',
      mail: ['PSTLADDRESS', 'PSTLCITY', 'PSTLSTATE', 'PSTLZIP5'], mailStreet: 'PSTLADDRESS', mailState: 'PSTLSTATE', value: 'TOTAPR1', building: 'BUILD_VALUE', year: 'RESYRBLT', sqft: 'RESFLRAREA', use: 'CLASSDSCRP'},
    Fulton: {url: 'https://gismaps.fultoncountyga.gov/arcgispub/rest/services/OpenData/Tax_Parcels/MapServer/0/query', id: 'ParcelID', address: 'Address', owner: 'Owner',
      mail: ['OwnerAddr1', 'OwnerAddr2'], mailStreet: 'OwnerAddr1', mailStateFrom: 'OwnerAddr2', use: 'ClassCode'},
    Gwinnett: {url: 'https://gis3.gwinnettcounty.com/mapvis/rest/services/GISDataBrowser/GC_Parcel/MapServer/6/query', id: 'PIN', address: 'LOCADDR', city: 'LOCCITY', zip: 'LOCZIP', owner: 'OWNER1',
      mail: ['MAILADDR', 'MAILCITY', 'MAILSTAT', 'MAILZIP'], mailStreet: 'MAILADDR', mailState: 'MAILSTAT', value: 'TOTVAL1', building: 'DWLGVAL1', use: 'PCDESC'}
  },
  SC: {
    Horry: {url: 'https://www.horrycountysc.gov/parcelapp/rest/services/HorryCountyGISApp/MapServer/24/query', id: 'TMS', owner: 'OwnerName',
      mail: ['OwnerStreet', 'OwnerCity', 'OwnerState', 'OwnerZip'], mailState: 'OwnerState', value: 'MarketProp', building: 'MarketImprv', use: 'LandUseCode', saleDate: 'SaleDate'},
    York: {url: 'https://services1.arcgis.com/2AGLxyiJoNiVHKwq/arcgis/rest/services/Parcels/FeatureServer/0/query', id: 'TAXMAPID', address: 'PropertyAddress', owner: 'Owner1',
      mail: ['MailAddr1', 'MailCity', 'MailState', 'MailZip'], mailStreet: 'MailAddr1', mailState: 'MailState', value: 'AprTotVal', building: 'AprBldgVal', year: 'YearBuilt', sqft: 'FinishedSQFT',
      use: 'LandUseDesc', salePrice: 'SalePrice', saleDate: 'DateSold', homestead: 'HOMESTEAD'}
  }
};
const PS_ESTATE = ['ESTATE','HEIRS','TRUST','DECEASED'];
const PS_CORP = [' LLC',' INC',' CORP',' LTD',' LP',' COMPANY'];
const psSavedKey = 'rdp_saved_searches_v1';
// Freddie Mac PMMS 30-year fixed annual averages (approximate), used only to estimate a remaining loan balance.
const PS_RATES = {1990: 10.1, 1991: 9.3, 1992: 8.4, 1993: 7.3, 1994: 8.4, 1995: 7.9, 1996: 7.8, 1997: 7.6, 1998: 6.9, 1999: 7.4, 2000: 8.1, 2001: 7.0, 2002: 6.5,
  2003: 5.8, 2004: 5.8, 2005: 5.9, 2006: 6.4, 2007: 6.3, 2008: 6.0, 2009: 5.0, 2010: 4.7, 2011: 4.5, 2012: 3.7, 2013: 4.0, 2014: 4.2, 2015: 3.9, 2016: 3.7,
  2017: 4.0, 2018: 4.5, 2019: 3.9, 2020: 3.1, 2021: 3.0, 2022: 5.3, 2023: 6.8, 2024: 6.7, 2025: 6.6};
let psResults = [];
let psMap = null;
let psMarkers = null;
let psLeafletLoading = null;

const psQuote = value => String(value).replaceAll("'", "''");
const psLikeAny = (field, words) => '(' + words.map(word => field + " LIKE '%" + word + "%'").join(' OR ') + ')';

function psForm() {
  const form = new FormData(document.getElementById('psForm'));
  const text = name => String(form.get(name) || '').trim().toUpperCase();
  const num = name => {
    const raw = String(form.get(name) || '').trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw Error('Enter a valid non-negative number.');
    return value;
  };
  return {
    state: form.get('state'), county: form.get('county'), city: text('city'), zip: text('zip'),
    street: text('street'), owner: text('owner'), type: form.get('type'),
    absentee: form.has('absentee'), outOfState: form.has('outOfState'), noHomestead: form.has('noHomestead'),
    estate: form.has('estate'), corporate: form.has('corporate'), ownedYears: String(form.get('ownedYears') || ''), minEquity: num('minEquity'),
    minValue: num('minValue'), maxValue: num('maxValue'), maxYear: num('maxYear')
  };
}

function psValidate(c) {
  if (!c.county) throw Error('Select a county.');
  if (!c.city && !c.zip && !c.street && !c.owner) throw Error('Enter a city, ZIP code, street, or owner name to narrow the search.');
  if (c.zip && !/^\d{5}$/.test(c.zip)) throw Error('Enter a five-digit ZIP code.');
  if (c.state === 'FL' && c.street && !c.city && !c.zip && !c.owner) throw Error('Add a city or ZIP code to search by street in Florida.');
  for (const value of [c.city, c.street, c.owner]) {
    if (value && !/^[A-Z0-9 .,'&-]{2,60}$/.test(value)) throw Error('Use letters and numbers only (at least two characters).');
  }
  const source = PS_COUNTY_SOURCES[c.state]?.[c.county];
  if (source) {
    for (const [value, field, label] of [[c.city, source.city, 'City'], [c.zip, source.zip, 'ZIP code'], [c.street, source.address, 'Street']]) {
      if (value && !field) throw Error(label + ' search is not available for ' + c.county + ' County. Search by ' + (source.address ? 'street or ' : '') + 'owner name.');
    }
    if (c.type && c.type !== 'vacant') throw Error('Only the vacant land type filter is available for ' + c.county + ' County.');
  }
  if (c.minValue != null && c.maxValue != null && c.minValue > c.maxValue) throw Error('Minimum value is above the maximum.');
}

function psWhere(c) {
  const w = [];
  if (c.state === 'FL') {
    w.push('CO_NO = ' + (PS_FL_COUNTIES.indexOf(c.county) + 11));
    // The statewide service times out on most filters, so only fast fields go to the server; psMatchFL applies the rest.
    if (c.city) w.push("PHY_CITY = '" + psQuote(c.city) + "'");
    if (c.owner) w.push("OWN_NAME LIKE '" + psQuote(c.owner) + "%'");
  } else {
    w.push("cntyname = '" + psQuote(c.county) + "'");
    if (c.city) w.push("UPPER(scity) = '" + psQuote(c.city) + "'");
    if (c.zip) w.push("szip LIKE '" + c.zip + "%'");
    if (c.street) w.push("UPPER(siteadd) LIKE '%" + psQuote(c.street) + "%'");
    if (c.owner) w.push("UPPER(ownname) LIKE '" + psQuote(c.owner) + "%'");
    if (c.type === 'vacant') w.push('improvval = 0');
    if (c.absentee) w.push('mailadd <> siteadd');
    if (c.outOfState) w.push("NOT (mstate = 'NC' OR mcity LIKE '% NC %' OR mcity LIKE '% NC')");
    if (c.estate) w.push(psLikeAny('UPPER(ownname)', PS_ESTATE));
    if (c.corporate) w.push(psLikeAny('UPPER(ownname)', PS_CORP));
    if (c.ownedYears) w.push('saledate ' + (c.ownedYears === 'lt5' ? '>= ' : '<= ') + "date '" + (new Date().getFullYear() - (c.ownedYears === 'lt5' ? 5 : Number(c.ownedYears))) + "-01-01'");
    if (c.minValue != null) w.push('parval >= ' + c.minValue);
    if (c.maxValue != null) w.push('parval <= ' + c.maxValue);
    if (c.maxYear != null) w.push('structyear > 0 AND structyear <= ' + c.maxYear);
  }
  return w.join(' AND ');
}

function psOwnedMatch(choice, saleYear) {
  if (!choice) return true;
  if (!saleYear) return false;
  const years = new Date().getFullYear() - saleYear;
  return choice === 'lt5' ? years < 5 : years >= Number(choice);
}

// Estimated equity: assume an 80% 30-year loan at the average rate of the purchase year, amortized to today.
// Cash buyers, refinances and second mortgages are unknown, so this is a rough guide until a paid mortgage data source is connected.
function psEquity(p) {
  if (!p.value || !p.saleYear) return null;
  const now = new Date();
  const months = (now.getFullYear() - p.saleYear) * 12 + now.getMonth();
  let balance = 0;
  if (months < 360) {
    if (!p.lastSalePrice) return null;
    const rate = (PS_RATES[p.saleYear] ?? (p.saleYear < 1990 ? 10 : 6.5)) / 1200;
    const loan = p.lastSalePrice * 0.8;
    const growth = (1 + rate) ** 360;
    balance = Math.max(0, loan * (growth - (1 + rate) ** Math.max(0, months)) / (growth - 1));
  }
  const amount = Math.round(p.value - balance);
  return {amount, pct: Math.round(amount / p.value * 100), years: now.getFullYear() - p.saleYear};
}

function psMatchFL(c, p) {
  const owner = p.owner.toUpperCase();
  return (!c.zip || p.zip === c.zip)
    && (!c.street || p.address.toUpperCase().includes(c.street))
    && (!c.type || (p.state === 'FL' ? !PS_FL_TYPES[c.type] || PS_FL_TYPES[c.type](p.useCode || '') : c.type === 'vacant' && p.vacant))
    && (!c.absentee || p.absentee) && (!c.outOfState || p.outOfState) && (!c.noHomestead || p.noHomestead)
    && psOwnedMatch(c.ownedYears, p.saleYear)
    && (c.minEquity == null || (psEquity(p)?.pct ?? -1) >= c.minEquity)
    && (!c.estate || PS_ESTATE.some(word => owner.includes(word)))
    && (!c.corporate || PS_CORP.some(word => owner.includes(word)))
    && (c.minValue == null || (p.value || 0) >= c.minValue)
    && (c.maxValue == null || (p.value || 0) <= c.maxValue)
    && (c.maxYear == null || (p.yearBuilt > 0 && p.yearBuilt <= c.maxYear));
}

const PS_FL_FIELDS = 'PARCEL_ID,CO_NO,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,OWN_NAME,OWN_ADDR1,OWN_ADDR2,OWN_CITY,OWN_STATE,OWN_ZIPCD,JV,JV_HMSTD,TOT_LVG_AR,ACT_YR_BLT,DOR_UC,SALE_PRC1,SALE_YR1,SALE_MO1';
const PS_TILE = 0.015;

async function psZipExtent(zip) {
  const url = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?' +
    new URLSearchParams({postal: zip, countryCode: 'USA', maxLocations: '1', outFields: 'Region', f: 'json'});
  let hit;
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
    hit = (await response.json()).candidates?.[0];
  } catch {}
  if (!hit?.extent) throw Error('Could not look up that ZIP code. Search by city instead.');
  if (hit.attributes?.Region && hit.attributes.Region !== 'Florida') throw Error('ZIP ' + zip + ' is not in Florida.');
  return hit.extent;
}

// ZIP filters time out on the statewide service, so ZIP searches read small map tiles covering the ZIP and filter locally.
async function psSearchFLZip(c, status) {
  const e = await psZipExtent(c.zip);
  const tiles = [];
  for (let x = e.xmin; x < e.xmax; x += PS_TILE) for (let y = e.ymin; y < e.ymax; y += PS_TILE) tiles.push([x, y, Math.min(x + PS_TILE, e.xmax), Math.min(y + PS_TILE, e.ymax)]);
  const coNo = PS_FL_COUNTIES.indexOf(c.county) + 11;
  const matches = new Map();
  let done = 0;
  const readTile = async tile => {
    for (let page = 0, more = true; page < 3 && more; page++) {
      const data = await psFetch(psUrl('FL', {where: '1=1', geometry: tile.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: PS_FL_FIELDS, orderByFields: 'OBJECTID', returnGeometry: 'false', returnCentroid: 'true', resultOffset: String(page * PS_FL_PAGE), resultRecordCount: String(PS_FL_PAGE)}));
      for (const f of data.features) {
        if (f.attributes.CO_NO !== coNo) continue;
        const p = psNormalizeFL(f);
        if ((!c.city || p.city.toUpperCase() === c.city) && (!c.owner || p.owner.toUpperCase().startsWith(c.owner)) && psMatchFL(c, p)) matches.set(p.id, p);
      }
      more = Boolean(data.exceededTransferLimit);
    }
    status.textContent = 'Scanning ZIP ' + c.zip + ' (' + ++done + ' of ' + tiles.length + ' areas)…';
  };
  const queue = [...tiles];
  await Promise.all(Array.from({length: 4}, async () => { while (queue.length) await readTile(queue.shift()); }));
  const features = [...matches.values()].map(p => ({...p, score: psScore(p)})).sort((a, b) => b.score - a.score);
  return {features: features.slice(0, PS_MAX_RESULTS), truncated: features.length > PS_MAX_RESULTS};
}

async function psSearchFL(c, status) {
  if (c.zip) return psSearchFLZip(c, status);
  const where = psWhere(c);
  const matches = [];
  let more = true;
  for (let page = 0; page < PS_FL_MAX_PAGES && more && matches.length < PS_MAX_RESULTS; page++) {
    if (page) status.textContent = 'Scanning more ' + c.county + ' County records (' + (page * PS_FL_PAGE).toLocaleString() + ' checked)…';
    const data = await psFetch(psUrl('FL', {where, outFields: PS_FL_FIELDS,
      orderByFields: 'OBJECTID', returnGeometry: 'false', returnCentroid: 'true', resultOffset: String(page * PS_FL_PAGE), resultRecordCount: String(PS_FL_PAGE)}));
    matches.push(...data.features.map(psNormalizeFL).filter(p => psMatchFL(c, p)));
    more = Boolean(data.exceededTransferLimit);
  }
  return {features: matches.slice(0, PS_MAX_RESULTS), truncated: more || matches.length > PS_MAX_RESULTS};
}

function psCountyWhere(s, c) {
  const w = [s.owner + ' IS NOT NULL'];
  if (c.city) w.push('UPPER(' + s.city + ") = '" + psQuote(c.city) + "'");
  if (c.zip) w.push(s.zip + " LIKE '" + c.zip + "%'");
  if (c.street) w.push('UPPER(' + s.address + ") LIKE '%" + psQuote(c.street) + "%'");
  if (c.owner) w.push('UPPER(' + s.owner + ") LIKE '" + psQuote(c.owner) + "%'");
  return w.join(' AND ');
}

function psNormalizeCounty(state, county, s, f) {
  const a = f.attributes || {};
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const get = key => key ? a[key] : null;
  const num = key => {
    const value = get(key);
    return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  };
  const words = text => new Set(text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').split(' ').filter(Boolean));
  const parcel = clean(get(s.id));
  const address = clean(get(s.address));
  const mailStreet = clean(get(s.mailStreet));
  const mailState = s.mailState ? clean(get(s.mailState)) : ((clean(get(s.mailStateFrom)).match(/\s([A-Z]{2})\s+\d{5}/) || [])[1] || '');
  const sold = s.saleDate && get(s.saleDate) ? new Date(get(s.saleDate)) : null;
  const saleYear = sold ? sold.getUTCFullYear() : num(s.saleYear);
  const ring = f.geometry?.rings?.[0] || [];
  const site = words(address);
  const p = {
    id: state + '-' + county + '-' + parcel, state, county, parcelId: parcel,
    address: address || 'Parcel ' + parcel, city: clean(get(s.city)), zip: clean(get(s.zip)).slice(0, 5),
    owner: clean(get(s.owner)) || 'Unknown', mail: s.mail.map(key => clean(a[key])).filter(Boolean).join(', '), mailState,
    value: num(s.value) || null, sqft: num(s.sqft) || null, yearBuilt: num(s.year) || null, use: clean(get(s.use)) || 'Use unknown',
    lastSalePrice: num(s.salePrice) || null, lastSale: sold ? sold.toISOString().slice(0, 10) : (saleYear ? String(saleYear) : ''),
    lat: ring.length ? ring.reduce((sum, point) => sum + point[1], 0) / ring.length : undefined,
    lng: ring.length ? ring.reduce((sum, point) => sum + point[0], 0) / ring.length : undefined,
    absentee: Boolean(address && mailStreet && [...words(mailStreet)].some(word => !site.has(word))),
    outOfState: Boolean(mailState && mailState !== state),
    noHomestead: s.homestead ? get(s.homestead) !== 'Y' : false,
    vacant: num(s.building) === 0, saleYear: saleYear || null
  };
  p.source = s.url + '?' + new URLSearchParams({f: 'json', where: s.id + " = '" + psQuote(get(s.id)) + "'", outFields: '*', returnGeometry: 'false'});
  return p;
}

async function psSearchCounty(c, status) {
  const s = PS_COUNTY_SOURCES[c.state][c.county];
  const fields = [s.id, s.address, s.city, s.zip, s.owner, ...s.mail, s.mailStreet, s.mailState, s.mailStateFrom, s.value, s.building, s.year, s.sqft, s.use, s.salePrice, s.saleDate, s.saleYear, s.homestead];
  const size = s.page || 2000;
  const matches = [];
  let more = true;
  for (let page = 0; page < 3 && more && matches.length < PS_MAX_RESULTS; page++) {
    if (page) status.textContent = 'Scanning more ' + c.county + ' County records (' + (page * size).toLocaleString() + ' checked)…';
    const data = await psFetch(s.url + '?' + new URLSearchParams({f: 'json', where: psCountyWhere(s, c), outFields: [...new Set(fields.filter(Boolean))].join(','),
      orderByFields: 'OBJECTID', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0001', resultOffset: String(page * size), resultRecordCount: String(size)}));
    matches.push(...data.features.map(f => psNormalizeCounty(c.state, c.county, s, f)).filter(p => psMatchFL(c, p)));
    more = Boolean(data.exceededTransferLimit);
  }
  return {features: matches.slice(0, PS_MAX_RESULTS), truncated: more || matches.length > PS_MAX_RESULTS};
}

async function psOwnerLookup(county, parcelId, ownerName) {
  const base = county.replace(/, [A-Z]{2}$/, '');
  const all = String(ownerName || '').toUpperCase().replace(/[^A-Z0-9&' -]/g, ' ').split(/\s+/).filter(Boolean);
  const cut = all.findIndex(word => /\d/.test(word));
  const words = cut < 0 ? all : all.slice(0, cut);
  const names = words.length >= 2 ? [...new Set([words[0] + ' ' + words[1], words[words.length - 1] + ' ' + words[0]])] : [];
  const like = field => '(' + names.map(name => field + " LIKE '" + psQuote(name) + "%'").join(' OR ') + ')';
  const parcels = parcelId ? [...new Set([parcelId, parcelId.replace(/[^A-Za-z0-9]/g, ''), parcelId.replace(/^R/, '')])] : [];
  let query, idWhere, nameWhere;
  if (county.endsWith(', GA')) {
    const s = PS_COUNTY_SOURCES.GA[base];
    if (!s) return {supported: false, parcel: null, matches: []};
    const fields = [...new Set([s.id, s.address, s.city, s.zip, s.owner, ...s.mail].filter(Boolean))].join(',');
    query = where => psFetch(s.url + '?' + new URLSearchParams({f: 'json', where, outFields: fields, returnGeometry: 'false', resultRecordCount: '10'}))
      .then(data => data.features.map(f => psNormalizeCounty('GA', base, s, f)));
    idWhere = id => s.id + " = '" + psQuote(id) + "'";
    nameWhere = like('UPPER(' + s.owner + ')');
  } else {
    const index = PS_FL_COUNTIES.indexOf(base);
    if (index < 0) return {supported: false, parcel: null, matches: []};
    const co = ' AND CO_NO = ' + (index + 11);
    query = where => psFetch(psUrl('FL', {where: where + co, outFields: PS_FL_FIELDS, returnGeometry: 'false', resultRecordCount: '10'})).then(data => data.features.map(psNormalizeFL));
    idWhere = id => "PARCEL_ID = '" + psQuote(id) + "'";
    nameWhere = like('OWN_NAME');
  }
  let parcel = null;
  for (const id of parcels) {
    [parcel] = await query(idWhere(id));
    if (parcel) break;
  }
  const matches = names.length ? (await query(nameWhere)).filter(p => p.parcelId !== parcel?.parcelId) : [];
  return {supported: true, parcel: parcel || null, matches};
}

function psUrl(state, params) {
  const base = state === 'FL' ? PS_FL_URL : PS_NC_URL;
  return base + '?' + new URLSearchParams({f: 'json', outSR: '4326', ...params});
}

function psFlags(p) {
  const flags = [];
  const owner = String(p.owner || '').toUpperCase();
  if (p.absentee) flags.push(['Absentee owner', 20]);
  if (p.outOfState) flags.push(['Out-of-state owner', 15]);
  if (p.noHomestead) flags.push(['No homestead exemption', 10]);
  if (PS_ESTATE.some(word => owner.includes(word))) flags.push(['Estate / trust / heirs', 25]);
  if (p.vacant) flags.push(['Vacant land', 10]);
  const equity = psEquity(p);
  if (equity?.pct >= 50) flags.push(['Est. equity ' + equity.pct + '%', 15]);
  else if (!equity && p.saleYear && new Date().getFullYear() - p.saleYear >= 15) flags.push(['Owned 15+ years', 15]);
  if (PS_CORP.some(word => owner.includes(word))) flags.push(['Company owner', 0]);
  return flags;
}

function psNormalizeFL(f) {
  const a = f.attributes || {};
  const point = f.centroid || {};
  const mail = [a.OWN_ADDR1, a.OWN_ADDR2, a.OWN_CITY, a.OWN_STATE, a.OWN_ZIPCD].map(v => String(v ?? '').trim()).filter(Boolean).join(', ');
  const p = {
    id: 'FL-' + a.PARCEL_ID, state: 'FL', county: PS_FL_COUNTIES[a.CO_NO - 11] || '', parcelId: a.PARCEL_ID,
    address: a.PHY_ADDR1 || 'Parcel ' + a.PARCEL_ID, city: a.PHY_CITY || '', zip: a.PHY_ZIPCD ? String(a.PHY_ZIPCD) : '',
    owner: a.OWN_NAME || 'Unknown', mail, mailState: a.OWN_STATE || '',
    value: a.JV || null, sqft: a.TOT_LVG_AR || null, yearBuilt: a.ACT_YR_BLT || null,
    use: PS_FL_USE[a.DOR_UC] || ('Use code ' + (a.DOR_UC || 'unknown')), useCode: a.DOR_UC,
    lastSalePrice: a.SALE_PRC1 || null, lastSale: a.SALE_YR1 ? a.SALE_YR1 + (a.SALE_MO1 ? '-' + String(a.SALE_MO1).padStart(2, '0') : '') : '',
    lat: point.y, lng: point.x,
    absentee: Boolean(a.OWN_ADDR1 && a.PHY_ADDR1 && a.OWN_ADDR1.trim() !== a.PHY_ADDR1.trim()),
    outOfState: Boolean(a.OWN_STATE && a.OWN_STATE !== 'FL'),
    noHomestead: !a.JV_HMSTD, vacant: ['000', '010', '040', '070'].includes(a.DOR_UC),
    saleYear: a.SALE_YR1 || null
  };
  p.source = psUrl('FL', {where: "PARCEL_ID = '" + psQuote(a.PARCEL_ID) + "' AND CO_NO = " + a.CO_NO, outFields: '*', returnGeometry: 'false'});
  return p;
}

function psNormalizeNC(f) {
  const a = f.attributes || {};
  const g = f.geometry || {};
  const mailState = a.mstate || ((String(a.mcity || '').match(/\s([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/) || [])[1] || '');
  const sold = a.saledate ? new Date(a.saledate) : null;
  const p = {
    id: 'NC-' + a.cntyname + '-' + a.parno, state: 'NC', county: a.cntyname || '', parcelId: a.parno,
    address: a.siteadd || 'Parcel ' + a.parno, city: a.scity || '', zip: a.szip || '',
    owner: a.ownname || 'Unknown', mail: [a.mailadd, a.mcity, a.mstate, a.mzip].map(v => String(v ?? '').trim()).filter(Boolean).join(', '), mailState,
    value: a.parval || null, sqft: null, yearBuilt: a.structyear || null, use: a.parusedesc || 'Use unknown',
    lastSalePrice: null, lastSale: sold ? sold.toISOString().slice(0, 10) : '',
    lat: g.y, lng: g.x,
    absentee: Boolean(a.mailadd && a.siteadd && a.mailadd.trim() !== a.siteadd.trim()),
    outOfState: Boolean(mailState && mailState !== 'NC'), noHomestead: false,
    vacant: a.improvval === 0, saleYear: sold ? sold.getUTCFullYear() : null
  };
  p.source = psUrl('NC', {where: "cntyname = '" + psQuote(a.cntyname) + "' AND parno = '" + psQuote(a.parno) + "'", outFields: '*', returnGeometry: 'false'});
  return p;
}

function psScore(p) {
  return Math.min(100, psFlags(p).reduce((sum, [, points]) => sum + points, 0));
}

async function psFetch(url, attempts = 2) {
  let response;
  try {
    response = await fetch(url, {signal: AbortSignal.timeout(30000)});
  } catch {
    if (attempts > 1) return psFetch(url, attempts - 1);
    throw Error('The property records service did not respond. Narrow the search and try again.');
  }
  if (!response.ok) throw Error('Property records could not be retrieved. Try again.');
  const data = await response.json();
  if (data.error || !Array.isArray(data.features)) throw Error('The records service could not run this search. Narrow it with a city or ZIP code and try again.');
  return data;
}

async function psSearch(event) {
  event?.preventDefault();
  const status = document.getElementById('psStatus');
  const button = document.querySelector('#psForm button[type=submit]');
  if (button.disabled) return;
  try {
    const c = psForm();
    psValidate(c);
    button.disabled = true;
    status.textContent = 'Searching ' + c.county + ' County records…';
    let found;
    if (c.state === 'FL') {
      found = await psSearchFL(c, status);
    } else if (PS_COUNTY_SOURCES[c.state]) {
      found = await psSearchCounty(c, status);
    } else {
      const data = await psFetch(psUrl('NC', {where: psWhere(c), outFields: 'parno,cntyname,siteadd,scity,szip,ownname,mailadd,mcity,mstate,mzip,parval,improvval,structyear,parusedesc,saledate', returnGeometry: 'true', resultRecordCount: String(PS_MAX_RESULTS)}));
      found = {features: data.features.map(psNormalizeNC), truncated: Boolean(data.exceededTransferLimit)};
    }
    const seen = new Set();
    psResults = found.features
      .filter(p => p.parcelId && !seen.has(p.id) && seen.add(p.id))
      .map(p => ({...p, score: psScore(p)}))
      .sort((a, b) => b.score - a.score);
    psRender();
    status.textContent = psResults.length
      ? 'Found ' + psResults.length + ' properties' + (found.truncated ? ' (first ' + PS_MAX_RESULTS + ' shown — add filters to narrow).' : '.') + ' Ranked by opportunity signals.'
      : 'No matching properties found.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function psCard(p, index) {
  const flags = psFlags(p).map(([label]) => `<span class="pill warm">${escapeHtml(label)}</span>`).join(' ');
  const facts = [p.city, p.zip, p.use, p.value ? 'Value ' + fmt(p.value) : '', p.sqft ? p.sqft.toLocaleString() + ' sq ft' : '',
    p.yearBuilt ? 'Built ' + p.yearBuilt : '', p.lastSale ? 'Last sale ' + p.lastSale + (p.lastSalePrice ? ' for ' + fmt(p.lastSalePrice) : '') : ''].filter(Boolean);
  const equity = psEquity(p);
  if (equity) facts.push('Est. equity ' + fmt(equity.amount) + ' (' + equity.pct + '%, owned ' + equity.years + ' yrs)');
  return `<article class="lead" id="psCard${index}"><strong>${escapeHtml(p.address)}</strong> <span class="pill ${p.score >= 40 ? 'hot' : p.score >= 20 ? 'warm' : 'cold'}">Opportunity ${p.score}/100</span>
  <div class="small">${escapeHtml(facts.join(' · '))}</div>
  <div class="small">Owner: ${escapeHtml(p.owner)}${p.mail ? ' · Mailing: ' + escapeHtml(p.mail) : ''}</div>
  <div>${flags}</div>
  <div class="flex" style="margin-top:6px"><button type="button" onclick="psSaveLead(${index})">Save as lead</button>${p.state === 'FL' ? `<button type="button" onclick="psComps(${index})">Comps &amp; value</button>` : ''}<a class="small" href="${escapeHtml(p.source)}" target="_blank" rel="noopener" style="align-self:center">Official record</a></div>
  <div id="psComps${index}"></div></article>`;
}

function psRender() {
  document.getElementById('psResults').innerHTML = psResults.map(psCard).join('');
  document.getElementById('psBulk').classList.toggle('hidden', !psResults.length);
  psDrawMap();
}

function psLoadLeaflet() {
  if (window.L) return Promise.resolve();
  if (psLeafletLoading) return psLeafletLoading;
  psLeafletLoading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = '';
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; js.crossOrigin = '';
    js.onload = resolve; js.onerror = () => { psLeafletLoading = null; reject(Error('Map could not load.')); };
    document.head.append(css, js);
  });
  return psLeafletLoading;
}

async function psDrawMap() {
  const box = document.getElementById('psMap');
  try { await psLoadLeaflet(); } catch { box.textContent = 'Map unavailable. Results are listed below.'; return; }
  if (!psMap) {
    psMap = L.map(box).setView([28.1, -81.6], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'}).addTo(psMap);
    psMarkers = L.layerGroup().addTo(psMap);
  }
  psMap.invalidateSize();
  psMarkers.clearLayers();
  const points = [];
  psResults.forEach((p, index) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    points.push([p.lat, p.lng]);
    const color = p.score >= 40 ? '#dc2626' : p.score >= 20 ? '#f59e0b' : '#2563eb';
    L.circleMarker([p.lat, p.lng], {radius: 7, color, fillColor: color, fillOpacity: .8, weight: 1})
      .bindTooltip(p.address + ' · ' + p.score + '/100')
      .on('click', () => document.getElementById('psCard' + index)?.scrollIntoView({behavior: 'smooth', block: 'center'}))
      .addTo(psMarkers);
  });
  if (points.length) psMap.fitBounds(points, {padding: [20, 20], maxZoom: 16});
}

function psLeadFrom(p) {
  const lead = {
    a: p.address, c: p.county, city: p.city, state: p.state, parcelId: p.parcelId,
    propertyType: p.vacant ? 'Vacant Land' : p.useCode === '001' ? 'House' : '',
    owner: p.owner, mail: p.mail, equity: psEquity(p)?.pct ?? null, vault: 0,
    absentee: +(p.absentee || p.outOfState), vacant: 0, tax: 0, fore: 0,
    estimatedValue: p.value, source: p.source,
    notes: ['Property Search', p.use, ...psFlags(p).map(([label]) => label), p.value ? 'Assessed value ' + fmt(p.value) : ''].filter(Boolean).join(' · ')
  };
  lead.score = scoreOf(lead);
  lead.status = labelOf(lead.score);
  return lead;
}

function psIsSaved(p) {
  return leads.some(l => (l.parcelId && l.parcelId === p.parcelId && l.c === p.county) || l.a.trim().toUpperCase() === p.address.trim().toUpperCase() && (l.city || '').toUpperCase() === p.city.toUpperCase());
}

function psSaveLead(index) {
  const p = psResults[index];
  const status = document.getElementById('psStatus');
  if (psIsSaved(p)) { status.textContent = 'This property is already in Property Leads.'; return; }
  leads.unshift(psLeadFrom(p));
  try { save(); } catch { leads.shift(); status.textContent = 'The lead could not be saved on this device.'; return; }
  render();
  status.textContent = 'Saved ' + p.address + ' to Property Leads.';
}

function psSaveAll() {
  const fresh = psResults.filter(p => !psIsSaved(p)).map(psLeadFrom);
  const status = document.getElementById('psStatus');
  if (!fresh.length) { status.textContent = 'All of these properties are already saved.'; return; }
  const before = leads.length;
  leads.unshift(...fresh);
  try { save(); } catch { leads.splice(0, leads.length - before); status.textContent = 'The leads could not be saved on this device.'; return; }
  render();
  status.textContent = 'Saved ' + fresh.length + ' properties to Property Leads.';
}

function psCsvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) || /^[=+\-@]/.test(text) ? '"' + text.replace(/^([=+\-@])/, "'$1").replaceAll('"', '""') + '"' : text;
}

function psExportCsv() {
  const header = ['Opportunity score', 'Property address', 'City', 'ZIP', 'County', 'State', 'Parcel ID', 'Owner', 'Mailing address', 'Assessed value', 'Living sq ft', 'Year built', 'Use', 'Last sale', 'Last sale price', 'Signals'];
  const rows = psResults.map(p => [p.score, p.address, p.city, p.zip, p.county, p.state, p.parcelId, p.owner, p.mail, p.value, p.sqft, p.yearBuilt, p.use, p.lastSale, p.lastSalePrice, psFlags(p).map(([label]) => label).join('; ')]);
  const csv = [header, ...rows].map(row => row.map(psCsvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
  const link = document.createElement('a');
  link.href = url; link.download = 'realdeals-property-list-' + todayEastern() + '.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function psMedian(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function psMiles(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 7917.5 * Math.asin(Math.sqrt(h));
}

async function psComps(index) {
  const p = psResults[index];
  const box = document.getElementById('psComps' + index);
  if (!Number.isFinite(p.lat)) { box.textContent = 'No map location is available for comps.'; return; }
  box.innerHTML = '<p class="small">Finding recent qualified sales nearby…</p>';
  try {
    const year = new Date().getFullYear();
    const where = 'CO_NO = ' + (PS_FL_COUNTIES.indexOf(p.county) + 11) + " AND PHY_CITY = '" + psQuote(p.city) + "' AND SALE_YR1 >= " + (year - 1);
    const sales = [];
    for (let page = 0, more = true; page < 3 && more; page++) {
      const data = await psFetch(psUrl('FL', {where, outFields: 'PARCEL_ID,CO_NO,PHY_ADDR1,PHY_CITY,TOT_LVG_AR,ACT_YR_BLT,SALE_PRC1,SALE_YR1,SALE_MO1,DOR_UC,QUAL_CD1',
        orderByFields: 'OBJECTID', returnGeometry: 'false', returnCentroid: 'true', resultOffset: String(page * PS_FL_PAGE), resultRecordCount: String(PS_FL_PAGE)}));
      sales.push(...data.features.filter(f => f.attributes.DOR_UC === p.useCode && f.attributes.QUAL_CD1 === '01'
        && f.attributes.SALE_PRC1 >= 10000 && f.attributes.PARCEL_ID !== p.parcelId));
      more = Boolean(data.exceededTransferLimit);
    }
    const comps = sales.map(psNormalizeFL).map(c => ({...c, miles: Number.isFinite(c.lat) ? psMiles(p, c) : null}))
      .filter(c => c.miles != null && c.miles <= 1.5).sort((a, b) => a.miles - b.miles).slice(0, 10);
    if (!comps.length) { box.innerHTML = '<p class="small">No qualified sales of this property type within 1.5 miles in the last two years.</p>'; return; }
    const median = psMedian(comps.map(c => c.lastSalePrice));
    const ppsf = psMedian(comps.filter(c => c.sqft > 0).map(c => c.lastSalePrice / c.sqft));
    const estimate = ppsf && p.sqft ? Math.round(ppsf * p.sqft) : median;
    p.estimate = estimate;
    box.innerHTML = `<div class="greenBox" style="margin-top:8px"><b>Estimated value: ${fmt(estimate)}</b>
    <div class="small">Median sale ${fmt(median)}${ppsf ? ' · ' + fmt(Math.round(ppsf)) + '/sq ft' : ''} · ${comps.length} qualified sales nearby. Estimate only — verify condition and adjust.</div>
    <ul class="small">${comps.map(c => `<li>${escapeHtml(c.address)} — ${fmt(c.lastSalePrice)} (${escapeHtml(c.lastSale)})${c.sqft ? ' · ' + c.sqft.toLocaleString() + ' sq ft' : ''}${c.miles != null ? ' · ' + c.miles.toFixed(2) + ' mi' : ''}</li>`).join('')}</ul>
    <button type="button" class="btn ghost" onclick="psUseEstimate(${index})">Use as ARV in offer calculator</button></div>`;
  } catch (error) {
    box.innerHTML = '<p class="small">' + escapeHtml(error.message) + '</p>';
  }
}

function psUseEstimate(index) {
  const field = document.getElementById('arv');
  field.value = psResults[index].estimate;
  const view = field.closest('[id^="view-"]');
  if (view) go(view.id.slice(5));
  field.scrollIntoView({behavior: 'smooth', block: 'center'});
  calcOffer();
}

function psSavedSearches() {
  try { return JSON.parse(localStorage.getItem(psSavedKey) || '[]'); } catch { return []; }
}

function psSaveSearch() {
  const status = document.getElementById('psStatus');
  try {
    const c = psForm();
    psValidate(c);
    const name = prompt('Name this saved search', [c.county, c.city || c.zip, c.absentee ? 'absentee' : '', c.estate ? 'estate' : ''].filter(Boolean).join(' '));
    if (!name) return;
    const list = psSavedSearches().filter(s => s.name !== name);
    list.unshift({name: name.slice(0, 80), criteria: c, savedAt: new Date().toISOString()});
    localStorage.setItem(psSavedKey, JSON.stringify(list.slice(0, 50)));
    psRenderSaved();
    status.textContent = 'Search saved.';
  } catch (error) { status.textContent = error.message; }
}

function psRunSaved(index) {
  const saved = psSavedSearches()[index];
  if (!saved) return;
  const form = document.getElementById('psForm');
  form.state.value = saved.criteria.state;
  psCounties();
  const criteria = {...saved.criteria};
  if (criteria.longTerm && !criteria.ownedYears) criteria.ownedYears = '15';
  for (const [key, value] of Object.entries(criteria)) {
    const field = form.elements[key];
    if (!field || key === 'state') continue;
    if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = value ?? '';
  }
  psSearch();
}

function psDeleteSaved(index) {
  const list = psSavedSearches();
  list.splice(index, 1);
  localStorage.setItem(psSavedKey, JSON.stringify(list));
  psRenderSaved();
}

function psRenderSaved() {
  const list = psSavedSearches();
  document.getElementById('psSaved').innerHTML = list.length ? list.map((s, i) =>
    `<div class="flex" style="margin:4px 0"><button type="button" onclick="psRunSaved(${i})">${escapeHtml(s.name)}</button><button type="button" style="flex:0 0 auto" aria-label="Delete saved search ${escapeHtml(s.name)}" onclick="psDeleteSaved(${i})">✕</button></div>`).join('')
    : '<p class="small">No saved searches yet.</p>';
}

function psCounties() {
  const form = document.getElementById('psForm');
  const state = form.state.value;
  const names = PS_COUNTY_SOURCES[state] ? Object.keys(PS_COUNTY_SOURCES[state]) : state === 'FL' ? PS_FL_COUNTIES : PS_NC_COUNTIES;
  form.county.innerHTML = '<option value="">Select county</option>' + names.map(n => `<option>${n}</option>`).join('');
  form.noHomestead.closest('label').classList.toggle('hidden', state !== 'FL');
}

function propSearchShown() {
  psRenderSaved();
  psDrawMap();
}

document.getElementById('psForm').addEventListener('submit', psSearch);
document.getElementById('psForm').state.addEventListener('change', psCounties);
psCounties();
