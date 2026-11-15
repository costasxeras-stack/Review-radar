// AI theming with the Claude API, in two passes:
//  1. Discover: Claude reads a balanced sample and proposes a theme list (taxonomy).
//  2. Tag: every analysed review is tagged against that fixed list, in batches.
// A fixed list keeps themes comparable across markets and lets us count them reliably.

const API_URL = 'https://api.anthropic.com/v1/messages';
const THEME_TYPES = ['bug', 'usability', 'performance', 'feature_request', 'service', 'pricing', 'content', 'praise', 'other'];
const BATCH_SIZE = 30;
const CONCURRENCY = 3;

function model() { return process.env.CLAUDE_MODEL || 'claude-haiku-5-5'; }

async function callClaude(system, user, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`Claude API ${res.status}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Claude API ${res.status}`);
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      return { json: parseJson(text), usage: data.usage || {} };
    } catch (err) {
      lastErr = err;
      if (/not set|invalid x-api-key|authentication/i.test(err.message)) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

function parseJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Claude did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Simple stable hash so the same data always gives the same sample.
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Balanced sample: every market gets a fair minimum, the rest is proportional.
function balancedSample(reviews, n) {
  if (reviews.length <= n) return reviews.slice();
  const byMarket = new Map();
  for (const r of reviews) { if (!byMarket.has(r.market)) byMarket.set(r.market, []); byMarket.get(r.market).push(r); }
  for (const list of byMarket.values()) list.sort((a, b) => hash(a.id) - hash(b.id));
  const markets = [...byMarket.keys()];
  const floor = Math.min(10, Math.floor(n / Math.max(1, markets.length)));
  const picked = [];
  const rest = [];
  for (const m of markets) { const list = byMarket.get(m); picked.push(...list.slice(0, floor)); rest.push(...list.slice(floor)); }
  rest.sort((a, b) => hash(a.id) - hash(b.id));
  return picked.concat(rest.slice(0, Math.max(0, n - picked.length))).slice(0, n);
}

function compact(r, maxLen) {
  const text = (r.title ? r.title + ' — ' : '') + r.text;
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

async function discoverThemes(reviews, subject) {
  const sample = balancedSample(reviews, 150);
  const system = 'You are a voice-of-customer analyst. You read app and product reviews in any language and group them into themes a product team can act on. Reply with JSON only.';
  const user = `Product: ${subject || 'unnamed product'}
Below are ${sample.length} customer reviews (rating 1-5, any language).

Propose 8 to 14 themes that together cover most of the feedback.
Rules:
- Theme names in English, 2-6 words, specific (e.g. "Login fails after update", not "Problems").
- One theme = one fixable problem or one clear strength. Do not mix praise and complaints.
- type is one of: ${THEME_TYPES.join(', ')}. Use "praise" only for positive themes.
- description: one sentence on what customers report.
- fix_hypothesis: one sentence on a possible fix direction (a hypothesis, not a fact). For praise, what to protect.
- Always include a final theme {"id":"other","name":"Other / unclear","type":"other"}.

Return: {"themes":[{"id":"t1","name":"...","type":"...","description":"...","fix_hypothesis":"..."}]}

Reviews:
${sample.map((r, i) => `${i + 1}. [${r.rating ?? '?'}★ ${r.market}] ${compact(r, 500)}`).join('\n')}`;
  const { json, usage } = await callClaude(system, user, 3000);
  const themes = validateTaxonomy(json.themes);
  return { themes, usage, sampleSize: sample.length };
}

function validateTaxonomy(themes) {
  const seen = new Set();
  const out = [];
  (Array.isArray(themes) ? themes : []).forEach((t, i) => {
    let id = String(t.id || `t${i + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || `t${i + 1}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    out.push({
      id, name: String(t.name || id).slice(0, 80), type: THEME_TYPES.includes(t.type) ? t.type : 'other',
      description: String(t.description || '').slice(0, 300), fix_hypothesis: String(t.fix_hypothesis || '').slice(0, 300),
    });
  });
  if (!out.find((t) => t.id === 'other')) out.push({ id: 'other', name: 'Other / unclear', type: 'other', description: 'Feedback that fits no other theme.', fix_hypothesis: '' });
  if (out.length < 2) throw new Error('Claude returned too few themes');
  return out;
}

async function tagBatch(batch, themes) {
  const system = 'You tag customer reviews against a fixed theme list. Reply with JSON only.';
  const user = `Themes:
${themes.map((t) => `- ${t.id}: ${t.name} (${t.type})`).join('\n')}

For each review return:
- i: the review number
- themes: 1 to 3 theme ids from the list above (use "other" if none fits)
- sentiment: -1 negative, 0 mixed/neutral, 1 positive
- severity: 0 no problem, 1 minor annoyance, 2 blocks a task or costs money, 3 product unusable, data/money lost, or safety issue
- gist: neutral English summary, max 20 words (not a quote)

Return: {"results":[{"i":1,"themes":["t1"],"sentiment":-1,"severity":2,"gist":"..."}]}

Reviews:
${batch.map((r, i) => `${i + 1}. [${r.rating ?? '?'}★] ${compact(r, 1200)}`).join('\n')}`;
  const { json, usage } = await callClaude(system, user, 4000);
  return { results: Array.isArray(json.results) ? json.results : [], usage };
}

async function analyse(reviews, { subject, maxReviews }, onProgress = () => {}) {
  const usage = { input_tokens: 0, output_tokens: 0 };
  const add = (u) => { usage.input_tokens += u.input_tokens || 0; usage.output_tokens += u.output_tokens || 0; };

  onProgress({ stage: 'Finding themes', done: 0, total: 1 });
  const analysed = balancedSample(reviews, maxReviews);
  const { themes, usage: u1, sampleSize } = await discoverThemes(analysed, subject);
  add(u1);
  const ids = new Set(themes.map((t) => t.id));

  const batches = [];
  for (let i = 0; i < analysed.length; i += BATCH_SIZE) batches.push(analysed.slice(i, i + BATCH_SIZE));
  const tagged = [];
  let untagged = 0;
  let unknownThemeIds = 0;
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      let results = [];
      try { const r = await tagBatch(batch, themes); results = r.results; add(r.usage); } catch (e) { results = []; }
      const byI = new Map(results.map((x) => [Number(x.i), x]));
      batch.forEach((rev, k) => {
        const t = byI.get(k + 1);
        if (!t) { untagged++; tagged.push({ ...rev, themes: [], sentiment: null, severity: null, gist: null, tagged: false }); return; }
        let tIds = (Array.isArray(t.themes) ? t.themes : []).map(String);
        const valid = tIds.filter((x) => ids.has(x));
        unknownThemeIds += tIds.length - valid.length;
        tIds = valid.length ? [...new Set(valid)].slice(0, 3) : ['other'];
        tagged.push({
          ...rev, themes: tIds,
          sentiment: [-1, 0, 1].includes(Number(t.sentiment)) ? Number(t.sentiment) : 0,
          severity: Math.max(0, Math.min(3, Math.round(Number(t.severity) || 0))),
          gist: String(t.gist || '').slice(0, 200), tagged: true,
        });
      });
      done++;
      onProgress({ stage: 'Tagging reviews', done, total: batches.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

  return {
    themes, reviews: tagged, model: model(), runAt: new Date().toISOString(),
    coverage: { collected: reviews.length, analysed: analysed.length, discoverySample: sampleSize, untagged, unknownThemeIds },
    usage,
  };
}

module.exports = { analyse, balancedSample, validateTaxonomy, parseJson, THEME_TYPES, model };
