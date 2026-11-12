/* Questline — data sources.

   A connector brings readings in from somewhere and hands them to ingest(). To add one:

     QL.connectors.register({
       id: 'my-source',                      // also stored as the reading's source
       name: 'My source',
       blurb: 'One line on what it brings in.',
       available() { return { ok: true }; }, // or { ok: false, reason: 'why not right now' }
       async sync(ctx) {                     // ctx.since is a YYYY-MM-DD string
         return [{ metric: 'steps', date: '2026-11-12', value: 8123 }];
       }
     });

   Metric keys are listed in js/catalog.js. The Data screen lists every registered
   connector that has a sync() and gives it a Sync button. */
(function (g) {
  const QL = (g.QL = g.QL || {});
  const U = QL.util;
  const list = [];

  const connectors = {
    register(c) { list.push(c); },
    all() { return list.slice(); },
    get(id) { return list.find(c => c.id === id) || null; },

    /* Stores readings; several readings for one day are combined by the metric's rule. */
    ingest(points, source) {
      const merged = new Map();
      points.forEach(p => {
        const def = QL.engine.metric(p.metric);
        if (!def || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !isFinite(p.value)) return;
        const k = p.metric + '|' + p.date;
        if (merged.has(k) && def.agg === 'sum') merged.get(k).value += Number(p.value);
        else merged.set(k, { metric: p.metric, date: p.date, value: Number(p.value) });
      });
      merged.forEach(p => QL.engine.logValue(p.metric, p.date, p.value, source, 'set', true));
      const events = QL.engine.evaluateAuto(U.today(), true);
      QL.store.commit();
      return { days: merged.size, events };
    },

    removeSource(source) {
      let n = 0;
      QL.store.all('datapoints').forEach(p => { if (p.source === source) { QL.store.remove('datapoints', p.id, true); n++; } });
      QL.store.commit();
      return n;
    }
  };

  /* ---------- CSV files ---------- */

  function parseCSV(text) {
    const rows = []; let row = [], cell = '', inQ = false;
    const t = text.replace(/^﻿/, '');
    const delim = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inQ) {
        if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(c => c.trim() !== '')) rows.push(row);
    return rows;
  }

  /* order: 'dmy' or 'mdy', used only when a date like 03/04/2026 is ambiguous. */
  function parseDate(raw, order) {
    const s = String(raw || '').trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return fmt(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      let d, mo;
      if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; }
      else if (order === 'mdy') { mo = a; d = b; } else { d = a; mo = b; }
      return fmt(y, mo, d);
    }
    const t = Date.parse(s);
    return isNaN(t) ? null : U.dateStr(new Date(t));
  }
  function fmt(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function num(raw) {
    const s = String(raw === undefined ? '' : raw).replace(/[,\s₹$€£]/g, '');
    if (s === '') return NaN;
    return Number(s);
  }

  /* Column names from common exports (Google Fit via Takeout, scales, food logs). */
  const GUESSES = [
    [/^step count$|steps?\b/i, 'steps', 1],
    [/distance \(m\)/i, 'distance_km', 0.001],
    [/distance.*km|^distance$/i, 'distance_km', 1],
    [/move minutes|active minutes|workout|exercise.*min/i, 'workout_min', 1],
    [/body ?fat/i, 'body_fat', 1],
    [/weight/i, 'weight_kg', 1],
    [/protein/i, 'protein_g', 1],
    [/calories? (eaten|in|consumed)|energy.*kcal|^calories$/i, 'calories', 1],
    [/sleep/i, 'sleep_h', 1],
    [/water/i, 'water_l', 1],
    [/saving|balance/i, 'savings', 1]
  ];

  const csv = {
    parseCSV, parseDate,

    /* Looks at a file and proposes which column is the date and what each number column is. */
    inspect(text) {
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('This file has no data rows.');
      const headers = rows[0].map(h => h.trim());
      const body = rows.slice(1);
      const sample = body.slice(0, 25);
      let dateCol = headers.findIndex(h => /date|day|time/i.test(h));
      if (dateCol < 0) dateCol = headers.findIndex((h, i) => sample.every(r => parseDate(r[i], 'dmy')));
      if (dateCol < 0) throw new Error('Could not find a date column in this file.');
      const columns = headers.map((h, i) => {
        if (i === dateCol) return null;
        const numeric = sample.filter(r => String(r[i] || '').trim() !== '');
        if (!numeric.length || !numeric.every(r => isFinite(num(r[i])))) return null;
        const guess = GUESSES.find(gs => gs[0].test(h));
        return { index: i, header: h || 'Column ' + (i + 1), metric: guess ? guess[1] : '', scale: guess ? guess[2] : 1 };
      }).filter(Boolean);
      if (!columns.length) throw new Error('Could not find any number columns in this file.');
      const ambiguous = sample.some(r => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(String(r[dateCol]).trim()));
      return { headers, dateCol, columns, rowCount: body.length, ambiguous, rows: body };
    },

    /* mapping: [{ index, metric, scale }] for the columns to bring in. */
    toPoints(inspected, mapping, order) {
      const points = []; let skipped = 0;
      inspected.rows.forEach(r => {
        const date = parseDate(r[inspected.dateCol], order);
        if (!date) { skipped++; return; }
        mapping.forEach(mp => {
          const v = num(r[mp.index]);
          if (isFinite(v)) points.push({ metric: mp.metric, date, value: v * (mp.scale || 1) });
        });
      });
      return { points, skipped };
    }
  };
  connectors.csv = csv;

  /* ---------- Google Health API (beta) ----------
     Google's cloud API for Fitbit and Pixel Watch data. Health Connect itself keeps data
     on the phone and has no web access, so a web app can only reach Google health data
     this way or through file exports. Needs your own OAuth client ID (see README) and
     the app must be opened from http://localhost or a hosted https address. */
  const GH_BASE = 'https://health.googleapis.com/v4/users/me/dataTypes/';
  const GH_SCOPES = [
    'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly'
  ].join(' ');
  let ghToken = null, ghExpires = 0;

  function loadGIS() {
    return new Promise((resolve, reject) => {
      if (g.google && g.google.accounts && g.google.accounts.oauth2) return resolve();
      const s = g.document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load Google sign-in. Check your internet connection.'));
      g.document.head.appendChild(s);
    });
  }
  async function ghSignIn() {
    if (ghToken && Date.now() < ghExpires) return ghToken;
    await loadGIS();
    return new Promise((resolve, reject) => {
      const client = g.google.accounts.oauth2.initTokenClient({
        client_id: QL.store.settings.google.clientId.trim(),
        scope: GH_SCOPES,
        callback: r => {
          if (r && r.access_token) { ghToken = r.access_token; ghExpires = Date.now() + ((r.expires_in || 3000) - 60) * 1000; resolve(ghToken); }
          else reject(new Error('Google sign-in did not finish' + (r && r.error ? ' (' + r.error + ').' : '.')));
        },
        error_callback: e => reject(new Error('Google sign-in was closed or blocked' + (e && e.type ? ' (' + e.type + ').' : '.')))
      });
      client.requestAccessToken();
    });
  }
  async function ghList(type, filter, token) {
    const out = []; let page = '';
    for (let i = 0; i < 20; i++) {
      const url = GH_BASE + type + '/dataPoints?pageSize=1000&filter=' + encodeURIComponent(filter) + (page ? '&pageToken=' + encodeURIComponent(page) : '');
      const res = await g.fetch(url, { headers: { authorization: 'Bearer ' + token } });
      if (res.status === 403) throw new Error('Google refused access to ' + type + '. Check the scopes on your OAuth client and that your account is a test user.');
      if (!res.ok) throw new Error('Google Health returned an error (' + res.status + ') for ' + type + '.');
      const j = await res.json();
      (j.dataPoints || []).forEach(p => out.push(p));
      page = j.nextPageToken || '';
      if (!page) break;
    }
    return out;
  }
  /* The response nests values a little differently per data type, so read them leniently. */
  function ghDate(v) {
    if (!v) return null;
    const iv = v.interval || v.sampleTime || v;
    const civil = iv.civilStartTime || iv.civilTime;
    if (civil && civil.date && civil.date.year) return fmt(civil.date.year, civil.date.month, civil.date.day);
    const t = iv.startTime || iv.physicalTime || iv.time;
    return t ? U.dateStr(new Date(t)) : null;
  }
  function ghNumber(v, names) {
    for (const n of names) { if (v && v[n] !== undefined && isFinite(Number(v[n]))) return Number(v[n]); }
    return NaN;
  }

  connectors.register({
    id: 'google-health',
    name: 'Google Health',
    beta: true,
    blurb: 'Steps, weight and body fat from a Fitbit or Pixel Watch linked to your Google account.',
    available() {
      if (g.location && g.location.protocol === 'file:') return { ok: false, reason: 'Open the app from http://localhost (use Start Questline.bat) or a hosted address. Google sign-in does not work on a file opened from disk.' };
      if (!QL.store.settings.google.clientId.trim()) return { ok: false, reason: 'Add your Google OAuth client ID first.' };
      return { ok: true };
    },
    async sync(ctx) {
      const token = await ghSignIn();
      const since = ctx.since;
      const points = [];
      const steps = await ghList('steps', 'steps.interval.civil_start_time >= "' + since + '"', token);
      steps.forEach(p => {
        const date = ghDate(p.steps), v = ghNumber(p.steps, ['countSum', 'count']);
        if (date && isFinite(v)) points.push({ metric: 'steps', date, value: v });
      });
      const bodyTypes = [['weight', 'weight', 'weight_kg'], ['body-fat', 'bodyFat', 'body_fat']];
      for (const [type, field, metric] of bodyTypes) {
        let rows = [];
        try { rows = await ghList(type, field.replace(/[A-Z]/g, c => '_' + c.toLowerCase()) + '.sample_time.physical_time >= "' + since + 'T00:00:00Z"', token); }
        catch (e) { continue; }   // body data is optional; steps already came through
        rows.forEach(p => {
          const v = p[field], date = ghDate(v);
          let n = ghNumber(v, ['weightKg', 'kilograms', 'percentage', 'percent', 'value']);
          if (!isFinite(n) && isFinite(ghNumber(v, ['weightGrams', 'grams']))) n = ghNumber(v, ['weightGrams', 'grams']) / 1000;
          if (date && isFinite(n)) points.push({ metric, date, value: n });
        });
      }
      return points;
    }
  });

  /* ---------- Sample data, for trying the app out ---------- */
  connectors.register({
    id: 'sample',
    name: 'Sample data',
    blurb: 'Thirty days of made-up steps, weight and sleep so you can see how linked data behaves. Remove it any time.',
    available() { return { ok: true }; },
    async sync() {
      const today = U.today(), points = [];
      for (let i = 29; i >= 0; i--) {
        const date = U.addDays(today, -i), r = U.hash('s' + date) / 4294967295, r2 = U.hash('w' + date) / 4294967295;
        points.push({ metric: 'steps', date, value: Math.round(5200 + r * 6200) });
        points.push({ metric: 'weight_kg', date, value: Math.round((78.5 - (29 - i) * 0.06 + (r2 - 0.5) * 0.7) * 10) / 10 });
        points.push({ metric: 'sleep_h', date, value: Math.round((6 + r2 * 2.2) * 10) / 10 });
      }
      return points;
    }
  });

  QL.connectors = connectors;
})(typeof window !== 'undefined' ? window : globalThis);
