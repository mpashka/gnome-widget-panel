# GitHub workflows index

@tag:versioning

Continuous integration and release automation. Full details, the versioning
scheme and required secrets are in
[`../../docs/release.md`](../../docs/release.md).

## Files

- `ci.yml` — build, type-check and unit-test on every push to `main` and pull
  request (`npm ci` → `npm run typecheck` → `npm test`).
- `release.yml` — manually dispatched (`workflow_dispatch`, `bump` =
  patch/minor/major). Bumps the version, tests, packs the EGO zip, commits +
  tags the bump, publishes a GitHub Release and best-effort submits to
  extensions.gnome.org.

## Helper scripts ([`../scripts/`](../scripts))

- `bump-version.mjs` — increment `version-name` (A.B.C) and the integer EGO
  `version` in `metadata.json`, sync `package.json`, export the new version to
  `$GITHUB_OUTPUT`.
- `pack.sh` — build and zip `extension/` into
  `dist/<uuid>.shell-extension.zip` (metadata.json at root, no compiled schema);
  also runnable locally via `npm run pack`.
- `release-notes.mjs` — collect the release milestone's closed issues into
  `dist/release-notes.md` (the GitHub Release body) and regenerate `CHANGELOG.md`
  + `docs/releases.json` (the GNOME support matrix / overview).
- `ego-upload.py` — best-effort upload of the zip to extensions.gnome.org for
  manual review (no official API; see the caveat in `release.md`).

Back to the [repository index](../../index.md).
