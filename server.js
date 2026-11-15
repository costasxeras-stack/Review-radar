// Review Radar server: keeps the Claude API key off the browser, talks to the review
// sources, runs long jobs in the background and builds the Word report.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const sources = require('./lib/sources');
const ai = require('./lib/ai');
const { buildReport } = require('./lib/report');
const pkg = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_REVIEWS = Math.max(50, Math.min(5000, Number(process.env.MAX_REVIEWS) || 1500));
const LAB_PASSWORD = process.env.LAB_PASSWORD || '';

app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => { if (req.path.startsWith('/api/')) console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`); });
  next();
});

// Only these files are public. Server code and .env are never served.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/priority.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'lib', 'priority.js')));

function checkPassword(req, res) {
  if (!LAB_PASSWORD) return true;
  const given = String(req.get('x-lab-password') || '');
  const a = Buffer.from(given); const b = Buffer.from(LAB_PASSWORD);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  res.status(401).json({ error: 'Wrong or missing lab password' });
  return false;
}

// ---------- Background jobs (in memory; a restart clears them) ----------
const jobs = new Map();
function newJob(kind) {
  const id = crypto.randomUUID();
  const job = { id, kind, status: 'running', progress: {}, result: null, error: null, createdAt: Date.now() };
  jobs.set(id, job);
  for (const [k, j] of jobs) if (Date.now() - j.createdAt > 2 * 3600 * 1000) jobs.delete(k);
  return job;
}
function runningCount(kind) { return [...jobs.values()].filter((j) => j.kind === kind && j.status === 'running').length; }

app.get('/api/config', (req, res) => {
  res.json({
    version: pkg.version, aiReady: Boolean(process.env.ANTHROPIC_API_KEY), model: ai.model(),
    passwordRequired: Boolean(LAB_PASSWORD), maxReviews: MAX_REVIEWS,
    storefronts: sources.APPLE_STOREFRONTS, playLanguages: sources.PLAY_LANGUAGES.map((x) => x[0]),
  });
});

app.get('/api/search', async (req, res) => {
  const term = String(req.query.term || '').trim().slice(0, 100);
  const country = String(req.query.country || 'us').toLowerCase();
  if (term.length < 2) return res.status(400).json({ error: 'Type at least 2 characters' });
  if (!sources.isCountry(country)) return res.status(400).json({ error: 'Unknown country code' });
  const [apple, play] = await Promise.allSettled([sources.searchApple(term, country), sources.searchPlay(term, country)]);
  res.json({
    apple: apple.status === 'fulfilled' ? apple.value : [], play: play.status === 'fulfilled' ? play.value : [],
    errors: { apple: apple.status === 'rejected' ? apple.reason.message : null, play: play.status === 'rejected' ? play.reason.message : null },
  });
});

app.post('/api/collect', (req, res) => {
  const { appleId, playId, countries, playPerMarket, csvRows } = req.body || {};
  if (appleId && !sources.isAppleId(appleId)) return res.status(400).json({ error: 'App Store ID must be the number from the app link (e.g. id123456789 → 123456789)' });
  if (playId && !sources.isPlayId(playId)) return res.status(400).json({ error: 'Google Play ID must look like com.company.app' });
  if (!appleId && !playId && !(Array.isArray(csvRows) && csvRows.length)) return res.status(400).json({ error: 'Choose at least one app or upload a CSV' });
  let list = 'all';
  if (countries !== 'all') {
    list = (Array.isArray(countries) ? countries : []).map((c) => String(c).toLowerCase()).filter(sources.isCountry);
    if (!list.length && (appleId || playId)) return res.status(400).json({ error: 'Choose at least one country, or All markets' });
  }
  if (runningCount('collect') >= 3) return res.status(429).json({ error: 'Busy collecting for someone else. Try again in a minute.' });
  const job = newJob('collect');
  sources.collectAll({
    appleId: appleId || null, playId: playId || null, countries: list,
    playPerMarket: Math.max(20, Math.min(500, Number(playPerMarket) || 150)), csvRows: Array.isArray(csvRows) ? csvRows : null,
  }, (p) => { job.progress = p; })
    .then((r) => { job.result = r; job.status = 'done'; })
    .catch((e) => { job.error = e.message; job.status = 'error'; });
  res.status(202).json({ jobId: job.id });
});

app.post('/api/analyze', (req, res) => {
  if (!checkPassword(req, res)) return;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI theming is not configured: add ANTHROPIC_API_KEY on the server' });
  const { reviews, subject, maxReviews } = req.body || {};
  if (!Array.isArray(reviews) || !reviews.length) return res.status(400).json({ error: 'No reviews to analyse' });
  const clean = reviews.filter((r) => r && typeof r.text === 'string' && r.text.trim() && r.id).slice(0, 20000);
  if (runningCount('analyze') >= 2) return res.status(429).json({ error: 'Two analyses are already running. Try again in a few minutes.' });
  const job = newJob('analyze');
  ai.analyse(clean, { subject: String(subject || '').slice(0, 100), maxReviews: Math.max(30, Math.min(MAX_REVIEWS, Number(maxReviews) || MAX_REVIEWS)) }, (p) => { job.progress = p; })
    .then((r) => { job.result = r; job.status = 'done'; })
    .catch((e) => { job.error = e.message; job.status = 'error'; });
  res.status(202).json({ jobId: job.id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found (the server may have restarted). Please run it again.' });
  res.json({ status: job.status, progress: job.progress, error: job.error, result: job.status === 'done' ? job.result : null });
});

app.post('/api/report', async (req, res) => {
  try {
    const { subject, analysis, collection, weights, filterLabel } = req.body || {};
    if (!analysis || !Array.isArray(analysis.reviews) || !Array.isArray(analysis.themes)) return res.status(400).json({ error: 'Run an analysis first' });
    const buf = await buildReport({ subject, analysis, collection, weights, filterLabel });
    const safe = String(subject || 'feedback').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'feedback';
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${safe}-feedback-report.docx"`);
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not build the report: ' + e.message });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

if (require.main === module) app.listen(PORT, () => console.log(`Review Radar v${pkg.version} on http://localhost:${PORT}`));
module.exports = app;
