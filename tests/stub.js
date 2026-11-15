// Test-only stub: replaces the App Store, Google Play and Claude APIs with SYNTHETIC data,
// so the full flow can be clicked through offline. Never loaded in production.
// Usage: ANTHROPIC_API_KEY=test node -r ./tests/stub.js server.js
const gplayModule = require('google-play-scraper');
const gplay = gplayModule.default || gplayModule;

const TOPICS = [
  ['Login keeps failing after the latest update.', 1, 'login'],
  ['App crashes when I open the device pairing screen.', 1, 'pairing'],
  ['Customer service took two weeks to answer my warranty claim.', 2, 'service'],
  ['Great design, easy to use, love it.', 5, 'praise'],
  ['Battery status shown in the app is wrong.', 3, 'battery'],
  ['Too many notifications, please let me turn them off.', 3, 'notif'],
];
function synth(market, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [text, rating] = TOPICS[(i * 7 + market.length) % TOPICS.length];
    out.push({ text: `[SYNTHETIC ${market} #${i}] ${text}`, rating, date: new Date(Date.UTC(2026, 10, 10) - i * 86400000 * 3).toISOString() });
  }
  return out;
}
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('itunes.apple.com/search')) return json({ results: [{ trackId: 123456789, trackName: 'Sample App', sellerName: 'Sample Co', averageUserRating: 3.9, userRatingCount: 1200 }] });
  const m = u.match(/itunes\.apple\.com\/(\w\w)\/rss\/customerreviews\/page=(\d+)/);
  if (m) {
    const [, cc, page] = m;
    if (!['pl', 'gb', 'de', 'jp', 'us'].includes(cc) || Number(page) > 2) return json({ feed: {} });
    const rows = synth(cc, 50).map((r, i) => ({ id: { label: `${cc}${page}${i}` }, 'im:rating': { label: String(r.rating) }, title: { label: 'Title' }, content: { label: r.text }, updated: { label: r.date }, 'im:version': { label: '2.1' } }));
    return json({ feed: { entry: rows } });
  }
  if (u.includes('api.anthropic.com')) {
    const body = JSON.parse(opts.body);
    const prompt = body.messages[0].content;
    let out;
    if (prompt.includes('Propose 8 to 14 themes')) {
      out = { themes: [
        { id: 't1', name: 'Login fails after update', type: 'bug', description: 'Users cannot sign in.', fix_hypothesis: 'Check the auth token migration.' },
        { id: 't2', name: 'Pairing screen crashes', type: 'bug', description: 'Crash on pairing.', fix_hypothesis: 'Investigate Bluetooth permission flow.' },
        { id: 't3', name: 'Slow warranty support', type: 'service', description: 'Slow replies.', fix_hypothesis: 'Add claim status tracking.' },
        { id: 't4', name: 'Easy and well designed', type: 'praise', description: 'Positive UX.', fix_hypothesis: 'Keep the simple flow.' },
        { id: 't5', name: 'Wrong battery status', type: 'bug', description: 'Battery level wrong.', fix_hypothesis: 'Calibrate reading.' },
        { id: 't6', name: 'Too many notifications', type: 'usability', description: 'Noise.', fix_hypothesis: 'Add notification settings.' },
        { id: 'other', name: 'Other / unclear', type: 'other' },
      ] };
    } else {
      const lines = prompt.split('Reviews:\n')[1].split('\n').filter(Boolean);
      const map = { 'Login': ['t1', 3], 'crashes': ['t2', 3], 'warranty': ['t3', 2], 'design': ['t4', 0], 'Battery': ['t5', 1], 'notifications': ['t6', 1] };
      out = { results: lines.map((l, k) => { const key = Object.keys(map).find((x) => l.includes(x)); const [t, sev] = key ? map[key] : ['other', 0]; return { i: k + 1, themes: [t], sentiment: t === 't4' ? 1 : -1, severity: sev, gist: 'Synthetic summary.' }; }) };
    }
    await new Promise((r) => setTimeout(r, 150));
    return json({ content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 100, output_tokens: 50 } });
  }
  return realFetch(url, opts);
};
gplay.search = async () => [{ appId: 'com.sample.app', title: 'Sample App', developer: 'Sample Co', score: 3.7 }];
gplay.reviews = async ({ lang, num }) => {
  if (!['en', 'de', 'pl', 'ja'].includes(lang)) return { data: [] };
  return { data: synth('play-' + lang, Math.min(num, 40)).map((r, i) => ({ id: `${lang}-${i}`, score: r.rating, text: r.text, date: r.date, version: '2.1' })) };
};
console.log('[tests/stub] SYNTHETIC sources and AI loaded');
