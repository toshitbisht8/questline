/* Questline — dialogs: add a goal, edit a plan, link data, log readings, import files. */
(function (g) {
  const QL = (g.QL = g.QL || {});
  const U = QL.util, E = QL.engine, C = QL.catalog, V = QL.views;
  const esc = U.esc;

  function sheet(title, sub, body, opts) {
    const o = opts || {};
    const steps = o.steps ? '<div class="steps" aria-label="Step ' + o.steps[0] + ' of ' + o.steps[1] + '">' + Array.from({ length: o.steps[1] }, (_, i) => '<i' + (i < o.steps[0] ? ' class="on"' : '') + '></i>').join('') + '</div>' : '';
    return '<div class="overlay"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"' + (o.color ? ' style="--c:' + o.color + '"' : '') + '>' + steps +
      '<div class="sheet-head"><div><h2 id="sheet-title">' + esc(title) + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      '<button class="xbtn" data-action="close-modal" aria-label="Close">' + V.ico('x', 18, 2.6) + '</button></div>' + body + '</div></div>';
  }

  function metricOptions(selected, withNone) {
    const cur = QL.store.settings.currency;
    return (withNone ? '<option value="">' + withNone + '</option>' : '') + E.allMetrics().map(m =>
      '<option value="' + esc(m.key) + '"' + (m.key === selected ? ' selected' : '') + '>' + esc(m.name) + ' (' + esc(m.unit === 'CUR' ? cur : m.unit) + ')</option>').join('');
  }

  /* ---------- plan editor (shared by the add-goal flow and "Edit plan") ---------- */
  function cadenceValue(q) { return q.cadence === 'weekly' ? 'w' + (q.perWeek || 2) : q.cadence; }
  function planEditor(plan) {
    const opts = [['daily', 'Every day'], ['w5', '5× a week'], ['w4', '4× a week'], ['w3', '3× a week'], ['w2', '2× a week'], ['w1', 'Once a week'], ['once', 'One-off step']];
    return '<p class="hint" style="margin:0 0 12px">Each row is one side quest: what to do, how often, and how many minutes it takes. Longer quests earn more XP.</p>' +
      plan.milestones.map((m, i) =>
        '<div class="plan-ms" data-ms="' + i + '"><div class="plan-ms-head"><input type="text" data-pf="ms-title" value="' + esc(m.title) + '" aria-label="Name of stage ' + (i + 1) + '" maxlength="80">' +
        (plan.milestones.length > 1 ? '<button type="button" class="xbtn" data-action="plan-remove-stage" data-ms="' + i + '" aria-label="Remove stage ' + (i + 1) + '">' + V.ico('x', 16, 2.6) + '</button>' : '') + '</div>' +
        m.quests.map((q, j) =>
          '<div class="plan-q" data-q="' + j + '"><input type="text" data-pf="title" value="' + esc(q.title) + '" aria-label="Side quest" maxlength="140" placeholder="What to do">' +
          '<select data-pf="cadence" aria-label="How often">' + opts.map(o => '<option value="' + o[0] + '"' + (cadenceValue(q) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
          '<input type="number" data-pf="minutes" value="' + q.minutes + '" min="1" max="240" aria-label="Minutes" title="Minutes">' +
          '<button type="button" class="xbtn" data-action="plan-remove-quest" data-ms="' + i + '" data-q="' + j + '" aria-label="Remove this side quest">' + V.ico('x', 16, 2.6) + '</button>' +
          (q.auto ? '<span class="plan-auto">' + esc(V.autoLabel(q.auto)) + ' when that data is logged</span>' : '') + '</div>').join('') +
        '<div><button type="button" class="btn sm quiet" data-action="plan-add-quest" data-ms="' + i + '">' + V.ico('plus', 16) + 'Add a side quest</button></div></div>').join('') +
      '<div style="margin-top:12px"><button type="button" class="btn sm ghost" data-action="plan-add-stage">' + V.ico('plus', 16) + 'Add a stage</button></div>';
  }

  /* ---------- link data fields ---------- */
  function linkFields(link, optional) {
    const l = link || {};
    const def = l.metric ? E.metric(l.metric) : null;
    const mode = l.mode || (def && def.agg === 'sum' ? 'total' : 'latest');
    const modes = [['latest', 'The latest reading (a weight, a balance)'], ['total', 'A running total since the goal started'], ['avg7', 'The average of the last 7 days']];
    return '<label class="field"><span>What to measure</span><select name="metric" data-change="link-metric">' + metricOptions(l.metric, optional ? 'Nothing for now' : null) + '</select>' +
      '<small>Missing something? Add your own measure on the Data screen.</small></label>' +
      '<label class="field"><span>How to read it</span><select name="mode">' + modes.map(m => '<option value="' + m[0] + '"' + (mode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select></label>' +
      '<div class="two"><label class="field"><span>Where you are starting</span><input type="number" step="any" name="start" value="' + (l.start !== undefined && l.start !== null ? l.start : '') + '" placeholder="0"></label>' +
      '<label class="field"><span>Target</span><input type="number" step="any" name="target" value="' + (l.target !== undefined && l.target !== null ? l.target : '') + '"' + (optional ? '' : ' required') + '></label></div>';
  }

  const M = {
    addGoal(m) {
      const d = m.draft, cat = C.category(d.input.category);
      if (d.loading) {
        return sheet('Building your plan', '', '<div class="loading"><div class="train"></div><p>' + (QL.ai.hasKey() ? 'Asking the AI to break "' + esc(d.input.title) + '" into stages and side quests. This takes a few seconds.' : 'Putting your plan together.') + '</p></div>', { steps: [2, 3], color: cat.color });
      }
      if (d.step === 1) {
        const i = d.input;
        return sheet('Add a goal', 'Say what you want. The app breaks it into stages and daily side quests.',
          '<form class="form" data-form="goal-basics"><div><span class="legend" id="cat-l">Area of life</span><div class="cats" role="radiogroup" aria-labelledby="cat-l">' +
          C.categories.map(c => '<label style="--c:' + c.color + '"><input type="radio" name="category" required value="' + c.id + '"' + (i.category === c.id ? ' checked' : '') + '><span class="roundel">' + C.icon(c.id, 15) + '</span>' + esc(c.name) + '</label>').join('') + '</div></div>' +
          '<label class="field"><span>Your goal</span><input type="text" name="title" value="' + esc(i.title) + '" required maxlength="120" placeholder="e.g. Build a 6-month emergency fund" autocomplete="off"></label>' +
          '<label class="field"><span>Where are you now?</span><textarea name="context" maxlength="500" placeholder="Optional. e.g. I have ₹40,000 saved and spend about ₹35,000 a month.">' + esc(i.context) + '</textarea><small>The AI uses this to fit the plan to you. Built-in plans ignore it.</small></label>' +
          '<label class="field"><span>Why it matters</span><input type="text" name="why" value="' + esc(i.why) + '" maxlength="300" placeholder="Optional. Shown on the goal page to keep you going."></label>' +
          '<div class="two"><label class="field"><span>Target date</span><input type="date" name="targetDate" value="' + esc(i.targetDate) + '" min="' + U.addDays(U.today(), 14) + '" required></label>' +
          '<label class="field"><span>Time you can give it per day</span><select name="minutesPerDay">' + [15, 30, 45, 60, 90, 120].map(n => '<option value="' + n + '"' + (i.minutesPerDay === n ? ' selected' : '') + '>About ' + n + ' minutes</option>').join('') + '</select></label></div>' +
          '<div class="sheet-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Build my plan</button></div></form>',
          { steps: [1, 3], color: cat.color });
      }
      if (d.step === 2) {
        return sheet('Check your plan', d.plan.source === 'ai' ? 'Written by AI for this goal. Change anything that does not fit.' : 'A built-in starter plan. Change anything that does not fit.',
          (d.notice ? '<p class="notice" style="margin-bottom:14px">' + esc(d.notice) + '</p>' : '') +
          (d.plan.summary && d.plan.source === 'ai' ? '<p class="sub" style="margin-bottom:14px">' + esc(d.plan.summary) + '</p>' : '') +
          '<form data-form="goal-plan">' + planEditor(d.plan) +
          '<div class="sheet-foot"><div class="btn-row"><button type="button" class="btn ghost" data-action="wizard-back">Back</button>' + (QL.ai.hasKey() ? '<button type="button" class="btn quiet" data-action="wizard-regenerate">Ask the AI again</button>' : '') + '</div><button class="btn" type="submit">Next: real data</button></div></form>',
          { steps: [2, 3], color: cat.color });
      }
      return sheet('Link real data', 'Optional. XP tracks your effort; a linked number tracks the result. You can do this later from the goal page.',
        '<form class="form" data-form="goal-link">' + linkFields(d.link, true) +
        '<div class="sheet-foot"><button type="button" class="btn ghost" data-action="wizard-back">Back</button><button class="btn" type="submit">Create goal</button></div></form>',
        { steps: [3, 3], color: cat.color });
    },

    editPlan(m) {
      const goal = QL.store.byId('goals', m.goalId);
      return sheet('Edit plan', esc(goal.title), '<form data-form="edit-plan">' + planEditor(m.plan) +
        '<div class="sheet-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Save plan</button></div></form>', { color: C.category(goal.category).color });
    },

    linkData(m) {
      const goal = QL.store.byId('goals', m.goalId);
      return sheet('Link data to this goal', esc(goal.title), '<form class="form" data-form="link-data">' + linkFields(goal.link || { metric: C.suggestedMetric[goal.category] || 'steps' }, false) +
        '<div class="sheet-foot"><div class="btn-row"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button>' + (goal.link ? '<button type="button" class="btn danger" data-action="unlink-data">Remove link</button>' : '') + '</div><button class="btn" type="submit">Save link</button></div></form>');
    },

    logValue(m) {
      const key = m.metric || 'steps', def = E.metric(key) || E.allMetrics()[0];
      const today = U.today(), cur = E.dayValue(def.key, today);
      return sheet('Log a reading', '', '<form class="form" data-form="log-value">' +
        '<label class="field"><span>Measure</span><select name="metric" data-change="log-metric">' + metricOptions(def.key) + '</select></label>' +
        '<div class="two"><label class="field"><span>Value</span><input type="number" step="any" name="value" required inputmode="decimal"></label>' +
        '<label class="field"><span>Date</span><input type="date" name="date" value="' + today + '" max="' + today + '" required></label></div>' +
        (def.agg === 'sum' ? '<label class="check-row"><input type="checkbox" name="add" checked> Add to that day\'s total' + (cur !== null ? ' (today so far: ' + E.fmtValue(def, cur) + ')' : '') + '</label>' : '<p class="hint">This replaces any reading already logged for that day.</p>') +
        '<div class="sheet-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Log reading</button></div></form>');
    },

    customQuest() {
      const goals = E.activeGoals();
      return sheet('Add your own side quest', 'For today only.', '<form class="form" data-form="custom-quest">' +
        '<label class="field"><span>What will you do?</span><input type="text" name="title" required maxlength="140" autocomplete="off"></label>' +
        '<div class="two"><label class="field"><span>Counts towards</span><select name="goalId"><option value="">No goal, just XP</option>' + goals.map(x => '<option value="' + x.id + '">' + esc(x.title) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>Minutes it takes</span><input type="number" name="minutes" value="15" min="1" max="240" required></label></div>' +
        '<div class="sheet-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Add side quest</button></div></form>');
    },

    customMetric() {
      return sheet('Add your own measure', 'Anything you can put a number on.', '<form class="form" data-form="custom-metric">' +
        '<label class="field"><span>Name</span><input type="text" name="name" required maxlength="40" placeholder="e.g. Guitar practice" autocomplete="off"></label>' +
        '<div class="two"><label class="field"><span>Unit</span><input type="text" name="unit" required maxlength="12" placeholder="e.g. min"></label>' +
        '<label class="field"><span>Several readings in one day</span><select name="agg"><option value="sum">Add them up</option><option value="last">Keep the latest</option></select></label></div>' +
        '<div class="sheet-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Add measure</button></div></form>');
    },

    csv(m) {
      let body = (m.error ? '<p class="notice bad" style="margin-bottom:14px">' + esc(m.error) + '</p>' : '') +
        '<label class="field"><span>CSV file</span><input type="file" accept=".csv,text/csv,text/plain" data-change="csv-file"></label>';
      if (m.inspected) {
        const ins = m.inspected;
        body += '<form class="form" data-form="csv-map" style="margin-top:18px"><p class="sub"><b>' + esc(m.fileName) + '</b>: ' + U.plural(ins.rowCount, 'row') + ', dates from the "' + esc(ins.headers[ins.dateCol]) + '" column.</p>' +
          '<table class="map"><thead><tr><th>Column in the file</th><th>Bring in as</th></tr></thead><tbody>' +
          ins.columns.map(c => '<tr><th scope="row">' + esc(c.header) + '</th><td><select name="col-' + c.index + '" aria-label="Measure for ' + esc(c.header) + '">' + ('<option value="">Do not import</option>' + E.allMetrics().map(x => '<option value="' + esc(x.key) + '"' + (x.key === c.metric ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('')) + '</select></td></tr>').join('') + '</tbody></table>' +
          (ins.ambiguous ? '<label class="field"><span>Dates like 03/04/2026 mean</span><select name="order"><option value="dmy">Day first (3 April)</option><option value="mdy">Month first (4 March)</option></select></label>' : '') +
          '<p class="hint">A day that already has a reading for the same measure is replaced by the file\'s value.</p>' +
          '<div class="sheet-foot"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" type="submit">Import</button></div></form>';
      }
      return sheet('Import a CSV file', 'Pick the file, then say which column feeds which measure.', body);
    },

    confirm(m) {
      return sheet(m.title, '', '<p class="sub">' + esc(m.body) + '</p><div class="sheet-foot"><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger" data-action="confirm-yes">' + esc(m.confirmLabel) + '</button></div>');
    }
  };

  QL.modals = { render(m) { return m && M[m.type] ? M[m.type](m) : ''; }, planEditor };
})(window);
