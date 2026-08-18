/**
 * Lists labels.ts entries that no component references. The catalog builder scans
 * that file wholesale, so a dead entry still reaches translators. Read-only.
 */
import fs from 'node:fs';
import path from 'node:path';

const LABELS = 'src/app/i18n/labels.ts';
const src = fs.readFileSync(LABELS, 'utf8');

// Collect GROUP -> [keys], tracking nesting so nested objects are attributed.
const groups = [];
let current = null;
for (const line of src.split('\n')) {
    const g = line.match(/^export const ([A-Z0-9_]+)\s*=/);
    if (g) { current = { name: g[1], keys: [] }; groups.push(current); continue; }
    if (!current) continue;
    const k = line.match(/^\s{4}([A-Za-z0-9_]+):/);
    if (k) current.keys.push(k[1]);
}

const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|html)$/.test(e.name) && p !== LABELS) files.push(p);
    }
})('src');
const haystack = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// Text reachable through a template pipe stays in the catalog regardless of labels.
const pipeTexts = new Set();
for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/'((?:[^'\\]|\\.)*)'\s*\|\s*t\b/g)) pipeTexts.add(m[1].replace(/\\'/g, "'"));
    for (const m of t.matchAll(/"((?:[^"\\]|\\.)*)"\s*\|\s*t\b/g)) pipeTexts.add(m[1]);
}

// Values, so we can tell a dead label from one whose text still ships via a pipe.
const values = {};
{
    let cur = null;
    for (const line of src.split('\n')) {
        const g = line.match(/^export const ([A-Z0-9_]+)\s*=/);
        if (g) { cur = g[1]; values[cur] = {}; continue; }
        if (!cur) continue;
        const k = line.match(/^\s{4}([A-Za-z0-9_]+):\s*'((?:[^'\\]|\\.)*)'/);
        if (k) values[cur][k[1]] = k[2].replace(/\\'/g, "'");
    }
}

let orphans = [], dupes = 0, live = 0;
for (const g of groups) {
    const groupUsed = new RegExp(`\\b${g.name}\\b`).test(haystack);
    const dynamic = new RegExp(`\\b${g.name}\\s*\\[`).test(haystack);
    for (const k of g.keys) {
        const referenced = new RegExp(`\\b${g.name}\\.${k}\\b`).test(haystack);
        if (referenced || (groupUsed && dynamic)) { live++; continue; }
        const text = values[g.name]?.[k];
        if (text && pipeTexts.has(text)) { dupes++; continue; }
        orphans.push(`${g.name}.${k}` + (text ? `  = ${JSON.stringify(text)}` : ''));
    }
}
for (const o of orphans) console.log('  ' + o);
console.log(`\nlabel keys: ${live + dupes + orphans.length}`);
console.log(`  referenced in code : ${live}`);
console.log(`  unreferenced, but text still shipped via a | t pipe : ${dupes}`);
console.log(`  TRUE ORPHANS (reach translators, appear nowhere in the UI) : ${orphans.length}`);
