# 0002: Discover themes once, then tag every review against that fixed list

**Status:** Accepted · **Date:** 2026-11-15

## Context
Letting the AI invent themes per batch produces near-duplicates ("login bug", "sign-in fails") that can't be counted. Thousands of reviews also cost money and time.

## Decision
Pass 1: Claude reads a 150-review sample balanced across markets and proposes 8–14 themes. Pass 2: reviews are tagged in batches of 30 against that fixed list. Runs above the limit (default 1,500) use a stable, market-balanced sample. Default model: Claude Haiku, for cost.

## Consequences
- Theme counts are comparable across markets and between filters.
- A theme that is rare in the discovery sample may be missed and land in "Other". The size of "Other" is the signal to watch.
- Reviews the AI fails to tag are counted and reported, never silently dropped.
