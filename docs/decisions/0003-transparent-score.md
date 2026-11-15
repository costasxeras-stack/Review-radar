# 0003: Rank fixes with a simple weighted score instead of asking the AI

**Status:** Accepted · **Date:** 2026-11-15

## Context
An AI could rank fixes directly, but no one could explain or challenge its order.

## Decision
Score = weighted sum of four 0–1 factors: frequency (vs the largest theme), severity (average 0–3), rating impact (how far below the overall average the theme's reviews sit) and recency (share of reviews in the last 90 days of the data). Default weights 35/25/25/15, adjustable on screen. Praise themes are listed separately as strengths. The same code runs in the browser and in the report.

## Consequences
- Anyone can explain why a theme ranks where it does, and test other weightings live.
- The score ignores business value such as revenue or support cost; the report leaves a placeholder for that.
- Recency is measured from the newest review, not today, so reopening old results gives the same numbers.
