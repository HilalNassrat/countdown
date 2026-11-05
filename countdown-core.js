/* Countdown – pure logic (no DOM). Used by index.html and by the unit tests in tests/. */
(function (root) {
  'use strict';
  const DAY = 864e5;

  // Days/hours/minutes/seconds between two moments, counted in *calendar days* of the local time zone.
  // A plain ms/86400000 split is off by one hour across daylight-saving changes
  // (e.g. "1 Tag 23 Std." instead of "2 Tage" over the last weekend of March).
  function parts(from, to) {
    let a = Math.min(from, to), b = Math.max(from, to);
    a = Math.floor(a / 1000) * 1000; b = Math.floor(b / 1000) * 1000;
    const A = new Date(a), B = new Date(b);
    let d = Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / DAY);
    const plusDays = n => { const x = new Date(a); x.setDate(x.getDate() + n); return x.getTime(); };
    while (d > 0 && plusDays(d) > b) d--;
    const rest = Math.max(0, Math.floor((b - plusDays(d)) / 1000));
    return { d, h: Math.floor(rest / 3600), m: Math.floor(rest % 3600 / 60), s: rest % 60 };
  }

  // ---- Share links -------------------------------------------------------
  // New format: ?n=<name>&t=<epoch ms>. Old format (?add=name|ms) is still understood.
  function shareUrl(base, item) {
    const u = new URL(base); u.search = ''; u.hash = '';
    u.searchParams.set('n', item.name); u.searchParams.set('t', String(item.at));
    return u.toString();
  }
  function parseShare(search) {
    const p = new URLSearchParams(search);
    let name = p.get('n'), at = p.get('t');
    if (name == null && p.get('add')) {
      const raw = p.get('add'); const i = raw.lastIndexOf('|');
      if (i > 0) { name = raw.slice(0, i); at = raw.slice(i + 1); try { name = decodeURIComponent(name); } catch { /* already decoded */ } }
    }
    at = Number(at);
    name = (name || '').trim().slice(0, 60);
    if (!name || !Number.isFinite(at) || at < 0 || at > 8.64e15) return null;
    return { name, at };
  }

  // ---- iCalendar (.ics) --------------------------------------------------
  const icsEscape = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsUnescape = s => s.replace(/\\([\;,nN])/g, (_, c) => (c === 'n' || c === 'N') ? '\n' : c);
  const p2 = n => String(n).padStart(2, '0');
  const utcStamp = t => { const d = new Date(t); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`; };
  // Fold lines longer than 75 octets (RFC 5545 §3.1).
  function fold(line) {
    const out = []; let cur = '', bytes = 0;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function buildIcs(list, now = Date.now()) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Countdown//hilalnassrat.github.io//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const it of list) {
      const d = new Date(it.at);
      const allDay = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
      lines.push('BEGIN:VEVENT', `UID:${it.id || it.at}@countdown`, `DTSTAMP:${utcStamp(now)}`);
      if (allDay) {
        const e = new Date(d); e.setDate(e.getDate() + 1);
        const ymd = x => `${x.getFullYear()}${p2(x.getMonth() + 1)}${p2(x.getDate())}`;
        lines.push(`DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(e)}`);
      } else {
        lines.push(`DTSTART:${utcStamp(it.at)}`, `DTEND:${utcStamp(it.at + 36e5)}`);
      }
      lines.push(`SUMMARY:${icsEscape(it.name)}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // Offset (ms) of an IANA time zone at a given instant, e.g. Europe/Berlin in summer → +7200000.
  function tzOffset(t, tz) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const v = {}; for (const { type, value } of f.formatToParts(new Date(t))) v[type] = +value;
    return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - Math.floor(t / 1000) * 1000;
  }
  // Wall-clock time in a time zone → epoch ms. Unknown zone → null.
  function zonedToEpoch(y, mo, d, h, mi, s, tz) {
    try {
      const guess = Date.UTC(y, mo - 1, d, h, mi, s);
      let t = guess - tzOffset(guess, tz);
      t = guess - tzOffset(t, tz);
      return t;
    } catch { return null; }
  }
  // Windows zone names that Outlook writes into TZID, mapped to IANA (most common ones).
  const WIN_TZ = { 'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest', 'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'Turkey Standard Time': 'Europe/Istanbul', 'Arab Standard Time': 'Asia/Riyadh', 'Arabian Standard Time': 'Asia/Dubai', 'Singapore Standard Time': 'Asia/Singapore', 'India Standard Time': 'Asia/Kolkata', 'SE Asia Standard Time': 'Asia/Bangkok', 'Tokyo Standard Time': 'Asia/Tokyo', 'China Standard Time': 'Asia/Shanghai', 'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles', 'Central Standard Time': 'America/Chicago', 'UTC': 'UTC' };

  function parseIcsDate(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (h == null) return new Date(+y, +mo - 1, +d).getTime(); // all-day → local midnight
    if (z) return Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
    let tz = params.TZID && params.TZID.replace(/^"|"$/g, '').replace(/^\/[^/]*\//, '');
    if (tz) { tz = WIN_TZ[tz] || tz; const t = zonedToEpoch(+y, +mo, +d, +h, +mi, +(s || 0), tz); if (t != null) return t; }
    return new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)).getTime(); // floating time → local
  }
  // Returns [{ name, at, uid }] for every VEVENT with a DTSTART.
  function parseIcs(text) {
    const lines = String(text).replace(/\r\n[ \t]|\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let ev = null;
    for (const line of lines) {
      if (/^BEGIN:VEVENT/i.test(line)) { ev = {}; continue; }
      if (/^END:VEVENT/i.test(line)) { if (ev && ev.at != null) out.push({ name: (ev.name || 'Termin').slice(0, 60), at: ev.at, uid: ev.uid }); ev = null; continue; }
      if (!ev) continue;
      const i = line.indexOf(':'); if (i < 0) continue;
      const [key, ...ps] = line.slice(0, i).split(';'); const value = line.slice(i + 1);
      const params = Object.fromEntries(ps.map(p => { const j = p.indexOf('='); return [p.slice(0, j).toUpperCase(), p.slice(j + 1)]; }));
      const K = key.toUpperCase();
      if (K === 'SUMMARY') ev.name = icsUnescape(value).replace(/\s+/g, ' ').trim();
      else if (K === 'DTSTART') ev.at = parseIcsDate(value, params);
      else if (K === 'UID') ev.uid = value;
    }
    return out;
  }

  const api = { parts, shareUrl, parseShare, buildIcs, parseIcs, zonedToEpoch, tzOffset };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.CountdownCore = api;
})(typeof self !== 'undefined' ? self : this);
