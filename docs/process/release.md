# Versioning and releases

@tag:versioning

How the extension is versioned, where the version is shown, and how a release is
built, tested and published. Back to the [documentation index](../index.md).

## Version fields

Two version fields live in [`../../extension-src/metadata.json`](../../extension-src/metadata.json)
and always move together (the release workflow bumps both):

- **`version`** — an **integer**, the extensions.gnome.org (EGO) version *code*.
  EGO requires it to strictly increase; every release increments it by exactly
  one. It is `1` before the first publication.
- **`version-name`** — a human-readable **semver** string `A.B.C` (currently
  `"0.1.0"`). This is what users see.

[`../../package.json`](../../package.json) `version` is kept in sync with
`version-name`.

### Release channel badge

The current release is **alpha** (pre-publication / early testing). The alpha
status is a separate *channel*, not part of the semver number, so it is not
encoded in `version-name`. It lives in
[`../../extension-src/version.ts`](../../extension-src/version.ts) as the
`RELEASE_CHANNEL` constant and is rendered as a badge next to the version:

- `RELEASE_CHANNEL = 'alpha'` → shown as `0.1.0 (alpha)` in the menu and an
  `alpha` accent pill in preferences.
- Set `RELEASE_CHANNEL = ''` for a stable release (no badge).

`version.ts` is a gi-free pure module (loads in both the Shell and preferences
processes) and is unit tested in
[`../../tests/version.test.mjs`](../../tests/version.test.mjs).

### Release policy

- **alpha `0.x.y`** now (pre-publication / early testing).
- becomes **beta** once published on extensions.gnome.org.
- becomes **`1.0.0`** once it is known to work across a reasonably wide range of
  operating systems with no big problems.

### Which part to bump

The part follows from **what the version adds for the user**, not from how large
the diff was:

| Part | Bump it when |
| --- | --- |
| **major** `A` | the widget configuration schema or the plugin contract breaks compatibility with what is installed. Held at `0` until the extension is known to work widely (see the release policy above). |
| **minor** `B` | **a new widget ships**, or the panel host itself gains a user-visible capability — a new menu, a new positioning mode, a new way to place widgets. |
| **patch** `C` | everything else: bug fixes, and changes *inside* existing widgets — new options, reworked rendering, extra menu items. Plus documentation, build and internals. |

**A new widget is always a minor bump, however small it is.** The catalog of
widgets is what a user picks this extension for, so "which version brought
`app-windows`?" has to be answerable from the version number alone; hiding a new
widget in a patch release makes the number say nothing. A new *option* of an
existing widget is the opposite case — it is a patch, because nobody installs a
version for it.

The rule applies from the release **after** 0.2.3: 0.2.3 itself shipped the
`app-windows` widget as a patch, cut before the rule was written.

## Where the version is shown

- **Control-button menu** — a non-reactive header row at the top of the menu
  shows `GNOME Widget Panel` with `0.1.0 (alpha)` right-aligned, plus a **Release
  notes** item, built in
  [`../../extension-src/controlButton.ts`](../../extension-src/controlButton.ts) from
  `systemInfo.versionDisplay()` / `systemInfo.releaseNotesUrl()`.
- **Preferences → About** — the name/version row shows `Version 0.1.0` with an
  `alpha` badge suffix, plus an **All releases & GNOME support** row (see
  [`preferences.md`](../implementation/preferences.md)).
- **Bug reports** — `collectSystemInfo()` reports `Extension version: 0.1.0
  (alpha)`.

`systemInfo.versionName()` / `versionDisplay()` read `version-name` best-effort
from the bundled `metadata.json`, so the value is available in the Shell process
too (where `this.metadata` is not to hand).

### About links point to the running version's notes

The About affordances link to release information for the **exact version
installed**, not a generic page:

- `systemInfo.releaseNotesUrl()` → `…/releases/tag/vA.B.C` for the running
  `version-name` — the per-version [release-notes page](#release-notes-from-issues).
  Used by the menu **Release notes** item and the preferences name/version row.
- `systemInfo.changelogUrl` → `…/blob/main/CHANGELOG.md` — the
  [changelog overview](#changelog-and-gnome-support-matrix). Used by the
  preferences **All releases & GNOME support** row.

## Release notes from issues

Release notes are built from the GitHub **issues** attached to a release — the
standard GitHub mechanism for that is a **milestone** (one per release):

1. While developing a release, assign its issues to a milestone. Give it the
   release version as its title (`vA.B.C` or `A.B.C`) so it is auto-matched, or
   pass the milestone title explicitly via the workflow's `milestone` input.
2. On release, `.github/scripts/release-notes.mjs` collects that milestone's
   **closed** issues, groups them by label (`widget-request` → New widgets,
   `enhancement` → Features, `bug` → Fixes, …) and writes
   `dist/release-notes.md`.
3. That file becomes the **GitHub Release body** for `vA.B.C`. The version is in
   the release URL, and the body stays **hand-editable on GitHub** after
   publication. `generate_release_notes: true` appends GitHub's auto "What's
   Changed" (merged PRs, new contributors) beneath it.
4. The workflow then renames the milestone to `vA.B.C` and closes it, so it
   archives exactly which issues shipped in the version.

When no milestone matches (e.g. the first release), issue collection is skipped
and the notes are auto-generated only — the release still succeeds.

## Changelog and GNOME support matrix

Two committed files give the "all releases" overview and are regenerated by
`release-notes.mjs` on every release:

- **[`releases.json`](releases.json)** — a machine-readable ledger, one entry per
  release: `version`, integer `code`, `date`, the `shellVersions` that release
  supported, its notes `url`, and the grouped `issues`.
- **`CHANGELOG.md`** (repository root) — generated from the ledger. It opens with
  a **GNOME Shell support matrix** — for each GNOME Shell version, the *minimum*
  and *latest* plugin version that supports it — so a user on a given GNOME
  version can see which plugin version to install. Below that is a
  reverse-chronological list of releases, each linking to its GitHub Release
  notes.

`CHANGELOG.md` is generated (regenerated each release), so durable prose belongs
in the per-release GitHub Release body or in `releases.json` entries; the matrix
and links are derived automatically.

## GitHub Actions

Two workflows live in [`../../.github/workflows/index.md`](../../.github/workflows/index.md);
their helper scripts live in [`../../.github/scripts`](../../.github/scripts).

### CI (`ci.yml`)

Runs on **every push, on every branch**, and on every pull request: `npm ci`, `npm run
typecheck`, then `npm test` (which builds `extension-src` → `extension` and runs
the gi-free unit tests). UI tests (`npm run test:ui`) need a live GNOME Shell
host and are not run in CI.

### Release (`release.yml`)

Triggered **manually** from the Actions tab (`workflow_dispatch`) with a `bump`
input (`patch` / `minor` / `major` / `none` — see
[Which part to bump](#which-part-to-bump)), an optional `milestone` input and the
`ego_upload` switch (on by default; turn it **off** while an earlier version is
still queued for review — see
[One version in the review queue at a time](#one-version-in-the-review-queue-at-a-time)).
`none` releases the current version unchanged — intended for the **first**
publication (EGO version code may still be `1`); every later release must bump,
because EGO requires the integer code to strictly increase. Steps:

1. **Bump** — `.github/scripts/bump-version.mjs <bump>` increments
   `version-name` (per the chosen part) and the integer `version` (+1), and
   syncs `package.json` (`none` = no change). The new `version-name` and `code`
   are exported as step outputs.
2. **Verify** — `npm run typecheck` and `npm test`.
3. **Pack** — `npm run pack` (`.github/scripts/pack.sh`) builds and zips
   `extension/` into `dist/<uuid>.shell-extension.zip`. The zip has
   `metadata.json` at its root (EGO requirement) and omits the compiled
   `gschemas.compiled`.
4. **Release notes** — `.github/scripts/release-notes.mjs` collects the release
   milestone's closed issues, writes `dist/release-notes.md` and regenerates
   `CHANGELOG.md` + `docs/process/releases.json` (see
   [Release notes from issues](#release-notes-from-issues)).
5. **Commit + tag** — commits the version bump *and the regenerated
   `CHANGELOG.md` / `docs/process/releases.json`* to `main` and pushes tag `vA.B.C`.
6. **GitHub Release** — publishes the tag with the issue-based notes body + the
   zip attached (`softprops/action-gh-release`). The reliable, automated
   artifact.
7. **Close milestone** — renames the matched milestone to `vA.B.C` and closes it
   (skipped when none matched).
8. **extensions.gnome.org** — best-effort: `.github/scripts/ego-upload.py`
   submits the zip to EGO for **manual review** (see caveat below). Skipped when
   `ego_upload` is off or the `EGO_*` secrets are absent.

### Required secrets

| Secret | Used by | Purpose |
| --- | --- | --- |
| `EGO_USERNAME` | `release.yml` → `ego-upload.py` | extensions.gnome.org account username/email |
| `EGO_PASSWORD` | `release.yml` → `ego-upload.py` | extensions.gnome.org account password |

`GITHUB_TOKEN` (built-in) is used for the commit, tag, release, reading the
milestone's issues and closing the milestone; the workflow requests
`contents: write` and `issues: write`. If the `EGO_*` secrets are absent the EGO
step is skipped and the release still succeeds via the GitHub Release.

> **Branch protection:** the release job pushes the version-bump commit and tag
> back to `main`. If `main` is protected against direct pushes, allow the
> Actions bot (or a PAT) to push, or run the release from an unprotected branch.

### extensions.gnome.org caveat

EGO has **no official upload API**. `ego-upload.py` drives the website's own
login + upload forms, so it depends on unversioned HTML and may break if EGO
changes. A successful upload only **submits the version into GNOME's manual
review queue** — it does not publish anything; a human reviewer approves it
later. The step therefore runs with `continue-on-error: true`. If it fails,
upload `dist/<uuid>.shell-extension.zip` by hand at
<https://extensions.gnome.org/upload/>.

### One version in the review queue at a time

EGO keeps **one submitted version per extension** in review: a new upload
**auto-rejects** whatever was queued, and starts again at the back of a queue
that is weeks long. That already happened twice here — 0.1.0 was auto-rejected by
0.2.1, and 0.2.1 by 0.2.2.

So the two halves of a release are not equally free while a version is
`Unreviewed`. Cutting a **GitHub** release costs nothing; **uploading to EGO**
throws away the place in the queue:

- Release with **`ego_upload` off**. Tag, GitHub Release and zip happen as usual,
  EGO is left alone. The zip can be uploaded by hand later at
  <https://extensions.gnome.org/upload/>.
- Turn it on when the queue is clear, or when the queued version is being
  replaced **on purpose** — the reviewer asked for a fix, or the pending version
  has a defect worth losing the place for.
- `tools/ego-status.py` prints which version is queued and with what status
  (`Unreviewed` / `Rejected` / `Active`); the dispatcher watches it for us — see
  [`promotion.md`](promotion.md).

## Branches: `dev` while it is built, `release/A.B.C` once it has a number

Work starts long before anyone can say which version it will become. Naming the
branch after the version therefore asks for the one fact nobody has yet — whether
this turns out to be a fix (patch), a new widget (minor) or something larger. So
the working branch carries no version in its name at all, and is given one at the
moment the number becomes a fact: the release.

| Where | What it holds | How long |
| --- | --- | --- |
| `dev` | the work in flight — as many commits as it takes, one per finished task | until a release renames it |
| `release/A.B.C` | **how that version was built**: the same commits, now under the number they produced | while the history is still worth reading |
| `main` | **one commit per released version**, tagged `vA.B.C` | forever — this is the list of published versions, matching what users installed from extensions.gnome.org |

Three properties hold at once because of that split:

- **Every released version is always present.** `main` and its tag carry the
  released tree and depend on no branch, so deleting branches can never lose a
  release.
- **A version's own commits outlive its release**, under `release/A.B.C`.
- **They may be dropped later.** Nothing durable points at them: `CHANGELOG.md`,
  [`releases.json`](releases.json) and the extension's About links all address
  tags and GitHub Releases, never branches.

What follows from it:

- **All work goes on `dev`**, never on `main`; `main` moves only during a release.
- **One `dev` at a time.** Two versions in flight is the exception now, not the
  norm: when it is genuinely needed — a hotfix while `dev` carries something big —
  cut a named branch off `main` for it and release it the same way.
- **Once it has a number, the name is the version, not the task**: `release/0.2.3`,
  not `v0.2.3`, because a branch sharing a name with the tag makes
  `git checkout 0.2.3` ambiguous.
- **Never rewrite `main` or a `release/*` branch** once pushed. `dev` is the one
  exception, and by construction rather than by force: a release renames the old
  `dev` away and starts a fresh one from `main`, so the remote branch is deleted
  and recreated, never force-pushed over.
- CI runs on every branch, so `dev` is tested like any other. The UI suite
  (`npm run test:ui`) still runs locally — CI has no GNOME Shell.

## Cutting a release

1. (Optional) create/fill a **milestone** for the release and assign its issues;
   name it `vA.B.C` for auto-matching, or note its title for the `milestone`
   input.
2. **Green suite on `dev`, then give the version its number** — the part follows
   from what shipped, see [Which part to bump](#which-part-to-bump):

   ```bash
   git checkout dev
   npm test && npm run test:ui          # the version as a whole, on its branch

   git branch -m dev release/A.B.C      # the number is a fact now — name the branch
   git push origin release/A.B.C        # push it under the new name
   git push origin :dev                 # drop the stale remote dev
   ```

3. **Squash that branch onto `main` as the one commit this version gets:**

   ```bash
   git checkout main
   git merge --squash release/A.B.C
   git commit -m "release: prepare vA.B.C"
   git push origin main
   ```

   A squash rather than a merge: a real merge would drag every development commit
   into `main`, and it would stop being the list of published versions.
4. Open the repository **Actions** tab → **Release** → **Run workflow**, with
   the branch selector on **`main`** (the workflow commits the version bump and
   the tag to the branch it was dispatched from).
5. Pick the `bump` part (`patch` / `minor` / `major` / `none`) — the same part the
   branch was just named after — optionally the `milestone` title, and — if an
   earlier version is still in EGO review — clear the `ego_upload` checkbox, then
   run.
6. The workflow bumps, tests, builds notes from the milestone, tags, publishes
   the GitHub Release, closes the milestone and submits to EGO. Watch the run;
   the EGO step is advisory.
7. Afterwards you can freely **edit the GitHub Release body** to refine the
   notes.
8. **Start the next `dev`** from the release commit — development continues
   there, never on `main`:

   ```bash
   git checkout main && git pull        # the workflow's "release: vA.B.C" commit
   git checkout -b dev
   git push -u origin dev
   ```

   `release/A.B.C` stays behind as the archive of how the version was built.
   Delete it once that history stops being worth reading — `git branch -D
   release/A.B.C` and `git push origin :release/A.B.C`; the version itself lives
   on `main` under its tag.

To build a zip locally without releasing: `npm run pack` →
`dist/<uuid>.shell-extension.zip`.
