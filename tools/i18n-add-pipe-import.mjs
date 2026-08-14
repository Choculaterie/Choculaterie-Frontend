#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const comps = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.component.ts')) comps.push(full);
    }
})('src');

let added = 0;
for (const file of comps) {
    let src = fs.readFileSync(file, 'utf8');
    const html = file.replace(/\.ts$/, '.html');
    const usesPipe = /\|\s*t\b/.test(src)
        || (fs.existsSync(html) && /\|\s*t\b/.test(fs.readFileSync(html, 'utf8')));
    if (!usesPipe || /\bTPipe\b/.test(src)) continue;

    const depth = path.relative(path.dirname(file), 'src/app/core/i18n').split(path.sep).join('/');
    const importPath = (depth.startsWith('.') ? depth : './' + depth) + '/t.pipe';
    src = src.replace(/^(import .*?;\n)/s, `$1import { TPipe } from '${importPath}';\n`);

    const m = src.match(/imports:\s*\[/);
    if (!m) continue;
    src = src.replace(/imports:\s*\[/, 'imports: [TPipe, ');
    fs.writeFileSync(file, src);
    added++;
}
console.log('components updated:', added);
