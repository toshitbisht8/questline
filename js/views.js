/* Questline — screens. Each function returns HTML; app.js wires up the clicks. */
(function (g) {
  const QL = (g.QL = g.QL || {});
  const U = QL.util, E = QL.engine, C = QL.catalog;
  const esc = U.esc;

  const prevFill = {};   // remembers bar widths so they animate from where they were
  function fill(key, pct) {
    const from = key in prevFill ? prevFill[key] : pct;
    return 'data-fill="' + esc(key) + '" data-w="' + pct.toFixed(2) + '" style="width:' + from.toFixed(2) + '%"';
  }

  const ICON = {
    today: '<path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M9 16l2 2 4-4"/>',
    goals: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h5a4 4 0 0 1 4 4v5"/>',
    data: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 6l-6 6 6 6"/>'
  };
  function ico(name, size, sw) {
    const s = size || 22;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }

  function cadenceLabel(q) {
    if (q.cadence === 'once') return 'One-off step';
    if (q.cadence === 'daily') return 'Every day';
    return q.perWeek === 1 ? 'Once a week' : q.perWeek + '× a week';
  }
  function autoLabel(auto) {
    const def = E.metric(auto.metric);
    return def ? 'Ticks itself off at ' + E.fmtValue(def, auto.min) : '';
  }
  function daysLeftText(goal) {
    const d = U.daysBetween(U.today(), goal.targetDate);
    if (d > 1) return d + ' days left';
    if (d === 1) return '1 day left';
    if (d === 0) return 'Due today';
    return U.plural(-d, 'day') + ' past target';
  }

  /* The signature piece: a goal as a transit line with a station per stage. */
  function lineHTML(goal, stats, opts) {
    const o = opts || {};
    const stations = stats.thresholds.map((t, i) => {
      const left = t / stats.total * 100;
      return '<span class="stn' + (stats.xp >= t ? ' on' : '') + '" style="left:' + left.toFixed(2) + '%" title="' + esc(goal.milestones[i].title) + '"></span>';
    }).join('');
    return '<div class="line' + (o.big ? ' big' : '') + '" role="img" aria-label="' + Math.round(stats.pct) + '% of the way, stage ' + Math.min(stats.msIndex + 1, goal.milestones.length) + ' of ' + goal.milestones.length + '">' +
      '<div class="line-track">' + stations + '<div class="line-fill" ' + fill((o.key || 'g') + goal.id, stats.pct) + '></div></div></div>';
  }

  function sparkline(points, link, color) {
    if (!points || points.length < 2) return '';
    const W = 300, H = 72, pad = 6;
    const vals = points.map(p => p.value);
    if (link && isFinite(link.target)) vals.push(Number(link.target));
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const x = i => pad + i * (W - pad * 2) / (points.length - 1);
    const y = v => H - pad - (v - lo) / (hi - lo) * (H - pad * 2);
    const path = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1)).join(' ');
    const last = points[points.length - 1];
    const target = link && isFinite(link.target) ? '<line x1="0" x2="' + W + '" y1="' + y(link.target).toFixed(1) + '" y2="' + y(link.target).toFixed(1) + '" stroke="' + color + '" stroke-width="1.5" stroke-dasharray="3 5" opacity=".7"/>' : '';
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Recent readings' + (target ? ', dashed line is the target' : '') + '">' + target +
      '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + x(points.length - 1).toFixed(1) + '" cy="' + y(last.value).toFixed(1) + '" r="4" fill="' + color + '"/></svg>';
  }

  /* ---------- frame ---------- */
  function shell(route, inner) {
    const tab = route.name === 'goal' ? 'goals' : route.name;
    const link = (id, label) => '<a href="#/' + id + '"' + (tab === id ? ' aria-current="page"' : '') + '>' + ico(id) + '<span>' + label + '</span></a>';
    const p = E.player();
    return '<div class="rail"><div class="brand"><span class="roundel" style="--c:var(--xp);color:var(--ink)">' + ico('goals', 20, 2.4) + '</span>Questline</div>' +
      '<nav aria-label="Main">' + link('today', 'Today') + link('goals', 'Goals') + link('data', 'Data') + link('settings', 'Settings') + '</nav>' +
      '<p class="rail-foot">Level ' + p.level + ', ' + U.fmtNum(p.xp, 0) + ' XP</p></div>' +
      '<main id="view" tabindex="-1">' + inner + '</main>';
  }

  /* ---------- today ---------- */
  function ticket(q) {
    const goal = q.goalId ? QL.store.byId('goals', q.goalId) : null;
    const cat = C.category(goal ? goal.category : 'other');
    const done = q.status === 'done';
    const meta = [];
    if (goal) meta.push('<a class="linechip" href="#/goal/' + goal.id + '">' + C.icon(goal.category, 16) + '<span>' + esc(goal.title) + '</span></a>');
    else meta.push('<span>Your own quest</span>');
    meta.push('<span>' + q.minutes + ' min</span>');
    if (q.auto && !done) meta.push('<span>' + esc(autoLabel(q.auto)) + '</span>');
    if (done && q.viaData) meta.push('<span>Ticked off by your data</span>');
    if (!done) meta.push('<button class="t-link" data-action="skip-quest" data-id="' + q.id + '">Not today</button>');
    return '<li class="ticket' + (done ? ' done' : '') + '" style="--c:' + cat.color + '">' +
      '<button class="check" data-action="toggle-quest" data-id="' + q.id + '" aria-pressed="' + done + '" aria-label="' + (done ? 'Undo: ' : 'Mark done: ') + esc(q.title) + '"><i>' + ico('check', 18, 3.4) + '</i></button>' +
      '<div class="t-body"><h3>' + esc(q.title) + '</h3><p class="t-meta">' + meta.join('') + '</p></div>' +
      '<div class="t-stub num"><b>' + (done ? '' : '+') + q.xp + '</b><span>XP' + (done ? ' earned' : '') + '</span></div></li>';
  }

  function playerStrip() {
    const p = E.player();
    const pct = p.intoLevel / p.levelSpan * 100;
    return '<section class="player" aria-label="Your level">' +
      '<div class="level"><b class="num">' + p.level + '</b><span>Level</span></div>' +
      '<div class="player-main"><div class="player-top"><strong class="num">' + U.fmtNum(p.xp, 0) + ' XP</strong><span class="num">' + U.fmtNum(p.toNext, 0) + ' XP to level ' + (p.level + 1) + '</span></div>' +
      '<div class="xpbar"><i ' + fill('player', pct) + '></i></div></div>' +
      '<div class="player-stats"><div><b class="num">' + p.todayXP + '</b>XP earned today</div><div><b class="num">' + p.streak + '</b>day streak</div></div></section>';
  }

  function goalLine(goal) {
    const st = E.goalStats(goal), cat = C.category(goal.category);
    const ms = goal.milestones[st.msIndex];
    return '<li><a class="goal-line" href="#/goal/' + goal.id + '" style="--c:' + cat.color + '">' +
      '<div class="gl-top"><span class="roundel">' + C.icon(goal.category, 18) + '</span><h3>' + esc(goal.title) + '</h3><b class="num">' + Math.round(st.pct) + '%</b></div>' +
      lineHTML(goal, st, { key: 't' }) +
      '<div class="gl-foot"><span>' + (st.lineDone ? 'End of the line reached' : 'Stage ' + (st.msIndex + 1) + ': ' + esc(ms.title)) + '</span><span class="num">' + U.fmtNum(st.xp, 0) + ' / ' + U.fmtNum(st.total, 0) + ' XP</span></div></a></li>';
  }

  function welcome() {
    return '<section class="welcome" style="--c:#1F5FE0"><h2>Turn a goal into something you can do today</h2>' +
      '<ol class="route">' +
      '<li><b>Add a goal</b><span>Money, skills, fitness, people, health, things, travel or purpose.</span></li>' +
      '<li><b>Get a staged plan</b><span>The app breaks it into stages and small actions. You can edit every step.</span></li>' +
      '<li><b>Do today\'s side quests</b><span>Each one adds XP to its goal and moves it along its line.</span></li>' +
      '<li><b>Link real numbers</b><span>Steps, weight, savings and more show whether the effort is paying off.</span></li></ol>' +
      '<button class="btn" data-action="add-goal">' + ico('plus', 20) + 'Add your first goal</button></section>';
  }

  function viewToday() {
    const today = U.today();
    const goals = E.activeGoals();
    const qs = E.questsFor(today).filter(q => q.status !== 'skipped');
    const open = qs.filter(q => q.status === 'pending'), done = qs.filter(q => q.status === 'done').sort((a, b) => a.completedAt < b.completedAt ? 1 : -1);
    const name = QL.store.state.profile.name;
    let html = '<header class="page-head"><div><h1>' + esc(U.fmtLongDate(today)) + '</h1>' +
      (name ? '<p class="sub">' + esc(name) + '\'s side quests</p>' : '') + '</div></header>';

    if (!goals.length && !qs.length) return html + welcome();

    let quests = '<section class="section" aria-labelledby="h-open"><div class="section-head"><h2 id="h-open">' +
      (open.length ? U.plural(open.length, 'side quest') + ' to do' : (done.length ? 'All done for today' : 'No side quests today')) + '</h2>' +
      '<button class="btn sm ghost" data-action="custom-quest">' + ico('plus', 18) + 'Add your own</button></div>';
    if (open.length) quests += '<ul class="tickets">' + open.map(ticket).join('') + '</ul>';
    else if (done.length) quests += '<p class="empty">Everything is ticked off. New side quests arrive tomorrow, or add one of your own.</p>';
    else quests += '<p class="empty">Your goals have no steps left to hand out today. Open a goal and edit its plan to add more.</p>';
    if (done.length) quests += '<div class="section"><div class="section-head"><h2>Done today</h2></div><ul class="tickets">' + done.map(ticket).join('') + '</ul></div>';
    quests += '</section>';

    const lines = '<section class="section" aria-labelledby="h-lines"><div class="section-head"><h2 id="h-lines">Goal progress</h2><a class="btn sm quiet" href="#/goals">All goals</a></div>' +
      (goals.length ? '<ul class="goal-lines">' + goals.map(goalLine).join('') + '</ul>' : '<p class="empty">No active goals.</p>') + '</section>';

    return html + playerStrip() + '<div class="today-grid section"><div>' + quests + '</div><div>' + lines + '</div></div>';
  }

  /* ---------- goals ---------- */
  function goalCard(goal) {
    const st = E.goalStats(goal), cat = C.category(goal.category), mp = E.metricProgress(goal);
    return '<li><a class="goal-card" href="#/goal/' + goal.id + '" style="--c:' + cat.color + '">' +
      '<header><span class="roundel">' + C.icon(goal.category, 18) + '</span><div><span class="cat">' + esc(cat.name) + '</span><h3>' + esc(goal.title) + '</h3></div></header>' +
      lineHTML(goal, st, { key: 'c' }) +
      '<div class="pair"><span>Effort</span><b class="num">' + U.fmtNum(st.xp, 0) + ' / ' + U.fmtNum(st.total, 0) + ' XP</b></div>' +
      (mp ? '<div class="pair"><span>' + esc(mp.def.name) + '</span><b class="num">' + E.fmtValue(mp.def, mp.cur) + ' of ' + E.fmtValue(mp.def, mp.target) + '</b></div>' : '') +
      '<div class="pair"><span>' + (goal.status === 'active' ? daysLeftText(goal) : (goal.status === 'achieved' ? 'Achieved' : 'Archived')) + '</span><span>Stage ' + Math.min(st.msIndex + 1, goal.milestones.length) + ' of ' + goal.milestones.length + '</span></div></a></li>';
  }

  function viewGoals() {
    const all = QL.store.all('goals').sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
    const active = all.filter(x => x.status === 'active'), rest = all.filter(x => x.status !== 'active');
    let html = '<header class="page-head"><div><h1>Goals</h1><p class="sub">Each goal is a line. Side quests move you along it; linked data shows the real-world result.</p></div>' +
      '<button class="btn" data-action="add-goal">' + ico('plus', 20) + 'Add goal</button></header>';
    if (!all.length) return html + '<p class="empty">No goals yet. Add one and the app will break it into daily side quests.</p>';
    if (active.length) html += '<ul class="goal-cards">' + active.map(goalCard).join('') + '</ul>';
    else html += '<p class="empty">No active goals. Add a new one or reopen an old one.</p>';
    if (rest.length) html += '<section class="section"><div class="section-head"><h2>Finished and archived</h2></div><ul class="goal-cards">' + rest.map(goalCard).join('') + '</ul></section>';
    return html;
  }

  function dataPanel(goal, cat) {
    const mp = E.metricProgress(goal);
    if (!mp) {
      return '<section class="panel"><h2>Real data</h2><p class="sub">XP measures effort. Link a number you can measure, such as weight, savings or study time, to see the result as well.</p>' +
        '<div class="btn-row" style="margin-top:14px"><button class="btn ghost" data-action="link-data" data-id="' + goal.id + '">Link data to this goal</button></div></section>';
    }
    const modeText = { latest: 'Latest reading', total: 'Total since you started', avg7: 'Average of the last 7 days' }[mp.mode];
    return '<section class="panel"><h2>' + esc(mp.def.name) + '</h2>' +
      '<div class="data-now"><b class="num">' + E.fmtValue(mp.def, mp.cur) + '</b><span class="small">' + modeText + (mp.lastDate ? ', last logged ' + U.fmtDate(mp.lastDate, { day: 'numeric', month: 'short' }) : '') + '</span></div>' +
      (mp.pct !== null ? '<div class="meter"><i ' + fill('m' + goal.id, mp.pct) + '></i></div><div class="pair"><span class="num">Start ' + E.fmtValue(mp.def, mp.start) + '</span><b class="num">' + Math.round(mp.pct) + '% to ' + E.fmtValue(mp.def, mp.target) + '</b></div>' : '') +
      (mp.points.length >= 2 ? sparkline(mp.points, mp.mode === 'total' ? null : goal.link, cat.color) : '<p class="small" style="margin-top:12px">' + (mp.points.length ? 'One reading so far. Log another to see the trend.' : 'No readings yet. Log one, or bring data in from the Data screen.') + '</p>') +
      '<div class="btn-row" style="margin-top:16px"><button class="btn sm" data-action="log-value" data-metric="' + esc(mp.def.key) + '">Log a reading</button>' +
      '<button class="btn sm ghost" data-action="link-data" data-id="' + goal.id + '">Change</button></div></section>';
  }

  function viewGoal(id) {
    const goal = QL.store.byId('goals', id);
    if (!goal) return '<a class="back" href="#/goals">' + ico('back', 18) + 'Goals</a><p class="empty">This goal no longer exists.</p>';
    const st = E.goalStats(goal), cat = C.category(goal.category);
    const hist = E.history(goal.id, 8);
    const stages = goal.milestones.map((m, i) => {
      const state = i < st.stagesDone ? 'done' : (i === st.msIndex ? 'now' : '');
      const right = state === 'done' ? '<span class="tag xp">Reached</span>' : (state === 'now' ? '<span class="tag num">' + U.fmtNum(st.msXP, 0) + ' / ' + U.fmtNum(m.xp, 0) + ' XP</span>' : '<span class="tag num">' + U.fmtNum(m.xp, 0) + ' XP</span>');
      const quests = state === 'now' || goal.milestones.length <= 2
        ? '<div class="qdefs">' + m.quests.map(q => '<div><span>' + esc(q.title) + '</span><span class="num">' + cadenceLabel(q) + ', ' + q.xp + ' XP</span></div>').join('') + '</div>'
        : '<p class="small">' + U.plural(m.quests.length, 'side quest') + '</p>';
      return '<li class="' + state + '"><div class="st-head"><h3>' + esc(m.title) + '</h3>' + right + '</div>' + (m.note ? '<p class="st-note">' + esc(m.note) + '</p>' : '') + quests + '</li>';
    }).join('');

    const statusBtns = goal.status === 'active'
      ? '<button class="btn sm ghost" data-action="goal-status" data-id="' + goal.id + '" data-status="achieved">Mark as achieved</button><button class="btn sm ghost" data-action="goal-status" data-id="' + goal.id + '" data-status="archived">Archive</button>'
      : '<button class="btn sm ghost" data-action="goal-status" data-id="' + goal.id + '" data-status="active">Reopen goal</button>';

    return '<div style="--c:' + cat.color + '"><a class="back" href="#/goals">' + ico('back', 18) + 'Goals</a>' +
      '<section class="goal-hero"><p class="cat"><span class="roundel">' + C.icon(goal.category, 18) + '</span>' + esc(cat.name) + (goal.status !== 'active' ? ' <span class="tag">' + (goal.status === 'achieved' ? 'Achieved' : 'Archived') + '</span>' : '') + '</p>' +
      '<h1>' + esc(goal.title) + '</h1>' + (goal.why ? '<p class="why">' + esc(goal.why) + '</p>' : '') +
      (st.lineDone && goal.status === 'active' ? '<p class="notice ok" style="margin-top:16px">You have put in all the XP this plan called for. If the goal is met, mark it as achieved; if not, edit the plan to add a further stage.</p>' : '') +
      '<div class="hero-line">' + lineHTML(goal, st, { big: true, key: 'h' }) + '</div>' +
      '<div class="stats"><div><b class="num">' + Math.round(st.pct) + '%</b>of planned effort</div><div><b class="num">' + U.fmtNum(st.xp, 0) + '</b>of ' + U.fmtNum(st.total, 0) + ' XP</div><div><b class="num">' + Math.min(st.msIndex + 1, goal.milestones.length) + ' / ' + goal.milestones.length + '</b>stage</div></div>' +
      '<p class="small" style="margin-top:14px">Target ' + U.fmtDate(goal.targetDate) + ' (' + daysLeftText(goal).toLowerCase() + ')</p></section>' +

      '<div class="detail-grid"><section class="panel"><div class="section-head"><h2>Stages</h2><button class="btn sm ghost" data-action="edit-plan" data-id="' + goal.id + '">Edit plan</button></div>' +
      (goal.summary ? '<p class="sub" style="margin-bottom:18px">' + esc(goal.summary) + '</p>' : '') + '<ol class="stages">' + stages + '</ol></section>' +
      '<div style="display:grid;gap:20px">' + dataPanel(goal, cat) +
      '<section class="panel"><h2>Recently done</h2>' + (hist.length ? '<ul class="hist">' + hist.map(q => '<li><span>' + esc(q.title) + '</span><span class="num">+' + q.xp + ' XP, ' + U.fmtDate(q.date, { day: 'numeric', month: 'short' }) + '</span></li>').join('') + '</ul>' : '<p class="small">Nothing yet. Finish a side quest on the Today screen and it shows up here.</p>') + '</section>' +
      '<section class="panel"><h2>Manage</h2><div class="btn-row">' + statusBtns + '<button class="btn sm danger" data-action="delete-goal" data-id="' + goal.id + '">Delete goal</button></div></section>' +
      '</div></div></div>';
  }

  /* ---------- data ---------- */
  function viewData() {
    const st = QL.store.settings;
    const pts = QL.store.all('datapoints');
    const withData = E.allMetrics().filter(m => pts.some(p => p.metric === m.key));
    const cards = withData.map(m => {
      const s = E.series(m.key), last = s[s.length - 1];
      return '<li class="metric-card"><header><div><h3>' + esc(m.name) + '</h3><b class="num">' + E.fmtValue(m, last.value) + '</b><span class="small">' + U.fmtDate(last.date, { day: 'numeric', month: 'short' }) + ', ' + U.plural(s.length, 'day') + ' logged</span></div>' +
        '<button class="btn sm ghost" data-action="log-value" data-metric="' + esc(m.key) + '">Log</button></header>' + sparkline(s.slice(-30), null, '#151A3B') + '</li>';
    }).join('');

    const hasSample = pts.some(p => p.source === 'sample');
    const gh = QL.connectors.get('google-health'), ghOk = gh.available();

    return '<header class="page-head"><div><h1>Data</h1><p class="sub">Real numbers behind your goals. Log them by hand, import a file, or connect a source. Link a measure to a goal from the goal\'s page.</p></div>' +
      '<button class="btn" data-action="log-value">' + ico('plus', 20) + 'Log a reading</button></header>' +
      (withData.length ? '<ul class="metric-cards">' + cards + '</ul>' : '<p class="empty">Nothing logged yet. Log a reading, import a file, or add sample data below to see how it works.</p>') +
      '<div class="btn-row" style="margin-top:14px"><button class="btn sm ghost" data-action="custom-metric">Add your own measure</button></div>' +

      '<section class="section"><div class="section-head"><h2>Sources</h2></div><div class="sources">' +
      '<article class="source"><header><h3>Import a CSV file</h3></header><p class="sub">Works with exports from Google Fit (via Google Takeout), smart scales, food trackers, bank statements, or any sheet with a date column. You choose which column feeds which measure.</p>' +
      '<div class="btn-row"><button class="btn sm" data-action="csv-import">Choose a file</button></div></article>' +

      '<article class="source"><header><h3>' + esc(gh.name) + ' <span class="tag">Beta</span></h3></header><p class="sub">' + esc(gh.blurb) + ' Health Connect keeps its data on the phone, so a web app reaches Google health data through this cloud connection or through file exports.</p>' +
      '<form class="form" data-form="google-client"><label class="field"><span>Google OAuth client ID</span><input type="text" name="clientId" value="' + esc(st.google.clientId) + '" placeholder="1234567890-abc.apps.googleusercontent.com" autocomplete="off"><small>Create one in Google Cloud Console; the README has the steps.</small></label>' +
      '<div class="btn-row"><button class="btn sm ghost" type="submit">Save client ID</button><button class="btn sm" type="button" data-action="sync" data-id="google-health"' + (ghOk.ok ? '' : ' disabled') + '>Sign in and sync 30 days</button></div>' +
      (ghOk.ok ? '' : '<p class="small">' + esc(ghOk.reason) + '</p>') + '</form></article>' +

      '<article class="source"><header><h3>Sample data</h3></header><p class="sub">' + esc(QL.connectors.get('sample').blurb) + '</p>' +
      '<div class="btn-row">' + (hasSample ? '<button class="btn sm danger" data-action="remove-sample">Remove sample data</button>' : '<button class="btn sm ghost" data-action="sync" data-id="sample">Add sample data</button>') + '</div></article>' +
      '</div></section>';
  }

  /* ---------- settings ---------- */
  function viewSettings() {
    const st = QL.store.settings, name = QL.store.state.profile.name;
    const isFile = g.location.protocol === 'file:';
    return '<header class="page-head"><div><h1>Settings</h1></div></header><div class="settings">' +
      '<section class="panel"><h2>You and your day</h2><form class="form" data-form="prefs">' +
      '<label class="field"><span>Your name</span><input type="text" name="name" value="' + esc(name) + '" autocomplete="given-name"></label>' +
      '<div class="two"><label class="field"><span>Side quests per goal each day</span><select name="perGoal">' + [1, 2, 3, 4].map(n => '<option' + (st.questsPerGoal === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Most side quests in a day</span><select name="max">' + [3, 4, 5, 6, 8, 10, 12].map(n => '<option' + (st.maxQuestsPerDay === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select><small>Every active goal still gets at least one.</small></label></div>' +
      '<label class="field"><span>Currency symbol</span><input type="text" name="currency" value="' + esc(st.currency) + '" maxlength="4" style="max-width:120px"></label>' +
      '<div class="btn-row"><button class="btn" type="submit">Save settings</button></div></form></section>' +

      '<section class="panel"><h2>AI goal breakdown</h2><p class="sub" style="margin-bottom:16px">With a Claude API key, new goals get a plan written for your situation. Without one, the app uses its built-in plans. The key is stored only in this browser and is left out of backups.</p>' +
      '<form class="form" data-form="ai"><label class="field"><span>Claude API key</span><input type="password" name="apiKey" value="' + esc(st.ai.apiKey) + '" placeholder="sk-ant-..." autocomplete="off"><small>Get one at console.anthropic.com. Each plan costs a small amount of API credit.</small></label>' +
      '<label class="field"><span>Model</span><input type="text" name="model" value="' + esc(st.ai.model) + '"></label>' +
      '<div class="btn-row"><button class="btn" type="submit">Save AI settings</button><button class="btn ghost" type="button" data-action="test-ai">Test the key</button></div><p id="ai-status" class="small" aria-live="polite">' + (st.ai.apiKey ? 'A key is saved.' : 'No key saved. Using built-in plans.') + '</p></form></section>' +

      '<section class="panel"><h2>Backup</h2><p class="sub" style="margin-bottom:16px">Your data lives in this browser on this device. Download a backup to keep it safe or to move it to another device.</p>' +
      '<div class="btn-row"><button class="btn ghost" data-action="export">Download backup</button><button class="btn ghost" data-action="import">Restore from backup</button></div>' +
      (QL.store.saveOk ? '' : '<p class="notice bad" style="margin-top:14px">This browser is not saving data (storage is blocked or full). Download a backup now.</p>') + '</section>' +

      '<section class="panel"><h2>Use it as an app</h2>' +
      (isFile ? '<p class="sub">You opened the app as a file, which works for everything except installing it and Google sign-in. To install it, run <b>Start Questline.bat</b> and open the address it shows, or host the folder online (see README) and open that address on your phone.</p>'
        : '<p class="sub">On a phone, open the browser menu and choose "Add to Home screen". On a computer, use the install icon in the address bar.</p><div class="btn-row" style="margin-top:14px"><button class="btn ghost" data-action="install" id="install-btn"' + (QL.installPrompt ? '' : ' hidden') + '>Install Questline</button></div>') + '</section>' +

      '<section class="panel"><h2>Start over</h2><p class="sub" style="margin-bottom:16px">Deletes every goal, side quest and reading from this browser.</p><button class="btn danger" data-action="reset">Erase all data</button></section></div>';
  }

  QL.views = { shell, viewToday, viewGoals, viewGoal, viewData, viewSettings, ico, cadenceLabel, autoLabel, prevFill };
})(window);
