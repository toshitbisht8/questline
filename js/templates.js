/* Questline — built-in plans, used when no AI key is set or the AI call fails.

   Each category has four stages. Each quest is "title | minutes | cadence | auto":
     cadence  d = every day, w3 = three times a week, o = one-off step
     auto     optional, e.g. steps>=8000 — the quest ticks itself off when that day's data reaches it
   {goal} is replaced with the goal's title. */
(function (g) {
  const QL = (g.QL = g.QL || {});

  const T = {
    financial: [
      ['Know your numbers', [
        'List every account, debt and monthly bill in one place|30|o',
        'Write the exact amount and date you need for: {goal}|15|o',
        'Log everything you spent today|5|d',
        'Check your balances and note the total|5|w2',
        'Read one article on a money topic you are unsure about|15|w2']],
      ['Build the system', [
        'Set up an automatic transfer for the day your income arrives|20|o',
        'Cancel or downgrade one subscription you barely use|15|o',
        'Log everything you spent today|5|d',
        'Have a no-spend day|5|w2',
        'Compare this week\'s spending with your budget|20|w1']],
      ['Widen the gap', [
        'Write down one way to raise your income and its first step|30|o',
        'Get a better quote on one recurring bill|25|o',
        'Log everything you spent today|5|d',
        'Move any spare cash towards {goal}|5|w1',
        'Spend 15 minutes learning about one investment option|15|w2']],
      ['Lock it in', [
        'Review progress on {goal} and adjust the monthly amount|30|o',
        'Log everything you spent today|5|d',
        'Update your net-worth figure|10|w1',
        'Plan next week\'s larger expenses|15|w1']]
    ],
    upskilling: [
      ['Set the course', [
        'Pick one course, book or syllabus to follow for: {goal}|30|o',
        'Block a fixed daily study slot in your calendar|10|o',
        'Study for 25 focused minutes|25|d',
        'Write three lines on what you learned today|5|d',
        'Find one person already doing this and note how they got there|20|o']],
      ['Build fundamentals', [
        'Choose a small practice project and write its outline|30|o',
        'Study for 25 focused minutes|25|d',
        'Do one hands-on exercise without looking at the answer|30|w4',
        'Explain one concept out loud or in a short note|10|w3',
        'Review last week\'s notes|15|w1']],
      ['Make something real', [
        'Finish the first working version of your practice project|60|o',
        'Work on your project for 30 minutes|30|d',
        'Ask one person for feedback on your work|15|w1',
        'Fix one thing the feedback pointed out|30|w2',
        'Study one advanced topic for 25 minutes|25|w3']],
      ['Prove it', [
        'Publish or present your project somewhere others can see it|45|o',
        'Update your CV or profile with the new skill|30|o',
        'Practise under real conditions (mock test, timed task, live demo)|45|w2',
        'Study for 25 focused minutes|25|d',
        'Teach one idea to someone else|20|w1']]
    ],
    fitness: [
      ['Start moving', [
        'Record your starting point: weight, a photo, one test (push-ups or a timed walk)|20|o',
        'Plan this week\'s workout days and put them in your calendar|10|o',
        'Walk 6,000 steps|40|d|steps>=6000',
        'Do a 15-minute workout|15|w3|workout_min>=15',
        'Stretch for 5 minutes before bed|5|w4']],
      ['Build the habit', [
        'Write a simple weekly routine you can repeat|20|o',
        'Walk 8,000 steps|50|d|steps>=8000',
        'Do a 30-minute workout|30|w3|workout_min>=30',
        'Eat a palm-sized serving of protein at every meal today|5|w5',
        'Sleep at least 7 hours|5|w5|sleep_h>=7']],
      ['Push the load', [
        'Add weight, reps or distance to your routine and note the new numbers|20|o',
        'Walk 10,000 steps|60|d|steps>=10000',
        'Do a 40-minute workout|40|w4|workout_min>=40',
        'Log your weight this morning|2|w2',
        'Do 10 minutes of mobility work|10|w3']],
      ['Hold the standard', [
        'Repeat your starting test and compare the result|20|o',
        'Walk 10,000 steps|60|d|steps>=10000',
        'Do a 45-minute workout|45|w4|workout_min>=45',
        'Plan next week\'s training|10|w1',
        'Take one full rest day and get 8 hours of sleep|5|w1']]
    ],
    networking: [
      ['Map your circle', [
        'List 20 people you already know who relate to: {goal}|25|o',
        'Refresh your LinkedIn or public profile|30|o',
        'Send one message to someone you have not spoken to in a while|10|d',
        'Leave a thoughtful comment on one post in your field|5|w4',
        'Note one useful thing about a person you spoke with today|5|w3']],
      ['Reach out', [
        'List 10 people you would like to know and why|25|o',
        'Send one introduction or outreach message|10|d',
        'Have one 20-minute conversation with someone in your field|20|w1',
        'Follow up on a conversation from last week|10|w2',
        'Share one useful link or idea with a contact|5|w3']],
      ['Show up', [
        'Sign up for one event, meetup or community|20|o',
        'Send one introduction or outreach message|10|d',
        'Post one thing you learned or built|20|w1',
        'Introduce two people who should know each other|10|w1',
        'Have one 20-minute conversation with someone new|20|w1']],
      ['Give back', [
        'Offer help to one person without being asked|15|w2',
        'Ask one person to be a mentor, or mentor someone yourself|20|o',
        'Send one message to keep a relationship warm|10|d',
        'Review who you met this month and plan follow-ups|20|w1']]
    ],
    health: [
      ['Take stock', [
        'Book the check-up or test you have been putting off|15|o',
        'Write down your current sleep, food and stress patterns|20|o',
        'Drink 2 litres of water|5|d|water_l>=2',
        'Be in bed by your target time|5|d',
        'Take a 10-minute walk outside|10|w4']],
      ['Fix the basics', [
        'Set a fixed wake-up time and an alarm for bedtime|10|o',
        'Sleep at least 7 hours|5|d|sleep_h>=7',
        'Eat two servings of vegetables or fruit|10|d',
        'Spend 5 minutes on slow breathing or meditation|5|w5|meditation_min>=5',
        'Have a screen-free last half hour before bed|30|w4']],
      ['Strengthen', [
        'Plan and shop for three healthy meals this week|40|o',
        'Sleep at least 7 hours|5|d|sleep_h>=7',
        'Cook one meal from whole ingredients|40|w3',
        'Move for 20 minutes|20|w4|workout_min>=20',
        'Spend 10 minutes on meditation or journalling|10|w4']],
      ['Sustain', [
        'Review what improved and what still needs work for: {goal}|20|o',
        'Sleep at least 7 hours|5|d|sleep_h>=7',
        'Keep to your eating plan for the whole day|5|w5',
        'Schedule your next check-up|10|o',
        'Do one thing purely to unwind|20|w2']]
    ],
    material: [
      ['Define it', [
        'Write exactly what you want and what it costs: {goal}|20|o',
        'Research three options and note the price of each|40|o',
        'Set the monthly amount you need to put aside|15|o',
        'Put something into your purchase fund today|5|w3',
        'Skip one impulse buy and move that money to the fund|5|w3']],
      ['Fund it', [
        'Set up an automatic transfer into the fund|15|o',
        'List three things you could sell and post one of them|30|o',
        'Skip one impulse buy and move that money to the fund|5|d',
        'Check the fund balance and log it|5|w1',
        'Track the price of your chosen option|5|w2']],
      ['Prepare', [
        'Check the paperwork, loans or approvals you will need|40|o',
        'Talk to one person who already owns it|20|o',
        'Skip one impulse buy and move that money to the fund|5|d',
        'Compare one more seller or deal|20|w2',
        'Check the fund balance and log it|5|w1']],
      ['Close', [
        'Negotiate or look for a discount before buying|30|o',
        'Make the purchase or pay the deposit|45|o',
        'Put something into your purchase fund today|5|d',
        'Double-check running costs: insurance, upkeep, tax|20|o']]
    ],
    travel: [
      ['Choose', [
        'Pick the destination and rough dates for: {goal}|30|o',
        'Set a total budget and a savings amount per month|20|o',
        'Read or watch one thing about the place|15|w4',
        'Put money into the trip fund|5|w2',
        'Explore one new spot near home|45|w1']],
      ['Plan', [
        'Check visa, permit and passport requirements|25|o',
        'Draft a day-by-day outline|40|o',
        'Read or watch one thing about the place|15|w3',
        'Learn five phrases of the local language|10|w4',
        'Put money into the trip fund|5|w2']],
      ['Book', [
        'Book transport|40|o',
        'Book the first nights of accommodation|30|o',
        'Get fit for the trip: walk 8,000 steps|50|w4|steps>=8000',
        'Learn five phrases of the local language|10|w4',
        'Add one place to your must-see list|10|w3']],
      ['Go', [
        'Write your packing list and buy what is missing|30|o',
        'Sort insurance, money and phone access|30|o',
        'Share your itinerary with someone at home|10|o',
        'Explore one new spot near home|45|w1',
        'Write a few lines or save photos from today|10|w3']]
    ],
    purpose: [
      ['Listen', [
        'Write for 15 minutes on why this matters to you: {goal}|15|o',
        'List the five moments you felt most useful or alive|20|o',
        'Spend 10 quiet minutes without your phone|10|d',
        'Write three lines in a journal|5|d',
        'Talk to one person whose life looks meaningful to you|30|w1']],
      ['Try', [
        'Choose one small experiment to run for two weeks|20|o',
        'Spend 20 minutes on your experiment|20|d',
        'Write three lines in a journal|5|w5',
        'Do one thing for someone else with no return|15|w2',
        'Meditate or pray for 10 minutes|10|w4|meditation_min>=10']],
      ['Commit', [
        'Decide what to keep from your experiment and what to drop|20|o',
        'Tell one person what you are committing to|10|o',
        'Spend 30 minutes on the work that matters|30|d',
        'Volunteer or contribute for an hour|60|w1',
        'Write three lines in a journal|5|w4']],
      ['Live it', [
        'Write a one-paragraph personal mission statement|30|o',
        'Spend 30 minutes on the work that matters|30|d',
        'Say no to one thing that does not fit|5|w1',
        'Review the week against what you said matters|15|w1']]
    ],
    other: [
      ['Define', [
        'Write what "done" looks like for: {goal}|15|o',
        'List every step you can think of, then circle the first three|25|o',
        'Spend 15 minutes on {goal}|15|d',
        'Note one thing that got in the way today|5|w3']],
      ['Start', [
        'Finish the first circled step|40|o',
        'Spend 25 minutes on {goal}|25|d',
        'Ask one person for advice|15|w1',
        'Tidy up your notes and next steps|10|w2']],
      ['Build', [
        'Reach the halfway mark and write down what is left|30|o',
        'Spend 30 minutes on {goal}|30|d',
        'Remove one obstacle that keeps slowing you down|20|w1',
        'Review progress and plan the week|15|w1']],
      ['Finish', [
        'List the last loose ends|15|o',
        'Spend 30 minutes on {goal}|30|d',
        'Close one loose end|20|w3',
        'Decide how you will mark finishing this|10|o']]
    ]
  };

  function parseQuest(str, goalTitle) {
    const p = str.split('|');
    const q = { title: p[0].replace(/\{goal\}/g, goalTitle), minutes: Number(p[1]) || 15 };
    const c = p[2] || 'd';
    if (c === 'o') q.cadence = 'once';
    else if (c === 'd') q.cadence = 'daily';
    else { q.cadence = 'weekly'; q.perWeek = Number(c.slice(1)) || 2; }
    if (p[3]) {
      const m = p[3].match(/^([a-z_]+)>=([\d.]+)$/);
      if (m) q.auto = { metric: m[1], min: Number(m[2]) };
    }
    return q;
  }

  QL.templates = {
    /* Returns a raw plan in the same shape the AI is asked for. */
    plan(category, goalTitle) {
      const stages = T[category] || T.other;
      const shares = [15, 25, 30, 30];
      return {
        source: 'template',
        summary: 'A four-stage starter plan. Edit any step so it fits you.',
        milestones: stages.map((s, i) => ({
          title: s[0], share: shares[i],
          quests: s[1].map(q => parseQuest(q, goalTitle))
        }))
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
