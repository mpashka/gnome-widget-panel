# Public presence: wiki, store listing, screenshots

`@tag:process`

Where users meet the project, and how to keep those places current. Back to the
[process index](index.md).

## Where things live

- **GitHub wiki** — <https://github.com/mpashka/gnome-widget-panel/wiki> — the
  user-facing entry point the extensions.gnome.org listing links to. It is a
  separate git repository:
  `git@github.com:mpashka/gnome-widget-panel.wiki.git` (branch `master`). Pages:
  `Home`, `Getting-Started`, `Widgets`, `AI-Agent-Workflow`, `_Sidebar`; images
  under `images/`, referenced by absolute raw URL
  (`https://raw.githubusercontent.com/wiki/mpashka/gnome-widget-panel/images/<file>`).
- **extensions.gnome.org (EGO)** —
  <https://extensions.gnome.org/extension/10381/gnome-widget-panel/> — the store
  listing. The homepage link shown there comes from the `url` field of
  [`../../extension-src/metadata.json`](../../extension-src/metadata.json) and is
  re-applied on every upload, so editing it only on the site does not stick —
  change the field. It points at the **wiki**, which is the page users should
  land on. `.github/scripts/release-notes.mjs` falls back to parsing the
  owner/repo out of this same field when `GITHUB_REPOSITORY` is unset; the
  `/wiki` suffix leaves that parse intact.
- **The user guide in this repository** —
  [`../specification/`](../specification/index.md) — the authoritative
  description. Wiki pages summarise it and link to it; they must not contradict
  it.

## Screenshots

Regenerate them with [`../../tools/wiki-screenshots.sh`](../../tools/wiki-screenshots.sh):

```bash
npm run build
GWP_UI_MONITOR=1500x1400 tools/wiki-screenshots.sh    # -> dist/wiki-screenshots/
```

It boots the UI test harness's isolated headless GNOME Shell, fills the graph
widgets' sample buffers so a *graph* widget is not photographed empty, captures
the panel expanded and collapsed, then opens the preferences window, resizes it
to the work area and captures it whole. Give the virtual monitor enough height
for the settings window to fit; the crop is exactly the window frame.

The session runs with its own `HOME`: the preferences window looks for "Hide Top
Bar" under `GLib.get_home_dir()`, and with the real home it renders a
machine-specific "Hide Top Bar is still installed" warning that has no business
in a published screenshot.

Copy the PNGs into the wiki repository's `images/` and push.

## Releasing to the store

The Release workflow's EGO step is best-effort and drives the website's forms;
treat the GitHub Release as the reliable artifact and expect to upload by hand:

1. Take `gnome-widget-panel@mpashka.github.com.shell-extension.zip` from the
   GitHub Release (or rebuild it with `npm run pack` — the same bytes).
2. Upload it at <https://extensions.gnome.org/upload/>.
3. EGO requires the integer `version` in `metadata.json` to strictly increase,
   and reviewers read the **generated** `extension/*.js` — see
   [`release.md`](release.md) and the "Code formatting" section of
   [`../../AGENTS.md`](../../AGENTS.md).

A listing in **"Waiting for author"** means a reviewer expects a new upload from
you; uploading the next version is how that state is cleared.

## Checking the review state

[`../../tools/ego-status.py`](../../tools/ego-status.py) answers "is it approved
yet?" without credentials: `/extension-info/?uuid=<uuid>` returns 404 while the
extension is unpublished and JSON once it is live (exit code 10 vs 0).

Logged in — `EGO_USERNAME` or `EGO_LOGIN`, plus `EGO_PASSWORD` — it also reads
the pages the public gets a 404 for:

- `/extension/<id>/` — the per-version table: version → status (Unreviewed,
  Rejected, Active, Inactive) with a link to each version's review;
- `/review/<pk>/` — the **reviewer's comments** on that version and the findings
  of **Shexli**, EGO's automated checker: rule code, severity, the rule text and
  every file:line it hit.

```bash
. ~/.profile                       # EGO_LOGIN / EGO_PASSWORD live there
tools/ego-status.py                                  # human-readable
tools/ego-status.py --state ~/.cache/gwp-ego.json    # exit 20 when anything changed
tools/ego-status.py --dump-html /tmp/ego             # keep the HTML when parsing fails
```

`--state` is what a watcher polls: it stores the comparable part of the result
and exits **20** the moment a status, a comment or a Shexli finding changes.

The page markup is unversioned and changes without notice, so an unparsed page is
reported as an error, never as "nothing to see"; re-fix the selectors from
`--dump-html` output instead of guessing.

Reviewer feedback also arrives by **email** to the account owner. Fixing a review
comment always means a new release: EGO requires the integer `version` to
strictly increase, so the loop is fix → `bump=patch` release → upload the new zip.
Uploading a new version **auto-rejects** the previous one ("Auto-rejected because
of new version … was uploaded") — that is bookkeeping, not a verdict.
