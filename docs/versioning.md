# Versioning

Review Radar uses semantic versioning: MAJOR.MINOR.PATCH.

| Change | Bump | Example |
|---|---|---|
| Rebuild, or breaks how the app is used or configured | MAJOR | 0.3.0 → 1.0.0 |
| New feature or visible improvement | MINOR | 0.1.0 → 0.2.0 |
| Bug fix or wording only | PATCH | 0.1.0 → 0.1.1 |

The version must match in three places: `package.json`, the top of `CHANGELOG.md`, and the **Current version** line in `README.md`. Each release is also published as a GitHub release with the changelog section as notes.

Versions below 1.0.0 mean the app has not yet been validated on live data.
