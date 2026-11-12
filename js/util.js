/* Questline — small shared helpers. Everything hangs off the global QL namespace
   so the app also works when index.html is opened straight from disk. */
(function (g) {
  const QL = (g.QL = g.QL || {});

  function pad(n) { return String(n).padStart(2, '0'); }

  const util = {
    uid() {
      if (g.crypto && g.crypto.randomUUID) return g.crypto.randomUUID();
      return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    },
    now() { return new Date().toISOString(); },

    /* Dates are handled as local-time YYYY-MM-DD strings. */
    dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    today() { return util.dateStr(new Date()); },
    parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    addDays(s, n) { const d = util.parseDate(s); d.setDate(d.getDate() + n); return util.dateStr(d); },
    daysBetween(a, b) { return Math.round((util.parseDate(b) - util.parseDate(a)) / 86400000); },
    /* Monday of the week containing s */
    weekStart(s) { const d = util.parseDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return util.dateStr(d); },
    fmtDate(s, opts) {
      return util.parseDate(s).toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
    },
    fmtLongDate(s) {
      return util.parseDate(s).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    },

    clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
    fmtNum(v, maxFrac) {
      if (v === null || v === undefined || isNaN(v)) return '–';
      return Number(v).toLocaleString(undefined, { maximumFractionDigits: maxFrac === undefined ? 1 : maxFrac });
    },
    esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /* Stable small hash, used to rotate quests from day to day. */
    hash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;   // spread similar strings apart
      return h >>> 0;
    },
    plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  };

  QL.util = util;
})(typeof window !== 'undefined' ? window : globalThis);
