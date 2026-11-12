/* Questline — goal categories and the built-in list of things you can measure. */
(function (g) {
  const QL = (g.QL = g.QL || {});

  /* Each category is drawn as its own coloured "line". Icons are 24px stroke paths. */
  const categories = [
    { id: 'financial', name: 'Financial', color: '#0B7F56', hint: 'Save, invest, clear debt, earn more',
      icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>' },
    { id: 'upskilling', name: 'Upskilling', color: '#1F5FE0', hint: 'Learn a skill, earn a certificate, switch careers',
      icon: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>' },
    { id: 'fitness', name: 'Fitness', color: '#D9481C', hint: 'Strength, endurance, body composition',
      icon: '<path d="M6 5v14M18 5v14M3 8v8M21 8v8M6 12h12"/>' },
    { id: 'networking', name: 'Networking', color: '#7A3BE0', hint: 'Meet people, build relationships, find mentors',
      icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { id: 'health', name: 'Health', color: '#0A8794', hint: 'Sleep, nutrition, mental health, check-ups',
      icon: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>' },
    { id: 'material', name: 'Material', color: '#A45A00', hint: 'A home, a vehicle, gear you are saving for',
      icon: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>' },
    { id: 'travel', name: 'Travel and exploration', color: '#C81E6E', hint: 'Trips, treks, new places and experiences',
      icon: '<circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z"/>' },
    { id: 'purpose', name: 'Purpose', color: '#3B3A9A', hint: 'Meaning, contribution, creative and spiritual work',
      icon: '<path d="M4 22V4"/><path d="M4 4h13l-2.5 4L17 12H4"/>' },
    { id: 'other', name: 'Something else', color: '#4C5A75', hint: 'Anything that does not fit above',
      icon: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>' }
  ];

  /* agg: how several readings on one day combine ("sum" adds up, "last" keeps the newest).
     Units of "CUR" are shown in the currency chosen in Settings. */
  const metrics = [
    { key: 'steps', name: 'Steps', unit: 'steps', agg: 'sum', category: 'fitness' },
    { key: 'workout_min', name: 'Workout time', unit: 'min', agg: 'sum', category: 'fitness' },
    { key: 'distance_km', name: 'Distance covered', unit: 'km', agg: 'sum', category: 'fitness' },
    { key: 'weight_kg', name: 'Body weight', unit: 'kg', agg: 'last', category: 'fitness' },
    { key: 'body_fat', name: 'Body fat', unit: '%', agg: 'last', category: 'fitness' },
    { key: 'calories', name: 'Calories eaten', unit: 'kcal', agg: 'sum', category: 'health' },
    { key: 'protein_g', name: 'Protein', unit: 'g', agg: 'sum', category: 'health' },
    { key: 'sleep_h', name: 'Sleep', unit: 'h', agg: 'sum', category: 'health' },
    { key: 'water_l', name: 'Water', unit: 'L', agg: 'sum', category: 'health' },
    { key: 'meditation_min', name: 'Meditation', unit: 'min', agg: 'sum', category: 'purpose' },
    { key: 'savings', name: 'Savings balance', unit: 'CUR', agg: 'last', category: 'financial' },
    { key: 'invested', name: 'Invested amount', unit: 'CUR', agg: 'last', category: 'financial' },
    { key: 'debt', name: 'Debt remaining', unit: 'CUR', agg: 'last', category: 'financial' },
    { key: 'fund', name: 'Purchase fund', unit: 'CUR', agg: 'last', category: 'material' },
    { key: 'study_min', name: 'Study time', unit: 'min', agg: 'sum', category: 'upskilling' },
    { key: 'pages', name: 'Pages read', unit: 'pages', agg: 'sum', category: 'upskilling' },
    { key: 'outreach', name: 'People contacted', unit: 'people', agg: 'sum', category: 'networking' },
    { key: 'places', name: 'New places visited', unit: 'places', agg: 'sum', category: 'travel' }
  ];

  const suggestedMetric = {
    financial: 'savings', upskilling: 'study_min', fitness: 'weight_kg', networking: 'outreach',
    health: 'sleep_h', material: 'fund', travel: 'places', purpose: 'meditation_min', other: ''
  };

  QL.catalog = {
    categories, metrics, suggestedMetric,
    category(id) { return categories.find(c => c.id === id) || categories[categories.length - 1]; },
    metricDef(key) { return metrics.find(m => m.key === key) || null; },
    icon(catId, size) {
      const c = QL.catalog.category(catId);
      const s = size || 20;
      return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + c.icon + '</svg>';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
