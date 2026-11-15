// Transparent fix-priority score. Shared by the server (Word report) and the browser
// (live weight sliders), so the number on screen and in the report is always the same.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Priority = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_WEIGHTS = { frequency: 35, severity: 25, ratingImpact: 25, recency: 15 };
  const RECENT_DAYS = 90;
  const DAY = 24 * 3600 * 1000;

  function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // reviews: tagged reviews ({rating, date, themes:[id], severity, sentiment})
  // themes: taxonomy [{id, name, type, description, fix_hypothesis}]
  function computeStats(reviews, themes) {
    const rated = reviews.filter((r) => r.rating !== null && r.rating !== undefined);
    const overallAvg = mean(rated.map((r) => r.rating));
    const dated = reviews.map((r) => r.date).filter(Boolean).sort();
    // "Recent" is measured from the newest review in the data set, not from today,
    // so re-opening an old analysis gives the same numbers.
    const refTime = dated.length ? new Date(dated[dated.length - 1]).getTime() : null;

    const stats = themes.map((t) => {
      const rs = reviews.filter((r) => (r.themes || []).includes(t.id));
      const ratings = rs.map((r) => r.rating).filter((x) => x !== null && x !== undefined);
      const avgRating = mean(ratings);
      const datedRs = rs.filter((r) => r.date);
      const recentCount = refTime === null ? 0
        : datedRs.filter((r) => refTime - new Date(r.date).getTime() <= RECENT_DAYS * DAY).length;
      return {
        id: t.id, name: t.name, type: t.type, description: t.description, fix_hypothesis: t.fix_hypothesis,
        count: rs.length,
        share: reviews.length ? rs.length / reviews.length : 0,
        avgRating,
        ratingGap: avgRating !== null && overallAvg !== null ? overallAvg - avgRating : 0,
        avgSeverity: mean(rs.map((r) => r.severity || 0)) || 0,
        negativeShare: rs.length ? rs.filter((r) => r.sentiment < 0).length / rs.length : 0,
        recentShare: datedRs.length ? recentCount / datedRs.length : 0,
        markets: [...new Set(rs.map((r) => r.market))].sort(),
      };
    });
    return { overallAvg, total: reviews.length, themes: stats };
  }

  function normaliseWeights(w) {
    const x = Object.assign({}, DEFAULT_WEIGHTS, w || {});
    const sum = x.frequency + x.severity + x.ratingImpact + x.recency;
    if (!sum) return { frequency: 0.25, severity: 0.25, ratingImpact: 0.25, recency: 0.25 };
    return { frequency: x.frequency / sum, severity: x.severity / sum, ratingImpact: x.ratingImpact / sum, recency: x.recency / sum };
  }

  // Each factor is scaled to 0..1, then combined with the weights into a 0..100 score.
  //  frequency    = theme count / count of the largest fixable theme
  //  severity     = average severity (0..3) / 3
  //  ratingImpact = (overall avg rating - theme avg rating) / 2, capped to 0..1
  //  recency      = share of the theme's dated reviews from the last 90 days
  function score(stats, weights) {
    const w = normaliseWeights(weights);
    const fixable = stats.themes.filter((t) => t.type !== 'praise' && t.count > 0);
    const maxCount = Math.max(1, ...fixable.map((t) => t.count));
    const ranked = fixable.map((t) => {
      const f = {
        frequency: t.count / maxCount,
        severity: clamp01(t.avgSeverity / 3),
        ratingImpact: clamp01(t.ratingGap / 2),
        recency: clamp01(t.recentShare),
      };
      const s = 100 * (w.frequency * f.frequency + w.severity * f.severity + w.ratingImpact * f.ratingImpact + w.recency * f.recency);
      return Object.assign({}, t, { factors: f, score: Math.round(s * 10) / 10 });
    }).sort((a, b) => b.score - a.score || b.count - a.count);
    ranked.forEach((t, i) => { t.rank = i + 1; });
    const strengths = stats.themes.filter((t) => t.type === 'praise' && t.count > 0).sort((a, b) => b.count - a.count);
    return { ranked, strengths };
  }

  // Pick example reviews for a theme: most severe, then lowest rating, then newest,
  // spreading across countries where possible.
  function examples(reviews, themeId, n) {
    const rs = reviews.filter((r) => (r.themes || []).includes(themeId)).slice().sort((a, b) =>
      (b.severity || 0) - (a.severity || 0) || (a.rating ?? 6) - (b.rating ?? 6) || String(b.date).localeCompare(String(a.date)));
    const picked = []; const seenCountry = new Set();
    for (const r of rs) { if (picked.length >= n) break; if (!seenCountry.has(r.market)) { picked.push(r); seenCountry.add(r.market); } }
    for (const r of rs) { if (picked.length >= n) break; if (!picked.includes(r)) picked.push(r); }
    return picked;
  }

  return { DEFAULT_WEIGHTS, RECENT_DAYS, computeStats, score, examples, normaliseWeights };
});
