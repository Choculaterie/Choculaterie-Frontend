#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(html|ts)$/.test(e.name)) files.push(full);
    }
})('src');

const quote = (t) => `'${t.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const simple = (t) => t.trim() && !/[{}<>]|&[a-z]+;/i.test(t);

let converted = 0, skipped = 0;
const touched = new Set();

for (const file of files) {
    let src = fs.readFileSync(file, 'utf8');
    const before = src;

    src = src.replace(/\bi18n-([a-zA-Z][\w.-]*)\s+(\1)="([^"{}]*)"/g, (m, attr, _a, text) => {
        if (!simple(text)) { skipped++; return m; }
        converted++;
        return `[${attr}]="${quote(text)} | t"`;
    });
    src = src.replace(/\b([a-zA-Z][\w.-]*)="([^"{}]*)"\s+i18n-\1\b/g, (m, attr, text) => {
        if (!simple(text)) { skipped++; return m; }
        converted++;
        return `[${attr}]="${quote(text)} | t"`;
    });

    src = src.replace(/(<([a-zA-Z][\w-]*)\b[^>]*?)\si18n(?=[\s>])([^>]*>)([^<>{}]*)(<\/\2>)/g,
        (m, open, tag, rest, text, close) => {
            if (!simple(text)) { skipped++; return m; }
            converted++;
            return `${open}${rest}{{ ${quote(text.trim())} | t }}${close}`;
        });

    if (src !== before) {
        fs.writeFileSync(file, src);
        touched.add(file);
    }
}

console.log(`converted ${converted}, skipped ${skipped}`);
console.log(`files touched: ${touched.size}`);
fs.writeFileSync('/tmp/i18n-touched.json', JSON.stringify([...touched], null, 1));
