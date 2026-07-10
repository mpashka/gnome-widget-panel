#!/usr/bin/env node
// Bump the extension version for a release. Invoked by the Release workflow
// (.github/workflows/release.yml) with one argument: `patch`, `minor` or
// `major`.
//
// Two version fields live in extension-src/metadata.json and must move together:
//   - `version`      integer EGO version *code*; increments by exactly 1 on
//                    every release (EGO requires a strictly increasing integer).
//   - `version-name` human-readable semver string `A.B.C`; bumped per the
//                    requested part.
// package.json `version` is kept in sync with `version-name`.
//
// The new version-name is written to $GITHUB_OUTPUT as `version` (without a
// leading `v`) so later workflow steps can tag and name the release. See
// ../../docs/release.md.

import {readFileSync, writeFileSync, appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const part = process.argv[2];
if (!['patch', 'minor', 'major', 'none'].includes(part)) {
    console.error(
        `Usage: bump-version.mjs <patch|minor|major|none> (got: ${part})`
    );
    process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const metadataPath = join(repoRoot, 'extension-src', 'metadata.json');
const packagePath = join(repoRoot, 'package.json');

const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));

const current = String(metadata['version-name'] ?? '0.0.0');
const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
if (!match) {
    console.error(`Cannot parse version-name "${current}" as A.B.C`);
    process.exit(1);
}
let [major, minor, patch] = match.slice(1).map(Number);
if (part === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
} else if (part === 'minor') {
    minor += 1;
    patch = 0;
} else if (part === 'patch') {
    patch += 1;
}
// `none` releases the current version unchanged (intended for the very first
// publication, whose EGO version code may still be 1). EGO requires the integer
// `version` to strictly increase on *every* upload, so `none` is only valid
// once — later releases must bump.
const nextName = `${major}.${minor}.${patch}`;

if (part !== 'none') {
    metadata['version-name'] = nextName;
    metadata.version = Number(metadata.version ?? 0) + 1;
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');

    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    pkg.version = nextName;
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

    console.error(
        `Bumped ${current} -> ${nextName} (EGO version code ${metadata.version})`
    );
} else {
    console.error(
        `Releasing current version ${nextName} unchanged ` +
            `(EGO version code ${metadata.version}).`
    );
}

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        `version=${nextName}\ncode=${metadata.version}\n`
    );
}
