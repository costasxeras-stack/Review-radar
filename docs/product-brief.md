# Product brief: Review Radar

## Problem
Public reviews are the largest free source of customer feedback, but they are scattered across two stores, 170+ countries and dozens of languages. Teams sample a handful, usually in their own language, and miss problems that are concentrated in other markets.

## Users
- **Product managers** deciding what goes on the next roadmap.
- **Customer experience and support leads** looking for recurring complaints.
- **Market or country managers** comparing how a product lands in their market.

## Goals
- Collect every public review a store will give, in every market, in one run.
- Turn them into a short list of themes, each backed by real reviews.
- Rank fixes with a score anyone can explain and re-weight.
- Hand over a report and a backlog a team can act on.

## Scope (v0.1.0)
- Sources: App Store public feed, Google Play (unofficial library), CSV upload.
- AI: Claude API, two-pass theming, severity and sentiment.
- Output: on-screen ranking, Word report, backlog CSV, saved results file.

## Non-goals (for now)
- Social media, forums and review sites (Reddit, YouTube, Trustpilot, Google Maps).
- Accounts, saved projects or scheduled re-runs.
- Replying to reviews.
- Human-validated accuracy (planned; see the case study).

## Success signals
- A PM can go from app name to report in [__] minutes.
- On a hand-labelled sample, AI theme tags agree with a human [__%] of the time.
- A team using the report recognises the top 3 themes as real issues: [__ of __ teams asked].
