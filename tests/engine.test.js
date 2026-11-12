/* Run with:  node tests/engine.test.js
   Loads the app's logic files (no browser needed) and checks the rules. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const mem = {};
const sandbox = {
  console, Date, Math, JSON, Map, Set, Promise, setTimeout,
  localStorage: { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } },
  fetch: async () => { throw new Error('offline'); }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['util', 'store', 'catalog', 'templates', 'engine', 'ai', 'connectors'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
});
const { QL } = sandbox;
const { util: U, store, engine, templates, connectors, ai, catalog } = QL;

let passed = 0;
function test(name, fn) {
  const run = async () => { store.reset(); await fn(); passed++; console.log('  ok  ' + name); };
  return run().catch(e => { console.error('FAIL  ' + name + '\n', e); process.exitCode = 1; });
}
function newGoal(category, title, days) {
  const plan = engine.normalizePlan(templates.plan(category, title), days || 90);
  return engine.createGoal({ title, category, targetDate: U.addDays(U.today(), days || 90) }, plan);
}

(async () => {
  store.init();

  await test('every category has a usable template plan', () => {
    catalog.categories.forEach(c => {
      const plan = engine.normalizePlan(templates.plan(c.id, 'Test goal'), 90);
      assert.strictEqual(plan.milestones.length, 4, c.id);
      assert.strictEqual(plan.milestones.reduce((a, m) => a + m.xp, 0), plan.xpTarget, c.id);
      plan.milestones.forEach(m => {
        assert.ok(m.quests.length >= 4, c.id + ' ' + m.title);
        m.quests.forEach(q => { assert.ok(q.xp >= 10 && q.xp <= 50); assert.ok(!/\{goal\}/.test(q.title)); });
        assert.ok(m.quests.some(q => q.cadence !== 'once'), c.id + ' needs a repeatable quest in ' + m.title);
      });
    });
  });

  await test('daily assignment gives each goal quests once per day', () => {
    const a = newGoal('fitness', 'Run 5 km'), b = newGoal('financial', 'Save 1 lakh');
    const today = U.today();
    assert.ok(engine.ensureToday(today));
    const qs = engine.questsFor(today);
    assert.strictEqual(qs.filter(q => q.goalId === a.id).length, 2);
    assert.strictEqual(qs.filter(q => q.goalId === b.id).length, 2);
    assert.strictEqual(engine.ensureToday(today), false, 'second call adds nothing');
    assert.strictEqual(engine.questsFor(today).length, 4);
    const defs = qs.map(q => q.defId);
    assert.strictEqual(new Set(defs).size, defs.length, 'no duplicates');
  });

  await test('daily cap still leaves every goal at least one quest', () => {
    catalog.categories.forEach(c => newGoal(c.id, 'Goal ' + c.id));
    engine.ensureToday(U.today());
    const qs = engine.questsFor(U.today());
    engine.activeGoals().forEach(gl => assert.ok(qs.some(q => q.goalId === gl.id), gl.title));
    assert.strictEqual(qs.length, 9);
  });

  await test('completing quests adds XP to the goal and moves it through stages', () => {
    const goal = newGoal('upskilling', 'Learn SQL', 30);
    const first = goal.milestones[0];
    let day = U.today(), stageEvent = null, guard = 0;
    while (!stageEvent && guard++ < 60) {
      goal.assignedOn = null;
      engine.ensureToday(day);
      engine.questsFor(day).forEach(q => { const e = engine.completeQuest(q.id); if (e && e.stageDone) stageEvent = e; });
      day = U.addDays(day, 1);
    }
    assert.ok(stageEvent, 'a stage completes');
    assert.strictEqual(stageEvent.stageDone, first.title);
    const stats = engine.goalStats(goal);
    assert.ok(stats.xp >= first.xp);
    assert.strictEqual(stats.msIndex, 1);
    assert.strictEqual(engine.player().xp, stats.xp);
  });

  await test('one-off steps are not handed out again once done', () => {
    const goal = newGoal('financial', 'Emergency fund');
    const today = U.today();
    engine.ensureToday(today);
    const once = engine.questsFor(today).find(q => goal.milestones[0].quests.find(d => d.id === q.defId).cadence === 'once');
    assert.ok(once, 'a one-off step is assigned on day one');
    engine.completeQuest(once.id);
    const tomorrow = U.addDays(today, 1);
    goal.assignedOn = null;
    engine.ensureToday(tomorrow);
    assert.ok(!engine.questsFor(tomorrow).some(q => q.defId === once.defId));
  });

  await test('reopening a quest takes its XP back', () => {
    newGoal('health', 'Sleep better');
    engine.ensureToday(U.today());
    const q = engine.questsFor(U.today())[0];
    engine.completeQuest(q.id);
    assert.strictEqual(engine.player().xp, q.xp);
    engine.reopenQuest(q.id);
    assert.strictEqual(engine.player().xp, 0);
  });

  await test('skipping swaps in another quest from the same goal', () => {
    const goal = newGoal('fitness', 'Get fit');
    engine.ensureToday(U.today());
    const q = engine.questsFor(U.today())[0];
    const swap = engine.skipQuest(q.id);
    assert.ok(swap && swap.goalId === goal.id && swap.defId !== q.defId);
    assert.strictEqual(store.byId('quests', q.id).status, 'skipped');
  });

  await test('linked data completes matching quests on its own', () => {
    newGoal('fitness', 'Get fit');
    const today = U.today();
    engine.ensureToday(today);
    const walk = engine.questsFor(today).find(q => q.auto && q.auto.metric === 'steps');
    assert.ok(walk, 'the steps quest is assigned');
    engine.logValue('steps', today, 3000, 'manual', 'add');
    assert.strictEqual(store.byId('quests', walk.id).status, 'pending');
    engine.logValue('steps', today, 3500, 'manual', 'add');
    assert.strictEqual(engine.dayValue('steps', today), 6500);
    const after = store.byId('quests', walk.id);
    assert.strictEqual(after.status, 'done');
    assert.strictEqual(after.viaData, true);
  });

  await test('real-data progress: latest, total and 7-day average', () => {
    const goal = newGoal('fitness', 'Reach 72 kg');
    const today = U.today();
    goal.link = { metric: 'weight_kg', mode: 'latest', start: 80, target: 72 };
    assert.strictEqual(engine.metricProgress(goal).pct, 0);
    engine.logValue('weight_kg', U.addDays(today, -1), 78, 'manual', 'set');
    engine.logValue('weight_kg', today, 76, 'manual', 'set');
    const p = engine.metricProgress(goal);
    assert.strictEqual(p.cur, 76);
    assert.strictEqual(p.pct, 50);

    goal.link = { metric: 'study_min', mode: 'total', start: 0, target: 600 };
    engine.logValue('study_min', today, 60, 'manual', 'add');
    engine.logValue('study_min', today, 90, 'manual', 'add');
    assert.strictEqual(engine.metricProgress(goal).pct, 25);

    goal.link = { metric: 'steps', mode: 'avg7', start: 4000, target: 10000 };
    engine.logValue('steps', today, 8000, 'manual', 'set');
    engine.logValue('steps', U.addDays(today, -1), 6000, 'manual', 'set');
    assert.strictEqual(engine.metricProgress(goal).cur, 7000);
    assert.strictEqual(engine.metricProgress(goal).pct, 50);
  });

  await test('levels and streaks', () => {
    assert.strictEqual(engine.levelFor(0), 1);
    assert.strictEqual(engine.levelFor(99), 1);
    assert.strictEqual(engine.levelFor(100), 2);
    assert.strictEqual(engine.levelFor(300), 3);
    const today = U.today();
    [0, 1, 2].forEach(n => { const q = engine.addCustomQuest('x', null, 15, U.addDays(today, -n)); engine.completeQuest(q.id); });
    const old = engine.addCustomQuest('x', null, 15, U.addDays(today, -5)); engine.completeQuest(old.id);
    assert.strictEqual(engine.player().streak, 3);
  });

  await test('CSV import: Google Fit daily export and a day-first weight log', () => {
    const fit = 'Date,Move Minutes count,Calories (kcal),Distance (m),Heart Points,Step count\n2026-11-10,42,2100.5,5300,12,7421\n2026-11-11,61,2300,8100,30,10233\n';
    const insp = connectors.csv.inspect(fit);
    const steps = insp.columns.find(c => c.header === 'Step count');
    assert.strictEqual(steps.metric, 'steps');
    assert.strictEqual(insp.columns.find(c => c.header === 'Distance (m)').metric, 'distance_km');
    const { points } = connectors.csv.toPoints(insp, insp.columns.filter(c => c.metric), 'dmy');
    connectors.ingest(points, 'csv');
    assert.strictEqual(engine.dayValue('steps', '2026-11-11'), 10233);
    assert.strictEqual(engine.dayValue('distance_km', '2026-11-10'), 5.3);

    const scale = 'Day;Weight (kg);Note\n03/11/2026;"78,4";morning\n04/11/2026;78.1;\nnot a date;1;\n';
    const i2 = connectors.csv.inspect(scale);
    assert.ok(i2.ambiguous);
    const r2 = connectors.csv.toPoints(i2, i2.columns.filter(c => c.metric), 'dmy');
    assert.strictEqual(r2.skipped, 1);
    connectors.ingest(r2.points, 'csv');
    assert.strictEqual(engine.dayValue('weight_kg', '2026-11-04'), 78.1);
    assert.strictEqual(connectors.csv.parseDate('03/11/2026', 'mdy'), '2026-03-11');
    assert.strictEqual(connectors.csv.parseDate('25/12/2026', 'mdy'), '2026-12-25');
  });

  await test('sample data connector fills 30 days and can be removed', async () => {
    const pts = await connectors.get('sample').sync({});
    assert.strictEqual(connectors.ingest(pts, 'sample').days, 90);
    assert.strictEqual(connectors.removeSource('sample'), 90);
    assert.strictEqual(engine.series('steps').length, 0);
  });

  await test('AI: no key uses the template; a failed call falls back with a notice', async () => {
    const input = { title: 'Learn guitar', category: 'upskilling', targetDate: U.addDays(U.today(), 60), days: 60, minutesPerDay: 30 };
    let r = await ai.planFor(input);
    assert.strictEqual(r.raw.source, 'template');
    assert.strictEqual(r.notice, '');
    store.updateSettings({ ai: { apiKey: 'sk-test', model: 'm' } });
    r = await ai.planFor(input);
    assert.strictEqual(r.raw.source, 'template');
    assert.ok(/built-in plan/.test(r.notice));
  });

  await test('AI: a good reply becomes a plan, with bad parts cleaned up', async () => {
    store.updateSettings({ ai: { apiKey: 'sk-test', model: 'm' } });
    const reply = { summary: 'Go step by step.', suggestedMetric: { key: 'study_min', mode: 'total', target: 3000 }, milestones: [
      { title: 'Basics', share: 40, quests: [
        { title: 'Practise chords for 15 minutes', minutes: 15, cadence: 'daily' },
        { title: 'Buy a tuner', minutes: 20, cadence: 'once' },
        { title: '', minutes: 5 },
        { title: 'Walk 9000 steps', minutes: 50, cadence: 'weekly', perWeek: 9, auto: { metric: 'steps', min: 9000 } },
        { title: 'Bad auto', minutes: 10, cadence: 'sometimes', auto: { metric: 'nope', min: 1 } }] },
      { title: 'Songs', share: 60, quests: [{ title: 'Learn one verse', minutes: 20, cadence: 'daily' }, { title: 'Record yourself', minutes: 10, cadence: 'weekly', perWeek: 1 }] }] };
    let sent = null;
    sandbox.fetch = async (url, opts) => { sent = { url, opts }; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Here you go:\n```json\n' + JSON.stringify(reply) + '\n```' }] }) }; };
    const r = await ai.planFor({ title: 'Learn guitar', category: 'upskilling', targetDate: '2027-01-11', days: 60, minutesPerDay: 30 });
    assert.strictEqual(r.raw.source, 'ai');
    assert.strictEqual(sent.opts.headers['x-api-key'], 'sk-test');
    assert.ok(JSON.parse(sent.opts.body).messages[0].content.includes('Learn guitar'));
    const plan = engine.normalizePlan(r.raw, 60);
    assert.strictEqual(plan.milestones.length, 2);
    assert.strictEqual(plan.milestones[0].quests.length, 4, 'empty quest dropped');
    assert.strictEqual(plan.milestones[0].quests[2].perWeek, 6);
    assert.strictEqual(JSON.stringify(plan.milestones[0].quests[2].auto), '{"metric":"steps","min":9000}');
    assert.strictEqual(plan.milestones[0].quests[3].cadence, 'daily');
    assert.strictEqual(plan.milestones[0].quests[3].auto, undefined);
    assert.strictEqual(plan.milestones[0].xp + plan.milestones[1].xp, plan.xpTarget);
    sandbox.fetch = async () => { throw new Error('offline'); };
  });

  await test('backup round trip keeps data, drops the API key, and tombstones deletes', () => {
    const goal = newGoal('travel', 'Trek in Ladakh');
    store.updateSettings({ ai: { apiKey: 'secret', model: 'm' } });
    const json = store.exportJSON();
    assert.ok(!json.includes('secret'));
    engine.deleteGoal(goal.id); store.commit();
    assert.strictEqual(store.all('goals').length, 0);
    assert.strictEqual(store.changesSince('').goals.length, 1, 'delete is kept as a tombstone for sync');
    store.importJSON(json);
    assert.strictEqual(store.all('goals')[0].title, 'Trek in Ladakh');
    assert.strictEqual(store.settings.ai.apiKey, 'secret', 'key on this device is kept');
    assert.throws(() => store.importJSON('{"hello":1}'));
  });

  console.log(process.exitCode ? '\nSome tests failed.' : '\nAll ' + passed + ' tests passed.');
})();
