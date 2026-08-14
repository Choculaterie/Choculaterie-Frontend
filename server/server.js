#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '4000', 10);
const STATIC_DIR = process.env.STATIC_DIR ?? path.join(__dirname, 'public');
const API_BASE = process.env.API_BASE ?? 'http://localhost:5289';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? 'https://backend.choculaterie.com';
const SITE_NAME = 'Choculaterie';
const SITE_URL = 'https://choculaterie.com';
const DEFAULT_TITLE = `${SITE_NAME} - Minecraft Schematics`;
const DEFAULT_DESC = 'Browse, download and share Minecraft schematics on Choculaterie.';
const FALLBACK_IMAGE = `${SITE_URL}/server_logo.png`;

// Crawlers fetch HTML once and never run JS, so they need correct OG tags up front.
const CRAWLER_UA_RE = /bot|facebookexternalhit|whatsapp|telegram|slack|discord|embedly|quora link preview|showyoubot|outbrain|pinterest|vkshare|redditbot|w3c_validator/i;
function isCrawlerUA(ua) {
    return !!ua && CRAWLER_UA_RE.test(ua);
}

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.gif': 'image/gif',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.webp': 'image/webp',
    '.wasm': 'application/wasm',
    '.zip': 'application/zip',
};

// ── Internal API fetch (no auth, public endpoints) ───────────────────────────
function apiGet(path) {
    return new Promise((resolve) => {
        const url = `${API_BASE}${path}`;
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { Accept: 'application/json' } }, (res) => {
            if (res.statusCode !== 200) { res.resume(); return resolve(null); }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    });
}

// Same as apiGet, but for a raw binary body (the litematic file itself) rather than JSON.
function apiGetBuffer(path) {
    return new Promise((resolve) => {
        const url = `${API_BASE}${path}`;
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, (res) => {
            if (res.statusCode !== 200) { res.resume(); return resolve(null); }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', () => resolve(null));
        req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    });
}

// Uploads a file as multipart/form-data; hand-rolled, not worth a form-data library for this.
function apiPutFile(path, fieldName, filename, buffer, contentType) {
    return new Promise((resolve) => {
        const boundary = `----choculaterieBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
        const head = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
            `Content-Type: ${contentType}\r\n\r\n`,
        );
        const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([head, buffer, tail]);

        const url = `${API_BASE}${path}`;
        const mod = url.startsWith('https') ? https : http;
        const req = mod.request(url, {
            method: 'PUT',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
            },
        }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(15000, () => { req.destroy(); resolve(false); });
        req.end(body);
    });
}

// ── Build OG meta tags string ─────────────────────────────────────────────────
function buildMeta(title, description, image, type = 'website') {
    const esc = (s) => (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const t = esc(title);
    const d = esc(description);
    const img = image || FALLBACK_IMAGE;
    return [
        `<meta property="og:title" content="${t}" />`,
        `<meta property="og:description" content="${d}" />`,
        `<meta property="og:type" content="${type}" />`,
        `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
        `<meta property="og:image" content="${esc(img)}" />`,
    ].join('\n  ');
}

// ── Static route → title map (must match what Angular's app.ts sets) ─────────
const ROUTE_TITLES = {
    '': SITE_NAME,
    'schematics': 'Schematics',
    'mods': 'Mods',
    'users': 'Users',
    'faq': 'Faq',
    'translations': 'Translations',
    'admin': 'Admin',
    'viewer': 'Viewer',
    'save-manager': 'Save manager',
    'not-found': 'Not found',
};

// ── Fetch meta for a given URL path ───────────────────────────────────────────
async function resolveMeta(urlPath, isCrawler) {
    // /schematics/:id
    const schematicMatch = urlPath.match(/^\/schematics\/([0-9a-f-]{36})\/?$/i);
    if (schematicMatch) {
        const data = await apiGet(`/api/Schematics/${schematicMatch[1]}`);
        if (data) {
            const title = data.name;
            const description = (data.description ?? '').trim().substring(0, 200)
                || `A Minecraft schematic by ${data.authorName ?? 'unknown'} on ${SITE_NAME}.`;
            const pic = data.pictures?.[0]?.filePath;
            const image = pic
                ? (pic.startsWith('http') ? pic : `${PUBLIC_API_URL}/images/schematics/${pic}`)
                : null;
            return { title, metaBlock: buildMeta(title, description, image, 'website') };
        }
    }

    // /users/:username
    const userMatch = urlPath.match(/^\/users\/([^/?#]+)\/?$/);
    if (userMatch) {
        const data = await apiGet(`/api/Users/${encodeURIComponent(userMatch[1])}`);
        if (data) {
            const username = data.username ?? userMatch[1];
            const title = username;
            const description = (data.biographie ?? '').trim().substring(0, 200)
                || `${username}'s profile on ${SITE_NAME}.`;
            const fp = data.filePath;
            const image = fp
                ? (fp.startsWith('http') ? fp : `${PUBLIC_API_URL}/images/users/${fp}`)
                : null;
            return { title, metaBlock: buildMeta(title, description, image, 'profile') };
        }
    }

    // /qs/:id  - quick share (uses /qs/{id}/info to get screenshotPath without triggering the 302 redirect)
    const qsMatch = urlPath.match(/^\/qs\/([^/?#]+)\/?$/);
    if (qsMatch) {
        const id = qsMatch[1];
        let data = await apiGet(`/qs/${id}/info`);

        // Rendering takes ~1s, so crawlers can block on it; visitors get it
        // fire-and-forget.
        if (data && !data.screenshotPath) {
            if (isCrawler) {
                await generateQsScreenshot(id);
                data = await apiGet(`/qs/${id}/info`) ?? data;
            } else {
                generateQsScreenshot(id);
            }
        }

        if (data) {
            const title = 'Quick Share';
            const description = 'Minecraft litematic quick share, expires in 48 hours.';
            const fp = data.screenshotPath;
            const image = fp
                ? (fp.startsWith('http') ? fp : `${PUBLIC_API_URL}/images/schematics/${fp}`)
                : null;
            return { title, metaBlock: buildMeta(title, description, image, 'website') };
        }
    }

    // Known SPA list/section routes - return the same short title Angular will set
    const firstSegment = urlPath.split('/').filter(Boolean)[0] ?? '';
    if (firstSegment in ROUTE_TITLES) {
        const title = ROUTE_TITLES[firstSegment];
        return { title, metaBlock: buildMeta(title, DEFAULT_DESC, FALLBACK_IMAGE) };
    }

    return null;
}

// ── Quick-share screenshot generation ────────────────────────────────────────
// qs-render meshes with nucleation, the same WASM the browser viewer uses, then
// rasterizes on the CPU. No browser; ~1s even at 100k blocks.
const QS_PACK_PATH = path.join(STATIC_DIR, 'assets', 'litematic-viewer', 'pack.zip');
const qsGenerating = new Set(); // lock: IDs currently being rendered
let qsRenderer = null;

// Dynamic import because nucleation ships ESM only and this file is CommonJS.
function getQsRenderer() {
    qsRenderer ??= import('./qs-render.mjs');
    return qsRenderer;
}

async function generateQsScreenshot(id) {
    // Prevent duplicate concurrent renders of the same id.
    if (qsGenerating.has(id)) return;
    qsGenerating.add(id);

    try {
        const started = Date.now();
        const fileBuffer = await apiGetBuffer(`/qs/${id}/litematic`);
        if (!fileBuffer) {
            console.error(`Screenshot for qs/${id}: failed to fetch litematic file`);
            return;
        }

        const { renderLitematic } = await getQsRenderer();
        const pngBuffer = await renderLitematic(fileBuffer, { packPath: QS_PACK_PATH, size: 1024 });

        const uploaded = await apiPutFile(`/qs/${id}/screenshot`, 'file', 'preview.png', pngBuffer, 'image/png');
        console.log(`Screenshot for qs/${id}: ${uploaded ? 'success' : 'upload failed'} in ${Date.now() - started}ms`);
    } catch (err) {
        console.error(`Failed to generate screenshot for qs/${id}:`, err.message);
    } finally {
        qsGenerating.delete(id);
    }
}

// ── Read index.html once and cache it ────────────────────────────────────────
let indexHtmlCache = null;
function getIndexHtml() {
    if (!indexHtmlCache) {
        indexHtmlCache = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
    }
    return indexHtmlCache;
}

// On SIGHUP invalidate cache (useful after deploy without restart)
process.on('SIGHUP', () => { indexHtmlCache = null; console.log('Index cache cleared.'); });

// ── Replace static OG placeholders in index.html ─────────────────────────────
// Look for the static defaults block we control and swap them out
const STATIC_META_RE = /<title>[^<]*<\/title>[\s\S]*?(<\/head>)/;

function injectMeta(html, title, metaBlock) {
    const esc = (s) => (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    // Replace <title>
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    // Remove the static OG comment marker
    html = html.replace(/[ \t]*<!--[ \t]*Static OpenGraph[^\n]*-->\n?/gi, '');
    // Remove any existing og: / twitter: meta tags
    html = html.replace(/[ \t]*<meta\s+property="og:[^>]*\/?>\n?/gi, '');
    html = html.replace(/[ \t]*<meta\s+name="twitter:[^>]*\/?>\n?/gi, '');
    // Inject fresh tags right before </head>
    return html.replace('</head>', `  ${metaBlock}\n</head>`);
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    // Strip query string
    const urlPath = (req.url || '/').split('?')[0];


    // Try to serve as a static file first.
    // Only treat known asset extensions as files — usernames like "beanie._.boi"
    // produce a fake extension (".boi") and must fall through to the SPA.
    const filePath = path.join(STATIC_DIR, urlPath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext && MIME[ext] && ext !== '.html') {
        // Static asset - serve directly
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[ext] ?? 'application/octet-stream',
                'Cache-Control': ext === '.js' || ext === '.css'
                    ? 'public, max-age=31536000, immutable'
                    : 'public, max-age=3600',
            });
            res.end(data);
        });
        return;
    }

    // SPA route - serve index.html with injected meta
    try {
        const resolved = await resolveMeta(urlPath, isCrawlerUA(req.headers['user-agent']));
        let html = getIndexHtml();
        // Always inject OG meta - use resolved data or fall back to site defaults
        const title = resolved?.title ?? DEFAULT_TITLE;
        const metaBlock = resolved?.metaBlock ?? buildMeta(DEFAULT_TITLE, DEFAULT_DESC, FALLBACK_IMAGE);
        html = injectMeta(html, title, metaBlock);
        // Never let the CDN cache SPA HTML under asset-like URLs for long
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
        });
        res.end(html);
    } catch (err) {
        console.error('Error serving', urlPath, err);
        res.writeHead(500);
        res.end('Internal server error');
    }
});

server.listen(PORT, () => {
    console.log(`Choculaterie frontend server running on port ${PORT}`);
    console.log(`  Static: ${STATIC_DIR}`);
    console.log(`  API:    ${API_BASE}`);
});

function shutdown() {
    console.log('Shutting down...');
    server.close();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
