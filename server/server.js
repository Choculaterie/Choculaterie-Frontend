#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const STATIC_DIR = process.env.STATIC_DIR ?? path.join(__dirname, 'public');
const API_BASE = process.env.API_BASE ?? 'http://localhost:5289';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? 'https://backend.choculaterie.com';
const SITE_NAME = 'Choculaterie';
const SITE_URL = 'https://choculaterie.com';
const DEFAULT_TITLE = `${SITE_NAME} - Minecraft Schematics`;
const DEFAULT_DESC = 'Browse, download and share Minecraft schematics on Choculaterie.';
const FALLBACK_IMAGE = `${SITE_URL}/server_logo.png`;

const CRAWLER_UA_RE = /bot|facebookexternalhit|whatsapp|telegram|slack|discord|embedly|quora link preview|showyoubot|outbrain|pinterest|vkshare|redditbot|w3c_validator/i;
function isCrawlerUA(ua) {
    return !!ua && CRAWLER_UA_RE.test(ua);
}

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

function buildVideoMeta(title, description, video) {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const base = `${PUBLIC_API_URL}${video.mediaBase ?? `/media/videos/${video.id}`}`;
    const stream = `${base}/video.mp4`;
    const thumb = video.hasThumbnail
        ? `${base}/thumbnail/${new Date(video.updatedAt ?? 0).getTime()}`
        : FALLBACK_IMAGE;
    const tags = [
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(description)}" />`,
        `<meta property="og:type" content="video.other" />`,
        `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
        `<meta property="og:url" content="${esc(`${SITE_URL}/videos/${video.id}`)}" />`,
        `<meta property="og:image" content="${esc(thumb)}" />`,
        `<meta property="og:video" content="${esc(stream)}" />`,
        `<meta property="og:video:secure_url" content="${esc(stream)}" />`,
        `<meta property="og:video:type" content="video/mp4" />`,
        `<meta name="twitter:card" content="player" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:image" content="${esc(thumb)}" />`,
        `<meta name="twitter:player:stream" content="${esc(stream)}" />`,
    ];
    if (video.width && video.height) {
        tags.push(`<meta property="og:video:width" content="${video.width}" />`);
        tags.push(`<meta property="og:video:height" content="${video.height}" />`);
    }
    return tags.join('\n  ');
}

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
    'videos': 'Videos',
    'not-found': 'Not found',
};

async function resolveMeta(urlPath, isCrawler) {

    const schematicMatch = urlPath.match(/^\/schematics\/([0-9a-f-]{36})\/?$/i);
    if (schematicMatch) {
        const data = await apiGet(`/api/Schematics/${schematicMatch[1]}`);
        if (data) {
            const title = `${data.name} · ${SITE_NAME}`;
            const description = (data.description ?? '').trim().substring(0, 200)
                || `A Minecraft schematic by ${data.authorName ?? 'unknown'} on ${SITE_NAME}.`;
            const pic = data.pictures?.[0]?.filePath;
            const image = pic
                ? (pic.startsWith('http') ? pic : `${PUBLIC_API_URL}/images/schematics/${pic}`)
                : null;
            return { title, metaBlock: buildMeta(title, description, image, 'website') };
        }
    }

    const userMatch = urlPath.match(/^\/users\/([^/?#]+)\/?$/);
    if (userMatch) {
        const data = await apiGet(`/api/Users/${encodeURIComponent(userMatch[1])}`);
        if (data) {
            const username = data.username ?? userMatch[1];
            const title = `${username} · ${SITE_NAME}`;
            const description = (data.biographie ?? '').trim().substring(0, 200)
                || `${username}'s profile on ${SITE_NAME}.`;
            const fp = data.filePath;
            const image = fp
                ? (fp.startsWith('http') ? fp : `${PUBLIC_API_URL}/images/users/${fp}`)
                : null;
            return { title, metaBlock: buildMeta(title, description, image, 'profile') };
        }
    }

    const videoMatch = urlPath.match(/^\/videos\/([A-Za-z0-9]{1,16})\/?$/);
    if (videoMatch) {
        const data = await apiGet(`/api/Videos/${videoMatch[1]}`);
        if (data) {
            const title = `${data.title} · ${SITE_NAME}`;
            const description = (data.description ?? '').trim().substring(0, 200) || `A video on ${SITE_NAME}.`;
            return { title, metaBlock: buildVideoMeta(title, description, data) };
        }
    }

    const qsMatch = urlPath.match(/^\/qs\/([^/?#]+)\/?$/);
    if (qsMatch) {
        const id = qsMatch[1];
        let data = await apiGet(`/qs/${id}/info`);

        if (data && !data.screenshotPath) {
            if (isCrawler) {
                await generateQsScreenshot(id);
                data = await apiGet(`/qs/${id}/info`) ?? data;
            } else {
                generateQsScreenshot(id);
            }
        }

        if (data) {
            const title = `${id}.litematic · ${SITE_NAME}`;
            const description = 'Minecraft litematic quick share, expires in 48 hours.';
            const fp = data.screenshotPath;
            const image = fp
                ? (fp.startsWith('http') ? fp : `${PUBLIC_API_URL}/images/schematics/${fp}`)
                : null;
            return { title, metaBlock: buildMeta(title, description, image, 'website') };
        }
    }

    const firstSegment = urlPath.split('/').filter(Boolean)[0] ?? '';
    if (firstSegment in ROUTE_TITLES) {
        const label = ROUTE_TITLES[firstSegment];
        const title = firstSegment === '' ? label : `${label} · ${SITE_NAME}`;
        return { title, metaBlock: buildMeta(title, DEFAULT_DESC, FALLBACK_IMAGE) };
    }

    return null;
}

const QS_PACK_PATH = path.join(STATIC_DIR, 'assets', 'litematic-viewer', 'pack.zip');
const qsGenerating = new Set();
let qsRenderer = null;

function getQsRenderer() {
    qsRenderer ??= import('./qs-render.mjs');
    return qsRenderer;
}

async function generateQsScreenshot(id) {

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

let indexHtmlCache = null;
function getIndexHtml() {
    if (!indexHtmlCache) {
        indexHtmlCache = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
    }
    return indexHtmlCache;
}

process.on('SIGHUP', () => { indexHtmlCache = null; console.log('Index cache cleared.'); });

const STATIC_META_RE = /<title>[^<]*<\/title>[\s\S]*?(<\/head>)/;

function injectMeta(html, title, metaBlock) {
    const esc = (s) => (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`);

    html = html.replace(/[ \t]*<!--[ \t]*Static OpenGraph[^\n]*-->\n?/gi, '');

    html = html.replace(/[ \t]*<meta\s+property="og:[^>]*\/?>\n?/gi, '');
    html = html.replace(/[ \t]*<meta\s+name="twitter:[^>]*\/?>\n?/gi, '');

    return html.replace('</head>', () => `  ${metaBlock}\n</head>`);
}

const server = http.createServer(async (req, res) => {

    const urlPath = (req.url || '/').split('?')[0];

    const staticRoot = path.resolve(STATIC_DIR);
    const filePath = path.resolve(staticRoot, '.' + decodeURIComponent(urlPath));
    if (filePath !== staticRoot && !filePath.startsWith(staticRoot + path.sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    const ext = path.extname(filePath).toLowerCase();

    if (ext && MIME[ext] && ext !== '.html') {

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[ext] ?? 'application/octet-stream',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': ext === '.js' || ext === '.css'
                    ? 'public, max-age=31536000, immutable'
                    : 'public, max-age=3600',
            });
            res.end(data);
        });
        return;
    }

    try {
        const resolved = await resolveMeta(urlPath, isCrawlerUA(req.headers['user-agent']));
        let html = getIndexHtml();

        const title = resolved?.title ?? DEFAULT_TITLE;
        const metaBlock = resolved?.metaBlock ?? buildMeta(DEFAULT_TITLE, DEFAULT_DESC, FALLBACK_IMAGE);
        html = injectMeta(html, title, metaBlock);

        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
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
