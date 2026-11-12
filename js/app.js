/* Questline — start-up, navigation and everything that happens when you click. */
(function (g) {
  const QL = g.QL, U = QL.util, E = QL.engine, S = QL.store, V = QL.views, C = QL.catalog;
  const doc = g.document;
  const $app = doc.getElementById('app'), $modal = doc.getElementById('modal'), $toasts = doc.getElementById('toasts');
  const ui = (QL.ui = { route: { name: 'today' }, modal: null, day: U.today() });

  /* ---------- rendering ---------- */
  function parseRoute() {
    const parts = g.location.hash.replace(/^#\/?/, '').split('/');
    if (['today', 'goals', 'data', 'settings'].includes(parts[0])) return { name: parts[0] };
    if (parts[0] === 'goal' && parts[1]) return { name: 'goal', id: parts[1] };
    return { name: 'today' };
  }

  function animateFills(root) {
    const els = root.querySelectorAll('[data-fill]');
    if (!els.length) return;
    void root.offsetWidth;   // make the browser register the starting widths
    els.forEach(el => { const w = Number(el.dataset.w); el.style.width = w + '%'; V.prevFill[el.dataset.fill] = w; });
  }

  function render() {
    ui.day = U.today();
    if (E.activeGoals().length) E.ensureToday(ui.day);
    const r = ui.route;
    const inner = r.name === 'goals' ? V.viewGoals() : r.name === 'goal' ? V.viewGoal(r.id) : r.name === 'data' ? V.viewData() : r.name === 'settings' ? V.viewSettings() : V.viewToday();
    const a = doc.activeElement, keep = a && $app.contains(a) && a.dataset.action ? { action: a.dataset.action, id: a.dataset.id } : null;
    $app.innerHTML = V.shell(r, inner);
    animateFills($app);
    if (keep && keep.id) {
      const el = $app.querySelector('[data-action="' + keep.action + '"][data-id="' + keep.id + '"]');
      if (el) el.focus({ preventScroll: true });
    }
    doc.title = (r.name === 'goal' ? 'Goal' : r.name[0].toUpperCase() + r.name.slice(1)) + ' | Questline';
  }

  function renderModal(focusFirst) {
    const old = $modal.querySelector('.sheet'), scroll = old ? old.scrollTop : 0;
    $modal.innerHTML = QL.modals.render(ui.modal);
    doc.body.style.overflow = ui.modal ? 'hidden' : '';
    const sheet = $modal.querySelector('.sheet');
    if (!sheet) return;
    if (focusFirst) {
      const first = sheet.querySelector('input:not([type=radio]):not([type=file]), textarea, select, .sheet-foot .btn');
      if (first) first.focus();
    } else sheet.scrollTop = scroll;
  }
  function openModal(m) { ui.modal = m; renderModal(true); }
  function closeModal() { ui.modal = null; renderModal(); render(); }

  function toast(text, kind) {
    const el = doc.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = text;
    $toasts.appendChild(el);
    while ($toasts.children.length > 3) $toasts.firstChild.remove();
    g.setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3600);
  }
  function announce(events) {
    events.forEach(e => {
      toast('+' + e.xp + ' XP' + (e.goal ? ' for ' + e.goal.title : ''), 'xp');
      if (e.stageDone) toast('Stage reached: ' + e.stageDone);
      if (e.lineDone) toast('You reached the end of the line for ' + e.goal.title);
      if (e.levelUp) toast('Level ' + e.levelUp + ' reached');
    });
  }
  function confirmThen(title, body, confirmLabel, fn) { openModal({ type: 'confirm', title, body, confirmLabel, onConfirm: fn }); }

  /* ---------- add-goal flow ---------- */
  function startWizard() {
    openModal({ type: 'addGoal', draft: {
      step: 1, loading: false, notice: '', plan: null, link: null,
      input: { category: '', title: '', why: '', context: '', targetDate: U.addDays(U.today(), 90), minutesPerDay: 30 }
    } });
  }

  async function buildPlan(m) {
    const d = m.draft;
    d.input.days = Math.max(14, U.daysBetween(U.today(), d.input.targetDate));
    d.loading = true; renderModal();
    const res = await QL.ai.planFor(d.input);
    if (ui.modal !== m) return;   // closed while waiting
    let raw = res.raw; d.notice = res.notice;
    try { d.plan = E.normalizePlan(raw, d.input.days); }
    catch (e) {
      raw = QL.templates.plan(d.input.category, d.input.title);
      d.plan = E.normalizePlan(raw, d.input.days);
      d.notice = 'The AI plan could not be used. Showing the built-in plan instead.';
    }
    const sm = raw.suggestedMetric && E.metric(raw.suggestedMetric.key) ? raw.suggestedMetric : null;
    const key = sm ? sm.key : C.suggestedMetric[d.input.category];
    if (key) {
      const s = E.series(key), def = E.metric(key);
      d.link = { metric: key, mode: sm && ['latest', 'total', 'avg7'].includes(sm.mode) ? sm.mode : (def.agg === 'sum' ? 'total' : 'latest'),
        start: def.agg === 'last' && s.length ? s[s.length - 1].value : '', target: sm && Number(sm.target) > 0 ? Number(sm.target) : '' };
    } else d.link = null;
    d.loading = false; d.step = 2; renderModal(true);
  }

  /* Reads the plan editor back into the plan object. */
  function currentPlan() { const m = ui.modal; return m ? (m.type === 'addGoal' ? m.draft.plan : m.plan) : null; }
  function syncPlan() {
    const plan = currentPlan();
    if (!plan) return null;
    $modal.querySelectorAll('.plan-ms').forEach(msEl => {
      const m = plan.milestones[Number(msEl.dataset.ms)];
      if (!m) return;
      m.title = msEl.querySelector('[data-pf="ms-title"]').value;
      msEl.querySelectorAll('.plan-q').forEach(qEl => {
        const q = m.quests[Number(qEl.dataset.q)];
        if (!q) return;
        q.title = qEl.querySelector('[data-pf="title"]').value;
        q.minutes = Number(qEl.querySelector('[data-pf="minutes"]').value) || 15;
        const c = qEl.querySelector('[data-pf="cadence"]').value;
        if (c[0] === 'w') { q.cadence = 'weekly'; q.perWeek = Number(c.slice(1)); } else { q.cadence = c; delete q.perWeek; }
      });
    });
    return plan;
  }
  /* Re-sizes the plan after edits. Returns null (and says why) if it is unusable. */
  function finishPlan(days) {
    const plan = syncPlan();
    const avg = plan.milestones.reduce((a, m) => a + (m.xp || 0), 0) / (plan.milestones.filter(m => m.xp).length || 1) || 100;
    try {
      return E.normalizePlan({ source: plan.source, summary: plan.summary,
        milestones: plan.milestones.map(m => ({ id: m.id, title: m.title, note: m.note, share: m.xp || avg, quests: m.quests })) }, days);
    } catch (e) {
      toast('A plan needs at least one named stage with one side quest.', 'bad');
      return null;
    }
  }

  function readLink(fd) {
    const metric = fd.get('metric');
    if (!metric) return null;
    const t = fd.get('target'), s = fd.get('start');
    return { metric, mode: fd.get('mode'), start: s === '' ? 0 : Number(s), target: t === '' ? null : Number(t) };
  }

  /* ---------- clicks ---------- */
  const actions = {
    'add-goal': startWizard,
    'close-modal': closeModal,

    'toggle-quest'(el) {
      const q = S.byId('quests', el.dataset.id);
      if (!q) return;
      if (q.status === 'done') { E.reopenQuest(q.id); S.commit(); render(); }
      else { const e = E.completeQuest(q.id); S.commit(); render(); if (e) announce([e]); }
    },
    'skip-quest'(el) {
      const swap = E.skipQuest(el.dataset.id); S.commit(); render();
      toast(swap ? 'Swapped for another side quest' : 'Removed for today');
    },
    'custom-quest'() { openModal({ type: 'customQuest' }); },

    'wizard-back'() { const d = ui.modal.draft; if (d.step === 2) syncPlan(); d.step--; renderModal(true); },
    'wizard-regenerate'() { buildPlan(ui.modal); },

    'plan-add-quest'(el) { const p = syncPlan(); p.milestones[Number(el.dataset.ms)].quests.push({ id: U.uid(), title: '', minutes: 15, cadence: 'daily', xp: 15 }); renderModal();
      const rows = $modal.querySelectorAll('.plan-ms[data-ms="' + el.dataset.ms + '"] .plan-q input[type=text]'); if (rows.length) rows[rows.length - 1].focus(); },
    'plan-remove-quest'(el) { const p = syncPlan(); p.milestones[Number(el.dataset.ms)].quests.splice(Number(el.dataset.q), 1); renderModal(); },
    'plan-add-stage'() { const p = syncPlan(); p.milestones.push({ id: U.uid(), title: '', note: '', quests: [{ id: U.uid(), title: '', minutes: 15, cadence: 'daily', xp: 15 }] }); renderModal();
      const t = $modal.querySelectorAll('[data-pf="ms-title"]'); t[t.length - 1].focus(); },
    'plan-remove-stage'(el) { const p = syncPlan(); p.milestones.splice(Number(el.dataset.ms), 1); renderModal(); },

    'edit-plan'(el) {
      const goal = S.byId('goals', el.dataset.id);
      openModal({ type: 'editPlan', goalId: goal.id, plan: JSON.parse(JSON.stringify({ source: goal.planSource, summary: goal.summary, milestones: goal.milestones })) });
    },
    'goal-status'(el) {
      const goal = S.byId('goals', el.dataset.id), status = el.dataset.status;
      goal.status = status; if (status === 'active') goal.assignedOn = null;
      S.put('goals', goal); render();
      toast(status === 'achieved' ? 'Goal achieved. Well earned.' : status === 'archived' ? 'Goal archived' : 'Goal reopened');
    },
    'delete-goal'(el) {
      const goal = S.byId('goals', el.dataset.id);
      confirmThen('Delete this goal?', '"' + goal.title + '" and its unfinished side quests will be removed. XP you already earned stays on your level.', 'Delete goal', () => {
        E.deleteGoal(goal.id); S.commit(); g.location.hash = '#/goals';
      });
    },
    'link-data'(el) { openModal({ type: 'linkData', goalId: el.dataset.id }); },
    'unlink-data'() { const goal = S.byId('goals', ui.modal.goalId); goal.link = null; S.put('goals', goal); closeModal(); toast('Link removed'); },
    'log-value'(el) { openModal({ type: 'logValue', metric: el.dataset.metric || '' }); },
    'custom-metric'() { openModal({ type: 'customMetric' }); },
    'csv-import'() { openModal({ type: 'csv' }); },

    async 'sync'(el) {
      const c = QL.connectors.get(el.dataset.id), ok = c.available();
      if (!ok.ok) return toast(ok.reason, 'bad');
      el.disabled = true; const label = el.textContent; el.textContent = 'Working…';
      try {
        const points = await c.sync({ since: U.addDays(U.today(), -30) });
        const res = QL.connectors.ingest(points, c.id);
        render();
        toast(res.days ? 'Brought in ' + U.plural(res.days, 'reading') + ' from ' + c.name : c.name + ' returned no readings for the last 30 days.');
        announce(res.events);
      } catch (e) { el.disabled = false; el.textContent = label; toast(e.message, 'bad'); }
    },
    'remove-sample'() {
      confirmThen('Remove sample data?', 'All made-up readings are removed. Readings you logged or imported yourself stay.', 'Remove sample data', () => { QL.connectors.removeSource('sample'); });
    },

    async 'test-ai'(el) {
      const form = el.closest('form'), status = doc.getElementById('ai-status');
      saveAI(new FormData(form));
      if (!QL.ai.hasKey()) { status.textContent = 'Enter a key first.'; return; }
      status.textContent = 'Testing…';
      try { await QL.ai.test(); status.textContent = 'The key works. New goals will get an AI-written plan.'; }
      catch (e) { status.textContent = e.message; }
    },

    'export'() {
      const blob = new Blob([S.exportJSON()], { type: 'application/json' });
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'questline-backup-' + U.today() + '.json';
      doc.body.appendChild(a); a.click(); a.remove();
      g.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Backup downloaded');
    },
    'import'() {
      const inp = doc.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => confirmThen('Restore this backup?', 'Everything in the app now is replaced by the contents of ' + f.name + '.', 'Restore backup', () => {
          try { S.importJSON(String(rd.result)); toast('Backup restored'); } catch (e) { toast(e.message || 'That file could not be read.', 'bad'); }
        });
        rd.readAsText(f);
      };
      inp.click();
    },
    'install'() { if (QL.installPrompt) { QL.installPrompt.prompt(); QL.installPrompt = null; } },
    'reset'() { confirmThen('Erase all data?', 'Every goal, side quest and reading is deleted from this browser. This cannot be undone unless you have a backup.', 'Erase everything', () => { S.reset(); g.location.hash = '#/today'; }); },
    'confirm-yes'() { const fn = ui.modal.onConfirm; ui.modal = null; renderModal(); fn(); render(); }
  };

  function saveAI(fd) {
    S.updateSettings({ ai: { apiKey: String(fd.get('apiKey') || '').trim(), model: String(fd.get('model') || '').trim() || 'claude-sonnet-5-5' } });
  }

  /* ---------- form submits ---------- */
  const forms = {
    'goal-basics'(fd) {
      const m = ui.modal;
      Object.assign(m.draft.input, {
        category: fd.get('category'), title: String(fd.get('title')).trim(), why: String(fd.get('why')).trim(),
        context: String(fd.get('context')).trim(), targetDate: fd.get('targetDate'), minutesPerDay: Number(fd.get('minutesPerDay'))
      });
      buildPlan(m);
    },
    'goal-plan'() {
      const d = ui.modal.draft, plan = finishPlan(d.input.days);
      if (!plan) return;
      d.plan = plan; d.step = 3; renderModal(true);
    },
    'goal-link'(fd) {
      const d = ui.modal.draft;
      const goal = E.createGoal(Object.assign({}, d.input, { link: readLink(fd) }), d.plan);
      S.commit();
      ui.modal = null; renderModal();
      if (g.location.hash === '#/today') render(); else g.location.hash = '#/today';
      toast('Goal added. Today\'s side quests for ' + goal.title + ' are ready.');
    },
    'edit-plan'() {
      const goal = S.byId('goals', ui.modal.goalId);
      const plan = finishPlan(Math.max(14, U.daysBetween(goal.startDate, goal.targetDate)));
      if (!plan) return;
      goal.milestones = plan.milestones; goal.xpTarget = plan.xpTarget;
      S.put('goals', goal); closeModal(); toast('Plan saved');
    },
    'link-data'(fd) {
      const goal = S.byId('goals', ui.modal.goalId);
      goal.link = readLink(fd); S.put('goals', goal); closeModal(); toast('Data linked');
    },
    'log-value'(fd) {
      const key = fd.get('metric'), def = E.metric(key);
      E.logValue(key, fd.get('date'), fd.get('value'), 'manual', def.agg === 'sum' && fd.get('add') ? 'add' : 'set', true);
      const events = E.evaluateAuto(U.today(), true);
      S.commit(); closeModal();
      toast('Logged ' + E.fmtValue(def, Number(fd.get('value'))) + ' for ' + def.name);
      announce(events);
    },
    'custom-quest'(fd) {
      E.addCustomQuest(fd.get('title'), fd.get('goalId'), fd.get('minutes')); S.commit(); closeModal(); toast('Side quest added');
    },
    'custom-metric'(fd) {
      const name = String(fd.get('name')).trim();
      const key = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20) + '_' + U.uid().slice(-4);
      S.put('metrics', { key, name, unit: String(fd.get('unit')).trim(), agg: fd.get('agg') });
      closeModal(); toast(name + ' added. Log a reading to start tracking it.');
    },
    'csv-map'(fd) {
      const ins = ui.modal.inspected;
      const mapping = ins.columns.map(c => { const metric = fd.get('col-' + c.index); return metric ? { index: c.index, metric, scale: metric === c.metric ? c.scale : 1 } : null; }).filter(Boolean);
      if (!mapping.length) return toast('Choose a measure for at least one column.', 'bad');
      const { points, skipped } = QL.connectors.csv.toPoints(ins, mapping, fd.get('order') || 'dmy');
      const res = QL.connectors.ingest(points, 'csv');
      closeModal();
      toast('Imported ' + U.plural(res.days, 'reading') + (skipped ? ' (' + U.plural(skipped, 'row') + ' skipped: no readable date)' : ''));
      announce(res.events);
    },
    'prefs'(fd) {
      S.state.profile.name = String(fd.get('name')).trim().slice(0, 40);
      S.updateSettings({ questsPerGoal: Number(fd.get('perGoal')), maxQuestsPerDay: Number(fd.get('max')), currency: String(fd.get('currency')).trim() || '₹' });
      render(); toast('Settings saved');
    },
    'ai'(fd) { saveAI(fd); render(); toast(QL.ai.hasKey() ? 'AI settings saved' : 'Key removed. Using built-in plans.'); },
    'google-client'(fd) { S.updateSettings({ google: { clientId: String(fd.get('clientId')).trim() } }); render(); toast('Client ID saved'); }
  };

  /* ---------- field changes ---------- */
  const changes = {
    'link-metric'(el) {
      const form = el.closest('form'), def = E.metric(el.value);
      if (!def) return;
      form.elements.mode.value = def.agg === 'sum' ? 'total' : 'latest';
      const s = E.series(def.key);
      if (form.elements.start.value === '' && def.agg === 'last' && s.length) form.elements.start.value = s[s.length - 1].value;
    },
    'log-metric'(el) {
      const form = el.closest('form'), value = form.elements.value.value, date = form.elements.date.value;
      ui.modal.metric = el.value; renderModal();
      const f = $modal.querySelector('form'); f.elements.value.value = value; f.elements.date.value = date; f.elements.metric.focus();
    },
    'csv-file'(el) {
      const f = el.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const m = ui.modal; if (!m || m.type !== 'csv') return;
        try { m.inspected = QL.connectors.csv.inspect(String(rd.result)); m.fileName = f.name; m.error = ''; }
        catch (e) { m.inspected = null; m.error = e.message; }
        renderModal();
      };
      rd.readAsText(f);
    }
  };

  /* ---------- wiring ---------- */
  doc.addEventListener('click', ev => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) { ev.preventDefault(); fn(el); }
  });
  doc.addEventListener('submit', ev => {
    const form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    const fn = forms[form.dataset.form];
    if (fn) fn(new FormData(form), form);
  });
  doc.addEventListener('change', ev => {
    const el = ev.target.closest('[data-change]');
    if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
    if (ev.target.name === 'category' && ui.modal && ui.modal.type === 'addGoal') {
      $modal.querySelector('.sheet').style.setProperty('--c', C.category(ev.target.value).color);
    }
  });
  doc.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && ui.modal && !(ui.modal.draft && ui.modal.draft.loading)) closeModal();
  });
  g.addEventListener('hashchange', () => {
    ui.route = parseRoute(); render();
    g.scrollTo(0, 0);
    const v = doc.getElementById('view'); if (v) v.focus({ preventScroll: true });
  });
  /* A new day brings new side quests, even if the app was left open overnight. */
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden && U.today() !== ui.day && !ui.modal) render(); });

  g.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault(); QL.installPrompt = ev;
    const b = doc.getElementById('install-btn'); if (b) b.hidden = false;
  });
  if ('serviceWorker' in g.navigator && /^https?:$/.test(g.location.protocol)) {
    g.addEventListener('load', () => { g.navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  S.init();
  ui.route = parseRoute();
  render();
})(window);
