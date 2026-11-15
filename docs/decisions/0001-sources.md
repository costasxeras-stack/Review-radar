# 0001: Use store feeds for every market, and Google Play through an unofficial library

**Status:** Accepted · **Date:** 2026-11-15

## Context
The app needs reviews from every market. Review sites (Google Maps, Trustpilot, Yelp) forbid scraping, and Google's official Places API returns only 5 reviews per business. Apple publishes a free public review feed per country. Google Play has no official API for other companies' apps.

## Decision
Use Apple's public feed for all 173 storefronts, and Google Play through the open-source `google-play-scraper` library, by language (Play groups reviews by language, not country). Add CSV upload for everything else. Review author names are dropped at collection time.

## Consequences
- Covers both mobile stores in every market at zero cost.
- Google Play collection is unofficial, may break when Google changes its site, and is clearly labelled as such in the app and report.
- Apple caps the feed at the 500 most recent reviews per country, so long-term history is missing.
- Web reviews, social and forums are out of scope until a compliant source is chosen.
