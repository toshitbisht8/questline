/* Questline — the rules: plans, XP, levels, daily side-quest assignment, real-data progress.
   No DOM in here, so it can be tested with Node (see tests/engine.test.js). */
(function (g) {
  const QL = (g.QL = g.QL || {});
  const U = QL.util;
  const S = () => QL.store;

  const DAILY_XP_PACE = 28;      // XP a steady person earns per goal per day; sizes the line
  const CADENCES = ['daily', 'weekly', 'once'];

  const engine = {
    /* ---------- plans ---------- */

    questXP(minutes) {
      const m = U.clamp(Number(minutes) || 15, 1, 240);
      return U.clamp(Math.round((8 + m * 0.55) / 5) * 5, 10, 50);
    },

    /* Turns a raw plan (from AI or a template) into stored milestones with XP sizes.
       Throws if the plan is unusable so callers can fall back. */
    normalizePlan(raw, days) {
      if (!raw || !Array.isArray(raw.milestones)) throw new Error('Plan has no milestones');
      const ms = raw.milestones.map(m => {
        const quests = (Array.isArray(m.quests) ? m.quests : []).map(q => engine.normalizeQuest(q)).filter(Boolean);
        return { id: m.id || U.uid(), title: String(m.title || '').trim().slice(0, 80), note: String(m.note || '').trim().slice(0, 240), share: Number(m.share) > 0 ? Number(m.share) : 1, quests };
      }).filter(m => m.title && m.quests.length);
      if (ms.length < 1) throw new Error('Plan has no usable milestones');

      const span = U.clamp(days || 90, 14, 730);
      const xpTarget = Math.max(200, Math.round(span * DAILY_XP_PACE / 10) * 10);
      const total = ms.reduce((a, m) => a + m.share, 0);
      let used = 0;
      ms.forEach((m, i) => {
        m.xp = i === ms.length - 1 ? xpTarget - used : Math.max(20, Math.round(xpTarget * m.share / total / 10) * 10);
        used += m.xp;
        delete m.share;
      });
      if (ms[ms.length - 1].xp < 20) ms[ms.length - 1].xp = 20;
      return {
        milestones: ms,
        xpTarget: ms.reduce((a, m) => a + m.xp, 0),
        summary: String(raw.summary || '').slice(0, 400),
        source: raw.source || 'manual'
      };
    },

    normalizeQuest(q) {
      if (!q) return null;
      const title = String(q.title || '').trim().slice(0, 140);
      if (!title) return null;
      const minutes = U.clamp(Math.round(Number(q.minutes) || 15), 1, 240);
      const cadence = CADENCES.includes(q.cadence) ? q.cadence : 'daily';
      const out = { id: q.id || U.uid(), title, minutes, cadence, xp: engine.questXP(minutes) };
      if (cadence === 'weekly') out.perWeek = U.clamp(Math.round(Number(q.perWeek) || 2), 1, 6);
      if (q.auto && engine.metric(q.auto.metric) && Number(q.auto.min) > 0) {
        out.auto = { metric: q.auto.metric, min: Number(q.auto.min) };
      }
      return out;
    },

    /* ---------- things you measure ---------- */

    allMetrics() {
      const custom = S().all('metrics').map(m => ({ key: m.key, name: m.name, unit: m.unit, agg: m.agg, category: 'other', custom: true, id: m.id }));
      return QL.catalog.metrics.concat(custom);
    },
    metric(key) { return engine.allMetrics().find(m => m.key === key) || null; },
    unit(def) { return def && def.unit === 'CUR' ? S().settings.currency : (def ? def.unit : ''); },
    fmtValue(def, v) {
      if (v === null || v === undefined) return '–';
      const u = engine.unit(def);
      if (def && def.unit === 'CUR') return u + U.fmtNum(v, 0);
      return U.fmtNum(v) + (u === '%' ? '%' : ' ' + u);
    },

    series(key) {
      return S().all('datapoints').filter(p => p.metric === key).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    },
    dayValue(key, date) {
      const p = S().all('datapoints').find(d => d.metric === key && d.date === date);
      return p ? p.value : null;
    },
    /* mode "set" replaces the day's value; "add" adds to it (only sensible for sum metrics). */
    logValue(key, date, value, source, mode, silent) {
      const v = Number(value);
      if (!isFinite(v)) return null;
      const existing = S().all('datapoints').find(d => d.metric === key && d.date === date);
      const rec = existing || { metric: key, date };
      rec.value = existing && mode === 'add' ? existing.value + v : v;
      rec.source = source || 'manual';
      S().put('datapoints', rec, true);
      if (!silent) { engine.evaluateAuto(U.today(), true); S().commit(); }
      return rec;
    },

    /* ---------- goal progress ---------- */

    goalXP(goalId) {
      return S().all('quests').reduce((a, q) => a + (q.goalId === goalId && q.status === 'done' ? q.xp : 0), 0);
    },

    /* Position on the line: which stage you are in and how far along. */
    goalStats(goal) {
      const xp = engine.goalXP(goal.id);
      const total = goal.xpTarget || 1;
      const thresholds = [];
      let cum = 0, msIndex = goal.milestones.length - 1, found = false, msStart = 0;
      goal.milestones.forEach((m, i) => {
        const start = cum; cum += m.xp;
        thresholds.push(cum);
        if (!found && xp < cum) { msIndex = i; msStart = start; found = true; }
      });
      if (!found) msStart = cum - goal.milestones[msIndex].xp;
      const ms = goal.milestones[msIndex];
      return {
        xp, total,
        pct: U.clamp(xp / total * 100, 0, 100),
        lineDone: xp >= total,
        msIndex, thresholds,
        msXP: U.clamp(xp - msStart, 0, ms.xp), msTotal: ms.xp,
        stagesDone: found ? msIndex : goal.milestones.length
      };
    },

    /* Progress measured from real data linked to the goal, separate from XP. */
    metricProgress(goal) {
      const link = goal.link;
      if (!link || !link.metric) return null;
      const def = engine.metric(link.metric);
      if (!def) return null;
      const today = U.today();
      const pts = engine.series(link.metric).filter(p => p.date <= today);
      const start = Number(link.start) || 0, target = Number(link.target);
      let cur = null;
      if (link.mode === 'total') {
        const since = pts.filter(p => p.date >= goal.startDate);
        cur = start + since.reduce((a, p) => a + p.value, 0);
      } else if (link.mode === 'avg7') {
        const from = U.addDays(today, -6);
        const wk = pts.filter(p => p.date >= from);
        cur = wk.length ? wk.reduce((a, p) => a + p.value, 0) / wk.length : null;
      } else {
        cur = pts.length ? pts[pts.length - 1].value : null;
      }
      const has = cur !== null;
      const shown = has ? cur : start;
      const pct = isFinite(target) && target !== start ? U.clamp((shown - start) / (target - start) * 100, 0, 100) : null;
      return { def, cur: shown, hasData: has || link.mode === 'total', start, target, pct, mode: link.mode || 'latest', points: pts.slice(-60), lastDate: pts.length ? pts[pts.length - 1].date : null };
    },

    /* ---------- player ---------- */

    xpForLevel(level) { return 50 * level * (level - 1); },
    levelFor(xp) { return Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2)); },

    player() {
      const today = U.today();
      const done = S().all('quests').filter(q => q.status === 'done');
      const xp = done.reduce((a, q) => a + q.xp, 0);
      const level = engine.levelFor(xp);
      const base = engine.xpForLevel(level), next = engine.xpForLevel(level + 1);
      const days = new Set(done.map(q => q.date));
      let streak = 0, d = days.has(today) ? today : U.addDays(today, -1);
      while (days.has(d)) { streak++; d = U.addDays(d, -1); }
      return {
        xp, level, intoLevel: xp - base, levelSpan: next - base, toNext: next - xp, streak,
        todayXP: done.filter(q => q.date === today).reduce((a, q) => a + q.xp, 0)
      };
    },

    /* ---------- daily side quests ---------- */

    questsFor(date) { return S().all('quests').filter(q => q.date === date); },
    activeGoals() { return S().all('goals').filter(gl => gl.status === 'active').sort((a, b) => a.createdAt < b.createdAt ? -1 : 1); },

    /* Quests from the goal's current stage that could still be handed out on `date`, best first. */
    candidates(goal, date) {
      const stats = engine.goalStats(goal);
      const ms = goal.milestones[stats.msIndex];
      if (!ms) return [];
      const mine = S().all('quests').filter(q => q.goalId === goal.id);
      const todayDefs = new Set(mine.filter(q => q.date === date).map(q => q.defId));
      const weekFrom = U.weekStart(date), recentFrom = U.addDays(date, -6);
      const everDone = new Set(mine.filter(q => q.status === 'done').map(q => q.defId));

      const once = ms.quests.filter(d => d.cadence === 'once' && !everDone.has(d.id) && !todayDefs.has(d.id));
      const recurring = ms.quests.filter(d => {
        if (d.cadence === 'once' || todayDefs.has(d.id)) return false;
        if (d.cadence === 'weekly') {
          const doneThisWeek = mine.filter(q => q.defId === d.id && q.status === 'done' && q.date >= weekFrom && q.date <= date).length;
          if (doneThisWeek >= (d.perWeek || 2)) return false;
        }
        return true;
      }).map(d => {
        const wanted = d.cadence === 'daily' ? 7 : (d.perWeek || 2);
        const recent = mine.filter(q => q.defId === d.id && q.date >= recentFrom && q.date < date).length;
        return { d, wanted, score: recent / wanted, tie: U.hash(date + d.id) };
      }).sort((a, b) => a.score - b.score || b.wanted - a.wanted || a.tie - b.tie).map(x => x.d);

      // A habit first, then the next one-off step, then more habits.
      const onceIds = new Set(ms.quests.filter(d => d.cadence === 'once').map(d => d.id));
      const live = mine.filter(q => q.date === date && q.status !== 'skipped' && !q.custom);
      const stepToday = live.some(q => onceIds.has(q.defId));
      const habitToday = live.some(q => !onceIds.has(q.defId));
      if (once.length && !stepToday && (habitToday || !recurring.length)) return [once[0]].concat(recurring);
      const out = [];
      if (recurring.length) out.push(recurring.shift());
      if (once.length && !stepToday) out.push(once[0]);
      return out.concat(recurring);
    },

    makeQuest(goal, def, date) {
      const stats = engine.goalStats(goal);
      const rec = {
        date, goalId: goal.id, defId: def.id, milestoneId: goal.milestones[stats.msIndex].id,
        title: def.title, minutes: def.minutes, xp: def.xp, status: 'pending', completedAt: null
      };
      if (def.auto) rec.auto = def.auto;
      return S().put('quests', rec, true);
    },

    /* Hands out today's side quests. Safe to call on every render: each goal is served once per day. */
    ensureToday(date) {
      const day = date || U.today();
      const st = S().settings;
      const goals = engine.activeGoals();
      const pending = goals.filter(gl => gl.assignedOn !== day);
      if (!pending.length) return false;

      const live = engine.questsFor(day).filter(q => q.goalId && !q.custom && q.status !== 'skipped').length;
      let slots = Math.max(st.maxQuestsPerDay - live, pending.length);   // every goal gets at least one
      const rot = U.daysBetween('2024-01-01', day) % pending.length;
      const order = pending.slice(rot).concat(pending.slice(0, rot));
      const given = new Map(order.map(gl => [gl.id, 0]));

      let progressed = true;
      while (slots > 0 && progressed) {
        progressed = false;
        for (const gl of order) {
          if (slots <= 0) break;
          if (given.get(gl.id) >= st.questsPerGoal) continue;
          const next = engine.candidates(gl, day)[0];
          if (!next) continue;
          engine.makeQuest(gl, next, day);
          given.set(gl.id, given.get(gl.id) + 1);
          slots--; progressed = true;
        }
      }
      pending.forEach(gl => { gl.assignedOn = day; S().put('goals', gl, true); });
      engine.evaluateAuto(day, true);
      S().commit();
      return true;
    },

    completeQuest(id, viaData) {
      const q = S().byId('quests', id);
      if (!q || q.status === 'done') return null;
      const goal = q.goalId ? S().byId('goals', q.goalId) : null;
      const before = goal ? engine.goalStats(goal) : null;
      const levelBefore = engine.player().level;
      q.status = 'done'; q.completedAt = U.now();
      if (viaData) q.viaData = true;
      S().put('quests', q, true);
      const after = goal ? engine.goalStats(goal) : null;
      const level = engine.player().level;
      return {
        quest: q, goal, xp: q.xp,
        stageDone: goal && after.stagesDone > before.stagesDone ? goal.milestones[after.stagesDone - 1].title : null,
        lineDone: !!(goal && after.lineDone && !before.lineDone),
        levelUp: level > levelBefore ? level : null
      };
    },

    reopenQuest(id) {
      const q = S().byId('quests', id);
      if (!q) return;
      q.status = 'pending'; q.completedAt = null; delete q.viaData;
      S().put('quests', q, true);
    },

    /* "Not today": drops the quest and offers the next one from the same goal, if any. */
    skipQuest(id) {
      const q = S().byId('quests', id);
      if (!q || q.status !== 'pending') return null;
      q.status = 'skipped';
      S().put('quests', q, true);
      const goal = q.goalId && !q.custom ? S().byId('goals', q.goalId) : null;
      if (!goal || goal.status !== 'active') return null;
      const next = engine.candidates(goal, q.date)[0];
      return next ? engine.makeQuest(goal, next, q.date) : null;
    },

    addCustomQuest(title, goalId, minutes, date) {
      const m = U.clamp(Number(minutes) || 15, 1, 240);
      return S().put('quests', {
        date: date || U.today(), goalId: goalId || null, defId: null, custom: true,
        title: String(title).trim().slice(0, 140), minutes: m, xp: engine.questXP(m),
        status: 'pending', completedAt: null
      }, true);
    },

    /* Ticks off quests whose linked data has reached the mark. Returns what it completed. */
    evaluateAuto(date, silent) {
      const events = [];
      engine.questsFor(date).forEach(q => {
        if (q.status !== 'pending' || !q.auto) return;
        const v = engine.dayValue(q.auto.metric, date);
        if (v !== null && v >= q.auto.min) { const e = engine.completeQuest(q.id, true); if (e) events.push(e); }
      });
      if (events.length && !silent) S().commit();
      return events;
    },

    /* ---------- goals ---------- */

    createGoal(input, plan) {
      const today = U.today();
      return S().put('goals', {
        title: String(input.title).trim().slice(0, 120),
        category: input.category, why: String(input.why || '').trim().slice(0, 300),
        startDate: today, targetDate: input.targetDate || U.addDays(today, 90),
        status: 'active', planSource: plan.source, summary: plan.summary,
        xpTarget: plan.xpTarget, milestones: plan.milestones,
        link: input.link || null, assignedOn: null
      }, true);
    },

    /* Deleting a goal also removes its unfinished quests; finished ones keep their XP. */
    deleteGoal(id) {
      S().all('quests').forEach(q => { if (q.goalId === id && q.status !== 'done') S().remove('quests', q.id, true); });
      S().remove('goals', id, true);
    },

    history(goalId, limit) {
      return S().all('quests').filter(q => q.goalId === goalId && q.status === 'done')
        .sort((a, b) => a.completedAt < b.completedAt ? 1 : -1).slice(0, limit || 8);
    }
  };

  QL.engine = engine;
})(typeof window !== 'undefined' ? window : globalThis);
