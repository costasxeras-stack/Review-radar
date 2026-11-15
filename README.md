# Review Radar

**Collects app reviews from every App Store country and every Google Play language, uses Claude to group them into themes, and ranks what to fix first, with the evidence behind each rank.**

Live demo: [URL] · Current version: **v0.1.0** ([changelog](CHANGELOG.md))

## Why this exists
Product teams sit on thousands of reviews spread across stores, countries and languages. Nobody reads them all, so roadmap calls lean on the loudest anecdote. I wanted to answer one question: **can a small tool turn every public review of a product, in every market, into a ranked, explainable fix list in minutes, and how far can you trust it?**

## What's inside
| Step | What it does |
|---|---|
| 1. Research | Search the App Store and Google Play and pick the app, or enter store IDs by hand |
| 2. Markets and sources | All markets by default (173 App Store countries, 38 Google Play languages) or chosen countries, plus an optional CSV of feedback from any other tool |
| 3. Find themes | Claude proposes a theme list from a balanced sample, then tags every analysed review with themes, sentiment, severity and an English summary |
| 4. What to fix first | Transparent 0–100 priority score with adjustable weights, filters by source and market, and the verbatim reviews behind every theme |
| 5. Export | Word report, fix backlog CSV, and a results file to reopen later without paying for a new AI run |

## How it works
- **Front end:** one HTML page, no framework (`index.html`).
- **Server:** Node + Express (`server.js`). Keeps the Claude API key off the browser, runs collection and AI work as background jobs, builds the Word report.
- **Sources:** Apple's public customer-review feed (official, max 500 most recent reviews per country) and Google Play via the open-source `google-play-scraper` library (unofficial; see [decision 0001](docs/decisions/0001-sources.md)).
- **AI:** Claude API, two passes: discover themes, then tag against that fixed list ([decision 0002](docs/decisions/0002-two-pass-theming.md)).
- **Scoring:** `lib/priority.js`, shared by the page and the report so the numbers always match ([decision 0003](docs/decisions/0003-transparent-score.md)).

## Run it locally
1. Install Node 18+ and run `npm install`.
2. Create a `.env` from `.env.example`, or set `ANTHROPIC_API_KEY` in your shell.
3. `npm start` and open http://localhost:3000.

Offline demo with **synthetic** data (no API keys, no network): `npm run start:stub`. Unit checks: `npm test`.

## Product documentation
[Product brief](docs/product-brief.md) · [Case study](docs/case-study.md) · [Decision records](docs/decisions/) · [Changelog](CHANGELOG.md) · [Versioning](docs/versioning.md)

## Status and limits
- v0.1.0 is tested end to end with synthetic data only; live runs against the stores are still to be done.
- App Store: Apple's feed returns at most the 500 most recent reviews per country.
- Google Play: collected with an unofficial library that can break when Google changes its site. Play groups reviews by language, so Play "markets" are languages.
- Large data sets are sampled for the AI step (default 1,500 reviews, balanced across markets). Every screen and report states analysed vs collected.
- Themes, severity, fix hypotheses and English summaries are AI-generated and not yet validated against a human-labelled sample.
- Nothing is stored on the server. Results live in your downloads.
