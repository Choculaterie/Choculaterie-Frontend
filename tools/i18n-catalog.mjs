import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const CATALOG_ASSET = 'public/assets/i18n-messages.json';

function decodeXml(v) {
    return v.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function scanPipeStrings(dir = 'src', found = new Map()) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { scanPipeStrings(full, found); continue; }
        if (!/\.(html|ts)$/.test(entry.name)) continue;

        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/'((?:[^'\\]|\\.)*)'\s*\|\s*t\b/g)) {
            const text = m[1].replace(/\\'/g, "'");
            if (text.trim()) found.set(text, full);
        }
        for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"\s*\|\s*t\b/g)) {
            const text = m[1].replace(/\\"/g, '"');
            if (text.trim()) found.set(text, full);
        }
        // A piped expression rather than a bare literal, e.g.
        //   {{ (busy() ? 'Generating...' : 'Generate') | t }}
        // Neither branch is followed directly by "| t", so take every literal inside.
        for (const m of src.matchAll(/\(((?:[^()]|\([^()]*\))*)\)\s*\|\s*t\b/g)) {
            for (const q of m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
                const text = (q[1] ?? q[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
                if (text.trim()) found.set(text, full);
            }
        }
    }
    return found;
}

function pipeId(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    return `t${(h >>> 0).toString(36)}`;
}

export function buildCatalog() {
    execFileSync('npx', ['ng', 'extract-i18n', '--format=json', '--out-file=/tmp/i18n-msgs.json'],
        { stdio: 'ignore' });
    const messages = JSON.parse(fs.readFileSync('/tmp/i18n-msgs.json', 'utf8')).translations ?? {};

    let locations = {};
    let placeholders = {};
    try {
        execFileSync('npx', ['ng', 'extract-i18n', '--format=xlf2', '--out-file=/tmp/i18n-msgs.xlf'],
            { stdio: 'ignore' });
        const xml = fs.readFileSync('/tmp/i18n-msgs.xlf', 'utf8');
        for (const m of xml.matchAll(/<unit id="([^"]+)">([\s\S]*?)<\/unit>/g)) {
            const loc = m[2].match(/<note category="location">([^<]+)<\/note>/);
            if (loc) locations[m[1]] = loc[1];

            const phs = [...m[2].matchAll(/<ph\b[^>]*equiv="([^"]+)"[^>]*disp="([^"]*)"/g)]
                .map(x => ({ token: `{$${x[1]}}`, expr: decodeXml(x[2]) }));
            if (phs.length) {
                const seen = new Set();
                placeholders[m[1]] = phs.filter(x => !seen.has(x.token) && seen.add(x.token));
            }
        }
    } catch {
    }

    const scanned = scanPipeStrings();

    const labelsFile = 'src/app/i18n/labels.ts';
    if (fs.existsSync(labelsFile)) {
        const src = fs.readFileSync(labelsFile, 'utf8');
        for (const m of src.matchAll(/^\s*[A-Za-z0-9_]+:\s*'((?:[^'\\]|\\.)*)'/gm)) {
            const text = m[1].replace(/\\'/g, "'");
            if (text.trim()) scanned.set(text, labelsFile);
        }
        for (const m of src.matchAll(/=>\s*`((?:[^`\\]|\\.)*)`/g)) {
            if (m[1].trim()) scanned.set(m[1], labelsFile);
        }
    }

    const pipeKeys = [...scanned].map(([text, file]) => ({
        id: pipeId(text),
        sourceText: text,
        sourceLocation: file,
        placeholders: null,
    }));
    for (const k of pipeKeys) messages[k.id] = k.sourceText;

    return {
        messages,
        keys: pipeKeys.concat(Object.keys(messages)
            .filter((id) => !id.startsWith('t'))
            .map((id) => ({
            id,
            sourceText: messages[id],
            sourceLocation: locations[id] ?? null,
            placeholders: placeholders[id] ?? null,
        }))),
    };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const { keys } = buildCatalog();
    const out = path.resolve(CATALOG_ASSET);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ keys }));
    console.log(`${keys.length} keys → ${CATALOG_ASSET}`);
}
