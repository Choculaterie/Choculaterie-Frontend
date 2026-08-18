/**
 * Renders the schematics grid in each locale and fails on console errors, an empty
 * date (missing CLDR data) or text identical to English (bundle never loaded).
 *
 * Usage:  node locale-smoke.mjs   |   BASE=http://localhost:4321 node locale-smoke.mjs
 */
import assert from 'node:assert';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'https://choculaterie.com';
const LOCALES = (process.env.LOCALES ?? 'en,fr').split(',');

// The sandbox this runs in cannot resolve the API host; those failures are not
// what this check is about.
const IGNORE = /ERR_NAME_NOT_RESOLVED|ERR_FAILED|Failed to load resource/;

const browser = await chromium.launch();
let failures = 0;
let englishNav = null;

for (const loc of LOCALES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]); });

    await page.addInitScript((l) => localStorage.setItem('choculaterie.locale', l), loc);
    await page.goto(`${BASE}/schematics`, { waitUntil: 'domcontentloaded' });
    await page.locator('app-schematic-card').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);

    const cards = await page.locator('app-schematic-card').count();
    const date = await page.locator('app-schematic-card .card-date').first().innerText().catch(() => '');
    const nav = await page.locator('app-navbar').first().innerText().catch(() => '');
    const real = errs.filter((e) => !IGNORE.test(e));
    if (loc === 'en') englishNav = nav;

    console.log(`${loc}: ${cards} cards, sample date ${JSON.stringify(date)}, ${real.length} errors`);
    for (const e of [...new Set(real)].slice(0, 5)) console.log('    ', e.slice(0, 160));

    try {
        assert.ok(cards > 0, `${loc}: no cards rendered`);
        assert.ok(date.trim(), `${loc}: card date rendered empty, locale data is probably missing`);
        assert.deepStrictEqual(real, [], `${loc}: console errors`);
        // A non-source locale that renders identical text to English means the
        // bundle never arrived, which is exactly how the CORS bug looked.
        if (loc !== 'en' && englishNav) {
            assert.notStrictEqual(nav, englishNav, `${loc}: navbar identical to English, bundle did not load`);
        }
    } catch (e) {
        failures++;
        console.log(`  FAIL ${e.message.split('\n')[0]}`);
    }
    await ctx.close();
}

await browser.close();
if (failures) {
    console.log(`locale smoke FAILED (${failures}/${LOCALES.length})`);
    process.exit(1);
}
console.log('locale smoke ok');
