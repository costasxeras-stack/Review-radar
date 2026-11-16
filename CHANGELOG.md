# Changelog

All notable changes to Review Radar. Versions follow [docs/versioning.md](docs/versioning.md).

## [0.1.1] - 2026-11-16

### Changed
- Documentation wording only: shorter sentences, fewer semicolons and less bold text, so the docs read more plainly. No change to how the app works.

## [0.1.0] - 2026-11-15

### Added
- App search on the App Store and Google Play, so you pick the right app instead of hunting for store IDs.
- Review collection across all markets by default: every App Store storefront (173) and every major Google Play language (38). Countries without reviews are skipped automatically.
- Option to limit collection to chosen countries.
- CSV upload, so feedback from support tools or surveys can join the store reviews.
- Data-quality summary after collection: duplicates removed, missing dates and ratings, failed requests, Apple's 500-review cap.
- AI theming with Claude in two passes (discover themes, then tag every review), with sentiment, severity 0–3 and an English summary per review.
- Country-balanced sampling for large data sets, with "analysed X of Y collected" shown everywhere.
- Fix-priority score (frequency, severity, rating impact, recency) with adjustable weights, plus a separate "strengths to protect" list.
- Filters by source and market. Tap a theme to read its verbatim reviews.
- Exports: Word report, fix backlog CSV, and a results file you can reopen without a new AI run.
- Optional lab password to protect the paid AI step.
