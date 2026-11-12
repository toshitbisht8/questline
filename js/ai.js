/* Questline — AI goal breakdown.

   Calls the Claude API straight from the browser with the key saved in Settings.
   The key stays on this device (it is left out of backups). If there is no key,
   or the call fails for any reason, planFor() falls back to the built-in templates
   and says so, so adding a goal never gets stuck. */
(function (g) {
  const QL = (g.QL = g.QL || {});
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';

  function metricList() {
    return QL.catalog.metrics.map(m => m.key + ' (' + m.name + ', ' + (m.unit === 'CUR' ? 'money' : m.unit) + ' per day)').join('; ');
  }

  function buildPrompt(input) {
    return [
      'Break this personal goal into a staged plan of small actions that can be done as daily side quests.',
      '',
      'Goal: ' + input.title,
      'Area of life: ' + QL.catalog.category(input.category).name,
      input.why ? 'Why it matters: ' + input.why : '',
      input.context ? 'Current situation: ' + input.context : '',
      'Target date: ' + input.targetDate + ' (about ' + input.days + ' days from now)',
      'Time available per day: about ' + input.minutesPerDay + ' minutes',
      '',
      'Rules:',
      '- 3 to 5 milestones in order, each a real stage of progress with a short concrete title.',
      '- Each milestone has 4 to 6 quests. A quest is one specific action a person can finish in one sitting, starting with a verb, with a number in it where that makes sense. No vague advice.',
      '- Mix cadences: "once" for one-off steps that move the goal forward (list them in the order they should be done), "daily" for core habits, "weekly" with perWeek 1-5 for the rest.',
      '- minutes is a realistic time for the quest and should fit the time available.',
      '- share is the milestone\'s portion of the whole effort; shares add up to 100.',
      '- If a quest is fully decided by one daily number from this list, add auto with that metric key and the minimum that counts as done; otherwise auto is null. Metrics: ' + metricList(),
      '- suggestedMetric: the single metric from that list that best shows real-world progress on this goal, or null. mode is "latest" for a level you watch (weight, a balance), "total" for something you accumulate, "avg7" for a daily average.',
      '',
      'Reply with JSON only, no other text, in exactly this shape:',
      '{"summary":"one or two sentences on the approach","milestones":[{"title":"","note":"what reaching this stage means","share":25,"quests":[{"title":"","minutes":15,"cadence":"daily","perWeek":null,"auto":null}]}],"suggestedMetric":{"key":"","mode":"latest","target":0}}'
    ].filter(l => l !== '').join('\n');
  }

  function extractJSON(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('The AI reply was not in the expected format.');
    return JSON.parse(text.slice(a, b + 1));
  }

  async function call(body) {
    const st = QL.store.settings.ai;
    let res;
    try {
      res = await g.fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': st.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(Object.assign({ model: st.model || 'claude-sonnet-5-5' }, body))
      });
    } catch (e) {
      throw new Error('Could not reach the AI service. Check your internet connection.');
    }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j && j.error && j.error.message ? j.error.message : ''; } catch (e) { /* ignore */ }
      if (res.status === 401) throw new Error('The API key was rejected. Check it in Settings.');
      if (res.status === 404) throw new Error('The model name in Settings was not found.');
      if (res.status === 429) throw new Error('The AI service is rate-limiting this key. Try again in a minute.');
      throw new Error('The AI service returned an error (' + res.status + ')' + (detail ? ': ' + detail : '.'));
    }
    const data = await res.json();
    const part = (data.content || []).find(c => c.type === 'text');
    if (!part) throw new Error('The AI reply was empty.');
    return part.text;
  }

  const ai = {
    hasKey() { return !!(QL.store.settings.ai.apiKey || '').trim(); },

    async generate(input) {
      const text = await call({
        max_tokens: 3500,
        system: 'You are a practical coach who turns goals into small, concrete daily actions. You reply with valid JSON only.',
        messages: [{ role: 'user', content: buildPrompt(input) }]
      });
      const raw = extractJSON(text);
      raw.source = 'ai';
      // Reject thin plans so the caller falls back to a template.
      const ok = Array.isArray(raw.milestones) && raw.milestones.length >= 2 &&
        raw.milestones.every(m => m && m.title && Array.isArray(m.quests) && m.quests.filter(q => q && q.title).length >= 2);
      if (!ok) throw new Error('The AI plan was incomplete.');
      return raw;
    },

    /* Always resolves with a raw plan; `notice` explains a fallback. */
    async planFor(input) {
      const template = () => QL.templates.plan(input.category, input.title);
      if (!ai.hasKey()) return { raw: template(), notice: '' };
      try {
        return { raw: await ai.generate(input), notice: '' };
      } catch (e) {
        return { raw: template(), notice: e.message + ' Showing the built-in plan instead.' };
      }
    },

    async test() {
      await call({ max_tokens: 5, messages: [{ role: 'user', content: 'Reply with OK' }] });
      return true;
    }
  };

  QL.ai = ai;
})(typeof window !== 'undefined' ? window : globalThis);
