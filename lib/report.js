// Word report. Every number in it is computed from the analysed data; anything the
// reader must supply is left as a [bracket] placeholder.
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  AlignmentType, ShadingType, BorderStyle,
} = require('docx');
const Priority = require('./priority');

const QUOTE_LIMIT = 600;
const SOURCE_NAMES = { apple: 'App Store', google_play: 'Google Play', csv: 'CSV upload' };

function pct(x) { return `${Math.round(x * 100)}%`; }
function num(x, d = 1) { return x === null || x === undefined ? 'n/a' : Number(x).toFixed(d); }
function day(iso) { return iso ? String(iso).slice(0, 10) : 'no date'; }

function p(text, opts = {}) { return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } }); }
function h(text, level) { return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } }); }
function bullet(text) { return new Paragraph({ children: [new TextRun(text)], bullet: { level: 0 } }); }

function table(headers, rows, widths) {
  const cell = (text, header) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: header, size: 18 })] })],
    shading: header ? { type: ShadingType.CLEAR, fill: 'E8EEF5', color: 'auto' } : undefined,
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' },
    },
    rows: [new TableRow({ tableHeader: true, children: headers.map((x) => cell(x, true)) }), ...rows.map((r) => new TableRow({ children: r.map((x) => cell(x, false)) }))],
  });
}

function quoteBlock(r) {
  const full = r.text.length <= QUOTE_LIMIT;
  const label = full ? 'Verbatim review' : `Excerpt (first ${QUOTE_LIMIT} of ${r.text.length} characters)`;
  const shown = full ? r.text : r.text.slice(0, QUOTE_LIMIT) + ' […]';
  const meta = `${SOURCE_NAMES[r.source] || r.source} · ${r.market} · ${r.rating ?? '?'}★ · ${day(r.date)} · severity ${r.severity ?? '?'}`;
  const out = [
    new Paragraph({ children: [new TextRun({ text: `${label} — ${meta}`, size: 16, color: '666666' })], spacing: { before: 120 } }),
    new Paragraph({ children: [new TextRun({ text: shown, italics: true })], indent: { left: 360 } }),
  ];
  if (r.gist) out.push(new Paragraph({ children: [new TextRun({ text: `AI summary in English (not a quote): ${r.gist}`, size: 18, color: '444444' })], indent: { left: 360 }, spacing: { after: 80 } }));
  return out;
}

async function buildReport({ subject, analysis, collection, weights, filterLabel }) {
  const reviews = analysis.reviews.filter((r) => r.tagged);
  const stats = Priority.computeStats(reviews, analysis.themes);
  const { ranked, strengths } = Priority.score(stats, weights);
  const w = Priority.normaliseWeights(weights);
  const cov = analysis.coverage || {};
  const q = collection?.quality || {};
  const dates = reviews.map((r) => r.date).filter(Boolean).sort();

  const bySourceMarket = new Map();
  reviews.forEach((r) => { const k = r.source; bySourceMarket.set(k, (bySourceMarket.get(k) || 0) + 1); });
  const marketCounts = new Map();
  reviews.forEach((r) => marketCounts.set(r.market, (marketCounts.get(r.market) || 0) + 1));
  const topMarkets = [...marketCounts.entries()].sort((a, b) => b[1] - a[1]);

  const children = [];
  children.push(new Paragraph({ children: [new TextRun({ text: `Customer feedback report: ${subject || '[product name]'}`, bold: true, size: 40 })], spacing: { after: 120 } }));
  children.push(p(`Generated ${day(analysis.runAt)} by Review Radar · AI model: ${analysis.model}${filterLabel ? ` · Filter: ${filterLabel}` : ''}`, { size: 18, color: '666666' }));

  children.push(h('1. Summary', HeadingLevel.HEADING_1));
  children.push(p(`This report covers ${reviews.length} tagged reviews from ${marketCounts.size} markets, dated ${day(dates[0])} to ${day(dates[dates.length - 1])}. The average rating in this set is ${num(stats.overallAvg)}★.`));
  if (ranked.length) {
    children.push(p('Top fixes by priority score:', { bold: true }));
    ranked.slice(0, 3).forEach((t) => children.push(bullet(`${t.name}: ${t.count} reviews (${pct(t.share)}), average ${num(t.avgRating)}★, severity ${num(t.avgSeverity)} of 3.`)));
  }
  children.push(p('Business impact: [add the context only you have, e.g. support ticket volume or revenue at risk].', { color: '666666' }));

  children.push(h('2. Fix priorities', HeadingLevel.HEADING_1));
  children.push(p(`Score (0–100) = ${Math.round(w.frequency * 100)}% frequency + ${Math.round(w.severity * 100)}% severity + ${Math.round(w.ratingImpact * 100)}% rating impact + ${Math.round(w.recency * 100)}% recency. Rating impact is how far below the overall average a theme's reviews sit. Recency is the share of a theme's reviews from the last 90 days of the data set.`, { size: 18 }));
  children.push(table(['#', 'Theme', 'Type', 'Reviews', 'Share', 'Avg ★', 'Severity', 'Recent', 'Score'],
    ranked.map((t) => [t.rank, t.name, t.type, t.count, pct(t.share), num(t.avgRating), num(t.avgSeverity), pct(t.recentShare), num(t.score)]),
    [400, 2900, 1100, 900, 800, 800, 900, 900, 800]));

  children.push(h('3. Theme details', HeadingLevel.HEADING_1));
  ranked.forEach((t) => {
    children.push(h(`${t.rank}. ${t.name}`, HeadingLevel.HEADING_2));
    if (t.description) children.push(p(t.description));
    children.push(p(`${t.count} reviews · ${pct(t.negativeShare)} negative · markets: ${t.markets.slice(0, 12).join(', ')}${t.markets.length > 12 ? ` and ${t.markets.length - 12} more` : ''}`, { size: 18, color: '444444' }));
    if (t.fix_hypothesis) children.push(new Paragraph({ children: [new TextRun({ text: 'Fix hypothesis (AI-suggested, not validated): ', bold: true }), new TextRun(t.fix_hypothesis)], spacing: { after: 80 } }));
    Priority.examples(reviews, t.id, 3).forEach((r) => children.push(...quoteBlock(r)));
  });

  if (strengths.length) {
    children.push(h('4. Strengths to protect', HeadingLevel.HEADING_1));
    children.push(table(['Theme', 'Reviews', 'Share', 'Avg ★'], strengths.map((t) => [t.name, t.count, pct(t.share), num(t.avgRating)])));
  }

  children.push(h(`${strengths.length ? 5 : 4}. Data and method`, HeadingLevel.HEADING_1));
  children.push(table(['Source', 'Tagged reviews'], [...bySourceMarket.entries()].map(([k, v]) => [SOURCE_NAMES[k] || k, v])));
  children.push(p(''));
  children.push(p(`Markets with the most reviews: ${topMarkets.slice(0, 15).map(([m, c]) => `${m} (${c})`).join(', ')}.`, { size: 18 }));
  children.push(bullet(`Collected: ${cov.collected ?? q.total ?? 'n/a'} reviews after removing ${q.duplicatesRemoved ?? 0} duplicates. Analysed by AI: ${cov.analysed ?? 'n/a'} (country-balanced sample). Untagged because of AI errors: ${cov.untagged ?? 0}.`));
  if (q.marketsChecked) children.push(bullet(`Markets checked: ${q.marketsChecked}; with reviews: ${q.marketsWithReviews}; failed requests: ${q.failedRequests}.`));
  children.push(bullet('Themes were proposed by the AI from a sample, then every analysed review was tagged against that fixed list.'));
  children.push(bullet('AI tagging accuracy on a manual spot check: [__% of __ reviews checked by hand].'));

  children.push(h('Limits', HeadingLevel.HEADING_2));
  children.push(bullet("App Store: Apple's public feed returns at most the 500 most recent reviews per country, so older feedback is missing."));
  children.push(bullet('Google Play: collected with an unofficial open-source library. Play groups reviews by language, so its markets are languages, not countries.'));
  children.push(bullet('Reviews are a self-selected sample: unhappy and very happy customers are over-represented.'));
  children.push(bullet('Fix hypotheses and English summaries are AI-generated and need validation with the product team.'));

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildReport };
