#!/usr/bin/env node
// Build the release notes for a version from its GitHub issues and keep the
// changelog overview in sync. Invoked by the Release workflow after the version
// bump. Standard-GitHub-mechanism based: issues are attached to a **milestone**
// (one per release); this script collects that milestone's closed issues,
// groups them by label, and writes:
//
//   - dist/release-notes.md  — the body for the GitHub Release `vA.B.C` (the
//       per-version release-notes page; the version is in its URL). It stays
//       hand-editable on GitHub after publication, and the workflow lets GitHub
//       append its auto-generated "What's Changed" section below it.
//   - docs/releases.json     — a machine-readable ledger (one entry per release)
//       that also records the GNOME Shell versions each release supported.
//   - CHANGELOG.md           — regenerated from the ledger: a GNOME Shell
//       support matrix (which plugin version to install for a given GNOME
//       version) plus a reverse-chronological list linking each release.
//
// Inputs (argv + env):
//   argv[2]            version-name, e.g. "0.1.0" (required)
//   env RELEASE_CODE   integer EGO version code (defaults to ledger + metadata)
//   env RELEASE_DATE   YYYY-MM-DD (defaults to today, UTC)
//   env RELEASE_MILESTONE  milestone title holding this release's issues
//                          (optional; falls back to "vA.B.C" / "A.B.C")
//   env GITHUB_REPOSITORY  owner/repo (Actions sets it; else parsed from
//                          metadata.json url)
//   env GITHUB_TOKEN / GH_TOKEN  API token (optional; without it issue
//                          collection is skipped and notes are auto-only)
//   env GITHUB_OUTPUT  step outputs sink (milestone_number, notes_url)
//
// Never throws out to the workflow over a GitHub API hiccup: issue collection is
// best-effort and degrades to "no tracked issues". See ../../docs/release.md.

import {readFileSync, writeFileSync, appendFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const version = process.argv[2];
if (!version) {
    console.error('Usage: release-notes.mjs <version-name>');
    process.exit(1);
}

const metadata = JSON.parse(
    readFileSync(join(repoRoot, 'extension-src', 'metadata.json'), 'utf8')
);
const shellVersions = (metadata['shell-version'] ?? []).map(String);
const code = Number(process.env.RELEASE_CODE ?? metadata.version ?? 0);
const date = process.env.RELEASE_DATE || new Date().toISOString().slice(0, 10);

// owner/repo and the canonical repo URL.
let repoSlug = process.env.GITHUB_REPOSITORY || '';
if (!repoSlug) {
    const m = String(metadata.url ?? '').match(/github\.com\/([^/]+\/[^/]+)/);
    repoSlug = m ? m[1].replace(/\.git$/, '') : '';
}
const repoUrl = `https://github.com/${repoSlug}`;
const tag = `v${version}`;
const notesUrl = `${repoUrl}/releases/tag/${tag}`;
const changelogUrl = `${repoUrl}/blob/main/CHANGELOG.md`;

// ---- GitHub API (best-effort) -------------------------------------------

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

async function api(path) {
    const res = await fetch(`https://api.github.com${path}`, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'gnome-widget-panel-release',
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
    });
    if (!res.ok)
        throw new Error(`GitHub API ${path} -> ${res.status}`);
    return res.json();
}

// Category buckets, in display order. First matching label wins.
const CATEGORIES = [
    {key: 'widgets', title: '🧩 New widgets', labels: ['widget-request', 'widget']},
    {key: 'features', title: '✨ Features & improvements', labels: ['enhancement', 'feature']},
    {key: 'fixes', title: '🐛 Fixes', labels: ['bug']},
    {key: 'docs', title: '📚 Documentation', labels: ['documentation', 'docs']},
    {key: 'other', title: '📦 Other', labels: []},
];

function categorize(labels) {
    const names = new Set(labels.map((l) => (l.name || l).toLowerCase()));
    for (const cat of CATEGORIES) {
        if (cat.labels.length && cat.labels.some((l) => names.has(l)))
            return cat.key;
    }
    return 'other';
}

async function collectIssues() {
    if (!repoSlug || !token) {
        console.error('No repo/token; skipping milestone issue collection.');
        return {milestoneNumber: '', issues: []};
    }
    try {
        const wanted = [
            process.env.RELEASE_MILESTONE,
            tag,
            version,
        ].filter(Boolean);
        const milestones = await api(
            `/repos/${repoSlug}/milestones?state=all&per_page=100`
        );
        const milestone = milestones.find((m) => wanted.includes(m.title));
        if (!milestone) {
            console.error(`No milestone matching ${wanted.join(' / ')}.`);
            return {milestoneNumber: '', issues: []};
        }
        const raw = await api(
            `/repos/${repoSlug}/issues?milestone=${milestone.number}` +
                `&state=closed&per_page=100`
        );
        const issues = raw
            .filter((i) => !i.pull_request)
            .map((i) => ({
                number: i.number,
                title: i.title,
                url: i.html_url,
                category: categorize(i.labels ?? []),
            }));
        console.error(
            `Milestone "${milestone.title}" (#${milestone.number}): ` +
                `${issues.length} closed issues.`
        );
        return {milestoneNumber: String(milestone.number), issues};
    } catch (e) {
        console.error(`Issue collection failed (${e.message}); using none.`);
        return {milestoneNumber: '', issues: []};
    }
}

// ---- Formatting helpers -------------------------------------------------

// Compress a set of GNOME Shell major versions into a compact human string,
// e.g. ["46","47","48","50"] -> "46–48, 50".
function formatShellVersions(list) {
    const nums = [...new Set(list.map(Number))].sort((a, b) => a - b);
    if (nums.length === 0)
        return 'unknown';
    const parts = [];
    let start = nums[0];
    let prev = nums[0];
    for (let i = 1; i <= nums.length; i++) {
        if (i < nums.length && nums[i] === prev + 1) {
            prev = nums[i];
            continue;
        }
        parts.push(start === prev ? `${start}` : `${start}–${prev}`);
        if (i < nums.length) {
            start = nums[i];
            prev = nums[i];
        }
    }
    return parts.join(', ');
}

function issueSections(issues) {
    const lines = [];
    for (const cat of CATEGORIES) {
        const inCat = issues.filter((i) => i.category === cat.key);
        if (inCat.length === 0)
            continue;
        lines.push(`### ${cat.title}`);
        for (const i of inCat)
            lines.push(`- ${i.title} ([#${i.number}](${i.url}))`);
        lines.push('');
    }
    return lines;
}

// ---- Build the GitHub Release body --------------------------------------

function buildReleaseBody(issues) {
    const lines = [];
    lines.push(
        `Release **${tag}** (${date}). Supported GNOME Shell: ` +
            `${formatShellVersions(shellVersions)}.`
    );
    lines.push('');
    if (issues.length === 0) {
        lines.push('_No tracked issues were attached to this release._');
        lines.push('');
    } else {
        lines.push(...issueSections(issues));
    }
    lines.push(
        `See the [full changelog and GNOME Shell support matrix](${changelogUrl}).`
    );
    lines.push('');
    return lines.join('\n');
}

// ---- Ledger + CHANGELOG.md ----------------------------------------------

function loadLedger() {
    try {
        const data = JSON.parse(
            readFileSync(join(repoRoot, 'docs', 'releases.json'), 'utf8')
        );
        if (Array.isArray(data.releases))
            return data;
    } catch (_e) {
        // fall through to a fresh ledger
    }
    return {schema: 1, releases: []};
}

function upsertLedger(ledger, entry) {
    const rest = ledger.releases.filter((r) => r.version !== entry.version);
    rest.push(entry);
    // Newest first, by integer EGO code.
    rest.sort((a, b) => Number(b.code) - Number(a.code));
    ledger.releases = rest;
    return ledger;
}

function renderChangelog(ledger) {
    const releases = ledger.releases;
    const out = [];
    out.push('# Changelog');
    out.push('');
    out.push(
        'Every released version of GNOME Widget Panel. This file is generated ' +
            'from `docs/releases.json` by the release workflow; each version ' +
            'links to its full, hand-editable release notes on GitHub. See ' +
            '[`docs/release.md`](docs/release.md) for the process.'
    );
    out.push('');

    // GNOME Shell support matrix: for each GNOME major that any release
    // supported, the minimum and latest plugin version that supports it. Use
    // this to pick which plugin version to install for a given GNOME version.
    const majors = [
        ...new Set(releases.flatMap((r) => (r.shellVersions ?? []).map(Number))),
    ].sort((a, b) => a - b);
    if (majors.length) {
        out.push('## GNOME Shell support matrix');
        out.push('');
        out.push(
            'Which plugin version to install for your GNOME Shell version:'
        );
        out.push('');
        out.push('| GNOME Shell | Min plugin version | Latest plugin version |');
        out.push('| --- | --- | --- |');
        for (const major of majors) {
            const supporting = releases
                .filter((r) => (r.shellVersions ?? []).map(Number).includes(major))
                .sort((a, b) => Number(a.code) - Number(b.code));
            if (!supporting.length)
                continue;
            const min = supporting[0];
            const latest = supporting[supporting.length - 1];
            out.push(
                `| ${major} | [${min.version}](${min.url}) | ` +
                    `[${latest.version}](${latest.url}) |`
            );
        }
        out.push('');
    }

    out.push('## Releases');
    out.push('');
    if (releases.length === 0) {
        out.push('_No releases yet._');
        out.push('');
    }
    for (const r of releases) {
        out.push(`### [${'v' + r.version}](${r.url}) — ${r.date}`);
        out.push('');
        out.push(`Supported GNOME Shell: ${formatShellVersions(r.shellVersions ?? [])}.`);
        out.push('');
        const issues = r.issues ?? [];
        if (issues.length) {
            for (const cat of CATEGORIES) {
                const inCat = issues.filter((i) => i.category === cat.key);
                if (!inCat.length)
                    continue;
                out.push(`**${cat.title}**`);
                out.push('');
                for (const i of inCat)
                    out.push(`- ${i.title} ([#${i.number}](${i.url}))`);
                out.push('');
            }
        }
        out.push(`[Release notes →](${r.url})`);
        out.push('');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---- Run ----------------------------------------------------------------

const {milestoneNumber, issues} = await collectIssues();

mkdirSync(join(repoRoot, 'dist'), {recursive: true});
writeFileSync(
    join(repoRoot, 'dist', 'release-notes.md'),
    buildReleaseBody(issues)
);

const ledger = upsertLedger(loadLedger(), {
    version,
    code,
    date,
    shellVersions,
    url: notesUrl,
    milestone: process.env.RELEASE_MILESTONE || tag,
    issues,
});
writeFileSync(
    join(repoRoot, 'docs', 'releases.json'),
    JSON.stringify(ledger, null, 2) + '\n'
);
writeFileSync(join(repoRoot, 'CHANGELOG.md'), renderChangelog(ledger));

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        `milestone_number=${milestoneNumber}\nnotes_url=${notesUrl}\n`
    );
}

console.error(
    `Release notes for ${tag}: ${issues.length} issues, ` +
        `CHANGELOG + ledger updated.`
);
