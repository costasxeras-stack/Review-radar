# Case study: what customers in every market ask a product team to fix

> Status: template. v0.1.0 has only been run on synthetic data. Fill in after the first live run; no numbers below are real yet.

## The question
Can every public review of a product, across all markets and languages, be turned into a ranked and explainable fix list, and how far can the AI part be trusted?

## Approach
1. Collect: App Store (all storefronts) and Google Play (all major languages) for [product, anonymised as "Product A"], run on [date].
2. Theme: Claude proposes themes from a balanced sample, then tags [__] reviews against the fixed list.
3. Rank: frequency, severity, rating impact and recency, default weights 35/25/25/15.
4. Validate: hand-label [__] random reviews and compare with the AI tags.

## Headline numbers
(Source: App Store public feed and Google Play, collected [date].)
- Reviews collected: [__] from [__] markets. Analysed: [__].
- Average rating: [__]★.
- Top theme: [__], [__%] of reviews.
- AI-to-human agreement on themes: [__%]; on severity: [__%].

## Findings
For each: what, evidence (verbatim reviews with market and date), why it matters, **confirmed** or **hypothesis**.
1. [Finding]
2. [Finding]
3. [Finding]

## What my own approach got wrong
[e.g. themes that merged two problems, markets where the sample was too thin, severity drift between batches.]

## What I would do next
[e.g. human-labelled evaluation set, Reddit and support tickets as sources, trend over time per theme.]

## What I learned as a PM
[...]

## Limits
- Apple's feed only returns the 500 most recent reviews per country.
- Google Play data comes from an unofficial library.
- Reviewers are self-selected and skew to extremes.
- AI outputs are hypotheses until validated.
