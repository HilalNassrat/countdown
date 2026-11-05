// Unit tests for countdown-core.js – run with: npm test   (runs in Europe/Berlin time zone)
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../countdown-core.js');
const local = (...a) => new Date(...a).getTime();

test('läuft in Europe/Berlin', () => assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/Berlin'));

test('parts: einfache Differenz', () => {
  assert.deepEqual(C.parts(local(2026, 10, 5, 12, 0, 0), local(2026, 10, 7, 13, 30, 15)), { d: 2, h: 1, m: 30, s: 15 });
});

test('parts: Sommerzeit-Beginn (29.03.2026) zählt ganze Kalendertage', () => {
  // 28.03. 00:00 → 30.03. 00:00 sind nur 47 echte Stunden, aber 2 Kalendertage
  assert.deepEqual(C.parts(local(2026, 2, 28), local(2026, 2, 30)), { d: 2, h: 0, m: 0, s: 0 });
});

test('parts: Sommerzeit-Ende (25.10.2026)', () => {
  assert.deepEqual(C.parts(local(2026, 9, 24, 12), local(2026, 9, 26, 12)), { d: 2, h: 0, m: 0, s: 0 });
  assert.deepEqual(C.parts(local(2026, 9, 24, 12), local(2026, 9, 26, 11)), { d: 1, h: 23, m: 0, s: 0 });
});

test('parts: Richtung egal, unter einem Tag', () => {
  assert.deepEqual(C.parts(local(2026, 0, 2, 10), local(2026, 0, 1, 22)), { d: 0, h: 12, m: 0, s: 0 });
  assert.deepEqual(C.parts(0, 0), { d: 0, h: 0, m: 0, s: 0 });
});

test('Teilen-Link: hin und zurück, auch mit Sonderzeichen', () => {
  const it = { name: 'Flug | Jakarta 100% & „Ramadan“', at: 1767225600000 };
  const url = C.shareUrl('https://hilalnassrat.github.io/countdown/?x=1#a', it);
  assert.deepEqual(C.parseShare(new URL(url).search), it);
});

test('Teilen-Link: altes Format ?add=name|ms bleibt gültig, kaputte Links → null', () => {
  assert.deepEqual(C.parseShare('?add=' + encodeURIComponent('Abgabe') + '|1767225600000'), { name: 'Abgabe', at: 1767225600000 });
  assert.deepEqual(C.parseShare('?add=100%25|5'), { name: '100%', at: 5 }); // früher: URIError → App kaputt
  assert.equal(C.parseShare('?add=nur-name'), null);
  assert.equal(C.parseShare('?n=&t=5'), null);
  assert.equal(C.parseShare('?n=x&t=abc'), null);
  assert.equal(C.parseShare('?n=' + 'x'.repeat(200) + '&t=5').name.length, 60);
});

test('ICS-Export: ganztägig vs. mit Uhrzeit, Escaping, Zeilenumbruch', () => {
  const ics = C.buildIcs([
    { id: 'a', name: 'Ramadan; Beginn, 1447', at: local(2027, 1, 8) },
    { id: 'b', name: 'Flug', at: Date.UTC(2026, 11, 20, 7, 45) },
    { id: 'c', name: 'L'.repeat(120), at: Date.UTC(2026, 11, 20, 7, 45) },
  ], Date.UTC(2026, 10, 5));
  assert.match(ics, /DTSTART;VALUE=DATE:20270208\r\nDTEND;VALUE=DATE:20270209/);
  assert.match(ics, /SUMMARY:Ramadan\; Beginn\\, 1447/);
  assert.match(ics, /DTSTART:20261220T074500Z/);
  assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
  // round trip
  const back = C.parseIcs(ics);
  assert.deepEqual(back.map(e => e.name), ['Ramadan; Beginn, 1447', 'Flug', 'L'.repeat(60)]);
  assert.equal(back[0].at, local(2027, 1, 8));
  assert.equal(back[1].at, Date.UTC(2026, 11, 20, 7, 45));
});

test('ICS-Import: TZID, Windows-Zonen, schwebende Zeit, gefaltete Zeilen', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'SUMMARY:Meeting Singapur', 'DTSTART;TZID=Asia/Singapore:20261110T090000', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Outlook-Termin', 'DTSTART;TZID="W. Europe Standard Time":20260801T183000', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Lokal', 'DTSTART:20261224T180000', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Sehr lang', ' er Titel', 'DTSTART:20261224T170000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Ohne Datum', 'END:VEVENT',
    'END:VCALENDAR'].join('\r\n');
  const ev = C.parseIcs(ics);
  assert.equal(ev.length, 4);
  assert.equal(ev[0].at, Date.UTC(2026, 10, 10, 1, 0));          // 09:00 SGT = 01:00 UTC
  assert.equal(ev[1].at, Date.UTC(2026, 7, 1, 16, 30));          // 18:30 CEST = 16:30 UTC
  assert.equal(ev[2].at, local(2026, 11, 24, 18, 0));
  assert.equal(ev[3].name, 'Sehr langer Titel');
});

test('zonedToEpoch: Zeit in der Sommerzeit-Lücke wird verschoben statt verworfen', () => {
  const t = C.zonedToEpoch(2026, 3, 29, 2, 30, 0, 'Europe/Berlin');
  assert.ok(Number.isFinite(t));
});
