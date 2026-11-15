// Unit checks for the pure logic (no network). Run: npm test
const assert = require('assert');
const P = require('../lib/priority');
const S = require('../lib/sources');
const A = require('../lib/ai');

const themes = [{ id: 'a', name: 'A', type: 'bug' }, { id: 'b', name: 'B', type: 'bug' }, { id: 'p', name: 'P', type: 'praise' }];
const rv = (id, rating, t, sev, date) => ({ id, rating, themes: [t], severity: sev, sentiment: rating < 3 ? -1 : 1, date, market: 'PL' });
const reviews = [rv(1, 1, 'a', 3, '2026-11-01'), rv(2, 1, 'a', 3, '2026-10-20'), rv(3, 4, 'b', 1, '2025-01-01'), rv(4, 5, 'p', 0, '2026-11-02')];
const stats = P.computeStats(reviews, themes);
const { ranked, strengths } = P.score(stats);
assert.strictEqual(ranked[0].id, 'a', 'severe, frequent, low-rated theme ranks first');
assert.strictEqual(strengths[0].id, 'p', 'praise goes to strengths, not the fix list');
assert.ok(ranked.every((t) => t.score >= 0 && t.score <= 100));
const onlyFreq = P.score(stats, { frequency: 100, severity: 0, ratingImpact: 0, recency: 0 });
assert.strictEqual(onlyFreq.ranked[0].factors.frequency, 1);

assert.ok(S.isAppleId('123456789') && !S.isAppleId('abc'));
assert.ok(S.isPlayId('com.company.app') && !S.isPlayId('bad id'));
const csv = S.normaliseCsvRows([{ text: 'hi', rating: '9' }, { text: '' }, { review: 'ok', rating: '4', date: 'nope' }]);
assert.strictEqual(csv.reviews.length, 2); assert.strictEqual(csv.issues.skippedNoText, 1); assert.strictEqual(csv.issues.badRating, 1); assert.strictEqual(csv.issues.badDate, 1);
const d = S.dedupe([{ id: 'x', source: 's', market: 'PL', rating: 1, text: 'Same' }, { id: 'y', source: 's', market: 'PL', rating: 1, text: 'same ' }]);
assert.strictEqual(d.removed, 1);

const many = Array.from({ length: 300 }, (_, i) => ({ id: 'r' + i, market: i < 280 ? 'US' : 'PL' }));
const sample = A.balancedSample(many, 50);
assert.strictEqual(sample.length, 50);
assert.ok(sample.filter((r) => r.market === 'PL').length >= 10, 'small markets keep a minimum share');
assert.deepStrictEqual(A.balancedSample(many, 50).map((r) => r.id), sample.map((r) => r.id), 'sample is stable');
assert.deepStrictEqual(A.parseJson('```json\n{"a":1}\n```'), { a: 1 });
const tax = A.validateTaxonomy([{ id: 't1', name: 'X', type: 'weird' }]);
assert.strictEqual(tax[0].type, 'other'); assert.ok(tax.find((t) => t.id === 'other'));
console.log('All unit checks passed');
