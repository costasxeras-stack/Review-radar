// Review sources: Apple App Store (official public feed), Google Play (unofficial
// library), CSV (rows parsed in the browser). Every review is normalised to one shape.
// Author names are dropped on purpose: they are third-party personal data we don't need.

const gplayModule = require('google-play-scraper');
const gplay = gplayModule.default || gplayModule;

// Every App Store storefront we know of. Unknown or closed storefronts simply return
// no reviews, so the list errs on the side of completeness.
const APPLE_STOREFRONTS = ('ae ag ai al am ao ar at au az ba bb be bf bg bh bj bm bn bo br bs bt bw by bz ' +
  'ca cd cg ch ci cl cm cn co cr cv cy cz de dk dm do dz ec ee eg es fi fj fm fr ga gb gd ge gh gm gr gt gw gy ' +
  'hk hn hr hu id ie il in iq is it jm jo jp ke kg kh kn kr kw ky kz la lb lc lk lr lt lu lv ly ma md me mg mk ' +
  'ml mn mo mr ms mt mu mv mw mx my mz na ne ng ni nl no np nr nz om pa pe pg ph pk pl pt pw py qa ro rs ru rw ' +
  'sa sb sc se sg si sk sl sn sr st sv sz tc td th tj tm tn to tr tt tw tz ua ug us uy uz vc ve vg vn vu xk ye ' +
  'za zm zw').split(' ');

// Google Play groups reviews by language, not by country. In "all markets" mode we ask
// once per language, using a representative country for each.
const PLAY_LANGUAGES = [
  ['en', 'us'], ['de', 'de'], ['fr', 'fr'], ['es', 'es'], ['it', 'it'], ['pt', 'br'], ['pl', 'pl'], ['nl', 'nl'],
  ['sv', 'se'], ['da', 'dk'], ['no', 'no'], ['fi', 'fi'], ['cs', 'cz'], ['sk', 'sk'], ['hu', 'hu'], ['ro', 'ro'],
  ['bg', 'bg'], ['el', 'gr'], ['tr', 'tr'], ['ru', 'kz'], ['uk', 'ua'], ['ja', 'jp'], ['ko', 'kr'], ['zh-TW', 'tw'],
  ['th', 'th'], ['vi', 'vn'], ['id', 'id'], ['ms', 'my'], ['ar', 'sa'], ['he', 'il'], ['hi', 'in'], ['hr', 'hr'],
  ['sr', 'rs'], ['sl', 'si'], ['lt', 'lt'], ['lv', 'lv'], ['et', 'ee'], ['fil', 'ph'],
];

// Main language per country, used when the user picks specific countries.
const COUNTRY_LANG = {
  pl: 'pl', gb: 'en', us: 'en', ie: 'en', au: 'en', nz: 'en', ca: 'en', in: 'en', za: 'en', sg: 'en',
  de: 'de', at: 'de', ch: 'de', fr: 'fr', be: 'fr', lu: 'fr', it: 'it', es: 'es', mx: 'es', ar: 'es', co: 'es',
  cl: 'es', pe: 'es', pt: 'pt', br: 'pt', nl: 'nl', se: 'sv', dk: 'da', no: 'no', fi: 'fi', cz: 'cs', sk: 'sk',
  hu: 'hu', ro: 'ro', bg: 'bg', gr: 'el', cy: 'el', tr: 'tr', ru: 'ru', ua: 'uk', jp: 'ja', kr: 'ko', tw: 'zh-TW',
  hk: 'zh-TW', th: 'th', vn: 'vi', id: 'id', my: 'ms', sa: 'ar', ae: 'ar', eg: 'ar', il: 'he', hr: 'hr', rs: 'sr',
  si: 'sl', lt: 'lt', lv: 'lv', ee: 'et', ph: 'en',
};

const APPLE_PAGES = 10; // Apple's feed serves at most 10 pages of 50 reviews per storefront

function isCountry(c) { return APPLE_STOREFRONTS.includes(c); }
function langFor(c) { return COUNTRY_LANG[c] || 'en'; }
function isAppleId(id) { return /^\d{5,12}$/.test(String(id || '')); }
function isPlayId(id) { return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(String(id || '')); }

function toIso(d) {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t.toISOString();
}

function cleanRating(r) {
  const n = Number(r);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'review-radar/0.1 (portfolio app)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

// ---------- Search ----------
async function searchApple(term, country) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=${country}&limit=8`;
  const data = await fetchJson(url);
  return (data?.results || []).map((r) => ({
    store: 'apple', id: String(r.trackId), name: r.trackName, developer: r.sellerName || r.artistName,
    icon: r.artworkUrl60, rating: r.averageUserRating ?? null, ratingCount: r.userRatingCount ?? null,
  }));
}

async function searchPlay(term, country) {
  const lang = langFor(country);
  const results = await gplay.search({ term, num: 8, country, lang });
  return (results || []).map((r) => ({
    store: 'google_play', id: r.appId, name: r.title, developer: r.developer,
    icon: r.icon, rating: r.score ?? null, ratingCount: null,
  }));
}

// ---------- Collect ----------
function appleEntryToReview(e, country) {
  const rawId = e?.id?.label;
  const text = e?.content?.label;
  if (!rawId || !text) return null;
  return {
    id: `apple:${country}:${rawId}`, source: 'apple', country, market: country.toUpperCase(),
    rating: cleanRating(e['im:rating']?.label), title: e?.title?.label || '',
    text: String(text), date: toIso(e?.updated?.label), version: e['im:version']?.label || null,
  };
}

async function collectApple(appId, country) {
  const out = [];
  for (let page = 1; page <= APPLE_PAGES; page++) {
    // A storefront with an empty first page has no reviews: stop after one request.
    const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
    const data = await fetchJson(url);
    let entries = data?.feed?.entry;
    if (!entries) break;
    if (!Array.isArray(entries)) entries = [entries];
    // Older feed formats put the app itself first; it has no rating, so it is filtered out.
    const reviews = entries.filter((e) => e['im:rating']).map((e) => appleEntryToReview(e, country)).filter(Boolean);
    if (!reviews.length) break;
    out.push(...reviews);
    if (entries.length < 50) break;
  }
  return out;
}

async function collectPlay(appId, country, lang, num) {
  const res = await gplay.reviews({ appId, country, lang, sort: gplay.sort.NEWEST, num });
  const rows = Array.isArray(res) ? res : res?.data || [];
  return rows.filter((r) => r && r.text).map((r) => ({
    id: `google_play:${lang}:${r.id}`, source: 'google_play', country, lang, market: `lang:${lang}`,
    rating: cleanRating(r.score), title: r.title || '', text: String(r.text),
    date: toIso(r.date), version: r.version || null,
  }));
}

function normaliseCsvRows(rows) {
  const issues = { skippedNoText: 0, badRating: 0, badDate: 0 };
  const out = [];
  (rows || []).slice(0, 5000).forEach((row, i) => {
    const text = String(row.text || row.review || row.comment || row.content || '').trim();
    if (!text) { issues.skippedNoText++; return; }
    const rawRating = row.rating ?? row.stars ?? row.score;
    const rating = cleanRating(rawRating);
    if (rawRating !== undefined && rawRating !== '' && rating === null) issues.badRating++;
    const rawDate = row.date || row.created_at || row.timestamp;
    const date = toIso(rawDate);
    if (rawDate && !date) issues.badDate++;
    const country = String(row.country || '').toLowerCase().slice(0, 2) || 'xx';
    out.push({
      id: `csv:${i + 1}`, source: 'csv', sourceLabel: String(row.source || 'CSV upload').slice(0, 40),
      country, market: country === 'xx' ? 'CSV' : country.toUpperCase(), rating, title: String(row.title || '').slice(0, 200), text: text.slice(0, 5000),
      date, version: row.version || null,
    });
  });
  return { reviews: out, issues };
}

function dedupe(reviews) {
  const seenId = new Set();
  const seenContent = new Set();
  const out = [];
  let removed = 0;
  for (const r of reviews) {
    const contentKey = `${r.source}|${r.market}|${r.rating}|${r.text.trim().toLowerCase()}`;
    if (seenId.has(r.id) || seenContent.has(contentKey)) { removed++; continue; }
    seenId.add(r.id); seenContent.add(contentKey); out.push(r);
  }
  return { reviews: out, removed };
}

// Run async jobs with a fixed number in flight, to stay polite to the stores.
async function pool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await worker(items[i], i); }
  });
  await Promise.all(runners);
}

// countries: 'all' or an array of storefront codes.
async function collectAll({ appleId, playId, countries, playPerMarket = 150, csvRows }, onProgress = () => {}) {
  const all = [];
  const runs = [];
  const allMode = countries === 'all';
  const storefronts = allMode ? APPLE_STOREFRONTS : countries;
  const playMarkets = allMode
    ? PLAY_LANGUAGES.map(([lang, country]) => ({ lang, country }))
    : [...new Map(countries.map((c) => [langFor(c), { lang: langFor(c), country: c }])).values()];

  const tasks = [];
  if (appleId) storefronts.forEach((c) => tasks.push({ source: 'apple', market: c.toUpperCase(), fn: () => collectApple(appleId, c) }));
  if (playId) playMarkets.forEach((m) => tasks.push({ source: 'google_play', market: `lang:${m.lang}`, fn: () => collectPlay(playId, m.country, m.lang, playPerMarket) }));

  let done = 0;
  await pool(tasks, 6, async (t) => {
    try {
      const reviews = await t.fn();
      all.push(...reviews);
      runs.push({ source: t.source, market: t.market, count: reviews.length, error: null });
    } catch (err) {
      runs.push({ source: t.source, market: t.market, count: 0, error: err.message || String(err) });
    }
    done++;
    onProgress({ done, total: tasks.length, collected: all.length });
  });

  let csvIssues = null;
  if (csvRows && csvRows.length) {
    const csv = normaliseCsvRows(csvRows);
    all.push(...csv.reviews);
    csvIssues = csv.issues;
    runs.push({ source: 'csv', market: 'CSV', count: csv.reviews.length, error: null });
  }
  const { reviews, removed } = dedupe(all);
  runs.sort((a, b) => a.source.localeCompare(b.source) || b.count - a.count || a.market.localeCompare(b.market));
  return { reviews, runs, quality: buildQuality(reviews, removed, csvIssues, runs) };
}

function buildQuality(reviews, duplicatesRemoved, csvIssues, runs) {
  const dates = reviews.map((r) => r.date).filter(Boolean).sort();
  return {
    total: reviews.length,
    duplicatesRemoved,
    missingDate: reviews.filter((r) => !r.date).length,
    missingRating: reviews.filter((r) => r.rating === null).length,
    earliest: dates[0] || null,
    latest: dates[dates.length - 1] || null,
    csv: csvIssues,
    marketsWithReviews: runs.filter((r) => r.count > 0).length,
    marketsChecked: runs.length,
    failedRequests: runs.filter((r) => r.error).length,
  };
}

module.exports = {
  APPLE_STOREFRONTS, PLAY_LANGUAGES, isCountry, langFor, isAppleId, isPlayId,
  searchApple, searchPlay, collectAll, normaliseCsvRows, dedupe, appleEntryToReview,
};
