#!/usr/bin/env node
// @ts-nocheck
//
// Build post-processor: reinsert blank lines into the generated
// `extension/**/*.js`. `tsc` strips every blank line when it emits JS, so the
// shipped extension would otherwise be an unreadable wall of code (the EGO
// reviewers read the generated JS). This runs AFTER `tsc` in `build.sh` and
// restores the spacing required by AGENTS.md "Code formatting":
//
//   - TWO blank lines between top-level functions.
//   - THREE blank lines between top-level classes, including
//     `const X = GObject.registerClass(class X ... )` assignments.
//   - ONE blank line separating the import block from the rest of the code;
//     consecutive imports stay grouped (no blank line between them).
//   - ONE blank line between other adjacent top-level statements.
//   - A comment block that immediately precedes a declaration stays attached to
//     it: the blank lines go BEFORE the comment, not between comment and decl
//     (we keep each statement's leading comments and only strip leading blank
//     lines).
//
// The pass is idempotent: leading blank lines are stripped and re-inserted from
// the statement kinds, so running it twice yields the same output.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'extension');


function listJsFiles(dir) {
    const results = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            results.push(...listJsFiles(full));
        } else if (entry.endsWith('.js')) {
            results.push(full);
        }
    }
    return results;
}


function isClassLike(stmt, text) {
    if (ts.isClassDeclaration(stmt)) return true;
    // `const X = GObject.registerClass(class X ... )` assignments are classes.
    return ts.isVariableStatement(stmt) && text.includes('registerClass');
}


// Number of blank lines to place BETWEEN the previous statement and `cur`.
function blanksBefore(prev, cur, curText) {
    const prevImport = ts.isImportDeclaration(prev);
    const curImport = ts.isImportDeclaration(cur);
    if (prevImport && curImport) return 0; // keep imports grouped
    // The import block is separated from the rest of the code by exactly one
    // blank line, even when the first statement after it is a function/class.
    if (prevImport && !curImport) return 1;
    if (ts.isFunctionDeclaration(cur)) return 2;
    if (isClassLike(cur, curText)) return 3;
    return 1;
}


// Statement text with leading blank lines stripped but leading comments kept,
// and trailing whitespace removed.
function statementText(stmt, source) {
    return stmt
        .getFullText(source)
        .replace(/^(?:[ \t]*\r?\n)+/, '')
        .replace(/\s+$/, '');
}


function formatSource(code) {
    const source = ts.createSourceFile(
        'file.js',
        code,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.JS,
    );
    const statements = source.statements;
    if (statements.length === 0) {
        return code.replace(/\s+$/, '') + (code.trim() === '' ? '' : '\n');
    }
    let out = statementText(statements[0], source);
    for (let i = 1; i < statements.length; i += 1) {
        const cur = statements[i];
        const curText = statementText(cur, source);
        const blanks = blanksBefore(statements[i - 1], cur, curText);
        out += '\n'.repeat(blanks + 1) + curText;
    }
    return out + '\n';
}


function main() {
    const files = listJsFiles(outDir);
    for (const file of files) {
        const original = readFileSync(file, 'utf8');
        const formatted = formatSource(original);
        if (formatted !== original) {
            writeFileSync(file, formatted);
        }
    }
}


main();
