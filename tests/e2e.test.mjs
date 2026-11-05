// End-to-end tests (Playwright/Chromium). Run: npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve } from './server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
let server, browser;
before(async () => { server = await serve(ROOT); browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}); });
after(async () => { await browser?.close(); server?.close(); });

async function open({ path = '', viewport = { width: 1440, height: 900 }, now, items } = {}) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'Europe/Berlin', locale: 'de-DE', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith(server.url) && !/^(blob|data):/.test(r.url())) problems.push('third-party: ' + r.url()); });
  if (now) await page.clock.install({ time: now });
  if (items) await page.addInitScript(v => { if (!sessionStorage.seeded) { localStorage.setItem('countdowns.v1', v); sessionStorage.seeded = 1; } }, JSON.stringify(items));
  await page.goto(server.url + path);
  return { page, ctx, problems };
}

test('Anlegen per Tastatur, Anzeige, keine Fehler, keine Anfragen an Dritte', async () => {
  const { page, ctx, problems } = await open({ now: new Date('2026-11-05T12:00:00+01:00') });
  await page.getByRole('button', { name: 'Neuer Countdown' }).click();
  await page.getByLabel('Was zählst du runter?').fill('Flug nach Jakarta');
  await page.getByLabel('Datum', { exact: true }).fill('2026-11-08');
  await page.getByLabel('Uhrzeit').fill('14:30');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Flug nach Jakarta', level: 1 }).waitFor();
  assert.equal(await page.locator('[data-u=d]').textContent(), '03');
  assert.equal(await page.locator('[data-u=h]').textContent(), '02');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('countdowns.v1'))).length, 1);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Sommerzeit: 28.03. → 30.03. zeigt 2 Tage, nicht 1 Tag 23 Std.', async () => {
  const { page, ctx } = await open({ now: new Date('2026-03-28T00:00:00+01:00'), items: [{ id: 'x', name: 'Test', at: new Date('2026-03-30T00:00:00+02:00').getTime(), created: 0 }] });
  assert.equal(await page.locator('[data-u=d]').textContent(), '02');
  assert.equal(await page.locator('[data-u=h]').textContent(), '00');
  await ctx.close();
});

test('Teilen-Link: Dialog zum Übernehmen, Duplikat wird erkannt', async () => {
  const at = new Date('2027-02-08T00:00:00+01:00').getTime();
  const { page, ctx, problems } = await open({ path: `?n=${encodeURIComponent('Ramadan | 100%')}&t=${at}` });
  await page.getByRole('dialog', { name: 'Countdown übernehmen?' }).waitFor();
  assert.equal(await page.getByLabel('Was zählst du runter?').inputValue(), 'Ramadan | 100%');
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByRole('heading', { name: 'Ramadan | 100%', level: 1 }).waitFor();
  assert.equal(new URL(page.url()).search, '');
  await page.goto(server.url + `?n=${encodeURIComponent('Ramadan | 100%')}&t=${at}`);
  await page.getByText('ist schon in deiner Liste').waitFor();
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Alter Link mit Prozentzeichen bringt die App nicht mehr zum Absturz', async () => {
  const { page, ctx, problems } = await open({ path: '?add=100%25%20sicher|1893456000000' });
  await page.getByRole('dialog', { name: 'Countdown übernehmen?' }).waitFor();
  assert.equal(await page.getByLabel('Was zählst du runter?').inputValue(), '100% sicher');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Löschen mit Rückgängig', async () => {
  const { page, ctx } = await open({ items: [{ id: 'a', name: 'Abgabe', at: Date.now() + 864e5 * 3, created: Date.now() }] });
  await page.getByRole('button', { name: '„Abgabe“ löschen' }).click();
  assert.equal(await page.locator('.card').count(), 0);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  assert.equal(await page.locator('.card').count(), 1);
  await ctx.close();
});

test('Kalender: .ics exportieren und wieder importieren', async () => {
  const { page, ctx, problems } = await open({ items: [{ id: 'a', name: 'Prüfung, Teil 1', at: new Date('2027-01-15T09:00:00+01:00').getTime(), created: Date.now() }] });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '„Prüfung, Teil 1“ in Kalender eintragen' }).click()]);
  const ics = await readFile(await dl.path(), 'utf8');
  assert.match(ics, /DTSTART:20270115T080000Z/);
  assert.match(ics, /SUMMARY:Prüfung\\, Teil 1/);
  // import a calendar with a duplicate, a new future event and a past one
  const dir = await mkdtemp(join(tmpdir(), 'cd-'));
  const file = join(dir, 'kalender.ics');
  await writeFile(file, ics.replace('END:VCALENDAR', 'BEGIN:VEVENT\r\nSUMMARY:Abflug Singapur\r\nDTSTART;TZID=Asia/Singapore:20270301T233000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Alt\r\nDTSTART;VALUE=DATE:20200101\r\nEND:VEVENT\r\nEND:VCALENDAR'));
  await page.locator('#icsFile').setInputFiles(file);
  const dlg = page.getByRole('dialog', { name: 'Termine übernehmen' });
  await dlg.waitFor();
  assert.equal(await dlg.locator('.pick').count(), 2); // duplicate skipped
  assert.equal(await dlg.locator('input:checked').count(), 1); // only the future one preselected
  await dlg.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByRole('heading', { name: 'Abflug Singapur', level: 3 }).waitFor();
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('countdowns.v1')));
  assert.equal(saved.find(i => i.name === 'Abflug Singapur').at, Date.UTC(2027, 2, 1, 15, 30));
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('Abgelaufener Termin: Hero wechselt live auf „Vorbei“', async () => {
  const t0 = new Date('2026-11-05T12:00:00+01:00').getTime();
  const { page, ctx } = await open({ now: t0, items: [{ id: 'a', name: 'Gleich', at: t0 + 3000, created: t0 - 1000 }] });
  await page.getByText('Als Nächstes').waitFor();
  await page.clock.runFor(5000);
  await page.locator('.hero.done').waitFor();
  assert.match(await page.locator('.card .sub').textContent(), /Gerade eben/);
  await ctx.close();
});

test('Handy 390 px: kein horizontales Scrollen, Aktionen sichtbar und ≥ 44 px', async () => {
  const { page, ctx, problems } = await open({ viewport: { width: 390, height: 844 }, items: [{ id: 'a', name: 'Ein ziemlich langer Name für einen Countdown', at: Date.now() + 864e5 * 40, created: Date.now() }] });
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p2 = await c2.newPage();
  await p2.addInitScript(() => localStorage.setItem('countdowns.v1', JSON.stringify([{ id: 'a', name: 'Ein ziemlich langer Name für einen Countdown', at: Date.now() + 864e5 * 40, created: Date.now() }])));
  await p2.goto(server.url);
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const box = await p2.getByRole('button', { name: /löschen/ }).boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44);
  assert.deepEqual(problems, []);
  await c2.close();
});

test('Offline nach dem ersten Besuch', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Neuer Countdown' }).waitFor();
  assert.ok(await page.evaluate(() => !!window.CountdownCore));
  await ctx.close();
});
