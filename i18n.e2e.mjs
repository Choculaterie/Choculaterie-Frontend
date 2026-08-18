/**
 * Guards: English pays nothing for translation support, a language switch re-renders
 * in place without reloading, the tab title follows it, and a slow bundle never
 * holds up first paint.
 *
 * Run against a dev server:  npx ng serve --port 4321  &&  node i18n.e2e.mjs
 */
import assert from 'node:assert';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4321';

// Real message ids, from public/assets/i18n-messages.json.
const BUNDLE = { t1cc1r: 'ZZ_HOME', tpkcque: 'ZZ_SCHEMATICS', t1fis1: 'ZZ_MODS' };
const PROGRESS = { locales: [{ code: 'fr', label: 'Francais', total: 10, translated: 10 }] };
const CORS = { 'access-control-allow-origin': '*' };

const navText = (page) => page.locator('app-navbar').first().innerText();
const waitNav = (page, pattern, opts) => page.waitForFunction(
    (p) => new RegExp(p).test(document.querySelector('app-navbar')?.innerText ?? ''), pattern, opts);

/** addInitScript runs once per document load, so this separates reloads from pushState. */
const countLoads = () => {
    const n = Number(sessionStorage.getItem('__loads') ?? 0) + 1;
    sessionStorage.setItem('__loads', String(n));
};

async function makeContext(browser, { bundleDelayMs = 0 } = {}) {
    const ctx = await browser.newContext();
    await ctx.route('**/api/Translations/bundle/**', async (r) => {
        if (bundleDelayMs) await new Promise((res) => setTimeout(res, bundleDelayMs));
        await r.fulfill({ json: BUNDLE, headers: CORS });
    });
    await ctx.route('**/api/Translations/progress**', (r) => r.fulfill({ json: PROGRESS, headers: CORS }));
    // Everything else is aborted rather than stubbed: a wrong-shaped body throws
    // inside change detection, which is the very thing being observed.
    await ctx.route('**/api/**', (r) =>
        (/Translations\/(bundle|progress)/.test(r.request().url()) ? r.fallback() : r.abort()));
    return ctx;
}

const browser = await chromium.launch();

// --- 1 + 2 + 3: English untaxed, switch re-renders in place, title follows ------
{
    const ctx = await makeContext(browser);
    const page = await ctx.newPage();
    await page.addInitScript(countLoads);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const t0 = Date.now();
    await page.goto(`${BASE}/schematics`);
    await waitNav(page, 'Schematics');
    console.log(`english first paint: ${Date.now() - t0}ms`);

    const english = await navText(page);
    assert.ok(!/ZZ_/.test(english), `English must not be translated, got:\n${english}`);
    const enTitleOk = await page.waitForFunction(
        () => document.title === 'Schematics', null, { timeout: 5000 },
    ).then(() => true, () => false);
    assert.ok(enTitleOk, `English tab title, got ${JSON.stringify(await page.title())}`);

    await page.locator('button.lang-code').first().click();
    await page.locator('button[mat-menu-item]', { hasText: /Francais/i }).first().click();
    await waitNav(page, 'ZZ_SCHEMATICS', { timeout: 5000 });

    const titleFollowed = await page.waitForFunction(
        () => document.title === 'ZZ_SCHEMATICS', null, { timeout: 5000 },
    ).then(() => true, () => false);
    assert.ok(titleFollowed, `tab title did not follow the language, still ${JSON.stringify(await page.title())}`);
    console.log('tab title after switch:', JSON.stringify(await page.title()));

    const loads = await page.evaluate(() => Number(sessionStorage.getItem('__loads')));
    assert.strictEqual(loads, 1, 'switching language must not reload the page');
    assert.deepStrictEqual(errors, [], 'no page errors while switching');
    console.log('switch ok: re-rendered in place, document loads =', loads);
    await ctx.close();
}

// --- 4: a slow bundle must not block first paint --------------------------------
{
    const STALL = 10_000;
    const ctx = await makeContext(browser, { bundleDelayMs: STALL });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('choculaterie.locale', 'fr'));
    await page.addInitScript(countLoads);

    const t0 = Date.now();
    await page.goto(BASE);
    await waitNav(page, 'Schematics|ZZ_SCHEMATICS', { timeout: STALL - 2000 });
    const paint = Date.now() - t0;
    assert.ok(paint < STALL - 2000, `first paint must not wait for the bundle, took ${paint}ms`);
    console.log(`french first paint behind a ${STALL}ms bundle: ${paint}ms`);

    await waitNav(page, 'ZZ_SCHEMATICS', { timeout: STALL + 5000 });
    const loads = await page.evaluate(() => Number(sessionStorage.getItem('__loads')));
    assert.strictEqual(loads, 1, 'a late bundle must not reload the page');
    console.log(`late bundle applied at ${Date.now() - t0}ms, document loads: ${loads}`);
    await ctx.close();
}

console.log('i18n e2e ok');
await browser.close();
