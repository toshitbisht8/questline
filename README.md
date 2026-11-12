# Questline

Turn goals into daily side quests. Each goal is drawn as a line with a station per stage;
finishing side quests adds XP and moves you along it, and linked real data (steps, weight,
savings, study time...) shows whether the effort is paying off.

## Run it

- **Quickest:** double-click `index.html`. Everything works except installing the app and Google sign-in.
- **As a local app:** double-click `Start Questline.bat`. It serves the folder at
  `http://localhost:5173` and opens your browser. From there you can install it
  (install icon in the address bar) and it works offline.
- **On your phone:** the folder is a plain static site. Upload it to any static host
  (GitHub Pages, Netlify, Cloudflare Pages), open the https address on your phone and
  choose "Add to Home screen".

Data is stored in the browser you use, per address. `index.html` opened as a file,
`localhost:5173` and a hosted copy each keep their own data; use
Settings > Backup to move it between them.

## How it works

1. **Add a goal** (financial, upskilling, fitness, networking, health, material, travel, purpose, other).
2. **Get a plan**: 3-5 stages, each with small actions that are daily, a few times a week, or one-off.
   - With a Claude API key (Settings > AI goal breakdown) the plan is written for your situation.
   - Without a key, or if the call fails, a built-in plan for that area of life is used.
   - You can edit every stage and quest before saving, and later via "Edit plan".
3. **Today** hands out side quests from each goal's current stage: by default 2 per goal,
   up to 6 a day, and at least one per goal. "Not today" swaps one out. You can add your own.
4. **XP**: longer quests earn more (10-50 XP). XP fills the goal's line stage by stage and
   feeds your overall level and streak.
5. **Real data**: link one measure to a goal with a start and target. Quests such as
   "Walk 8,000 steps" tick themselves off when that day's data reaches the mark.

## Data sources

| Source | Status | Notes |
| --- | --- | --- |
| Manual logging | Ready | Any built-in measure, or your own. |
| CSV import | Ready | Any file with a date column. Recognises Google Fit's Takeout export ("Daily activity metrics.csv"), and common weight / nutrition column names. |
| Google Health API | Beta, not yet tested against a live account | See below. |
| Sample data | Ready | 30 made-up days for trying things out. |

### Google health data from a web app

Health Connect stores data on the Android phone and has no web access, and the old
Google Fit REST API is closed to new projects and is being shut down. The route open to
a web app is the **Google Health API** (cloud data from Fitbit and Pixel Watch accounts):

1. In Google Cloud Console create a project and enable "Google Health API".
2. Configure the OAuth consent screen in **Testing** mode and add your own Google account as a test user.
   (All Health scopes are "restricted"; publishing to other people needs Google's review.)
3. Create an OAuth client ID of type "Web application" and add `http://localhost:5173`
   (and your hosted address, if any) under Authorised JavaScript origins.
4. Paste the client ID into Data > Google Health and press "Sign in and sync 30 days".

It reads steps, weight and body fat. It was written from Google's published reference and
could not be tried against a real account, so expect to adjust `js/connectors.js` if a
field name differs. If your data lives only in Health Connect (for example from Samsung
Health), use a CSV export for now; reading Health Connect directly needs a small Android
companion app, which is a sensible next step.

### Adding a connector

`js/connectors.js` starts with a short template: register an object with `id`, `name`,
`available()` and an async `sync()` that returns `{ metric, date, value }` rows. Give it a
card with a Sync button in `viewData()` in `js/views.js`.

## Adding cloud sync later

`js/store.js` is the only file that touches storage. Every record carries `id`,
`createdAt`, `updatedAt` and `deletedAt` (deletes are tombstones), there is a `deviceId`,
and `QL.store.changesSince(timestamp)` returns what a sync client would upload. Swap
`QL.store.adapter` or push those changes to a backend and merge by `updatedAt`.

## Files

```
index.html            page shell
css/app.css           all styling
js/util.js            dates, ids, formatting
js/store.js           storage, backup, sync hooks
js/catalog.js         goal areas and built-in measures
js/templates.js       built-in plans per goal area
js/engine.js          plans, XP, levels, daily assignment, data progress
js/ai.js              Claude API call with template fallback
js/connectors.js      CSV, Google Health, sample data
js/views.js           screens
js/modals.js          dialogs
js/app.js             navigation and actions
sw.js, manifest.webmanifest, icons/   install and offline support
tests/engine.test.js  logic tests: node tests/engine.test.js
```

After editing app files, bump `VERSION` in `sw.js` so installed copies refresh.
The API key is kept in this browser's storage only and is left out of backups.
