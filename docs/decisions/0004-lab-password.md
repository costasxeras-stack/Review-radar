# 0004: Protect the AI step with an optional lab password

**Status:** Accepted · **Date:** 2026-11-15

## Context
The demo is public, and every AI run spends the owner's Claude credit.

## Decision
If `LAB_PASSWORD` is set on the server, the AI step requires it. Collection, exports and reopening saved results stay open. At most 2 AI runs and 3 collections run at the same time.

## Consequences
- Visitors can still see the whole flow by opening a saved results file.
- The password is shared by hand; there are no user accounts.
