# 🎬 Daily Editing-Job Pipeline → Notion

Once a day (06:00 UTC via GitHub Actions) this pipeline:

1. **Fetches** fresh video-editing / post-production roles from four job boards
   with free public APIs — Remotive, RemoteOK, WeWorkRemotely (RSS) and Jobicy.
2. **Scores** every listing 0–100 against your profile (`config.json → scoring`):
   title keywords, tool/skill mentions (Premiere, DaVinci, After Effects, …),
   salary transparency, remoteness, recency, minus negative keywords
   ("unpaid", "copy editor", …). Listings are tiered 🔥 Hot / 👍 Good / 🤷 Maybe.
3. **Dedupes & inserts** new listings into a Notion CRM database with
   Status = `New`, including *why* each job scored what it did (Notes column).
4. **Syncs agency outreach**: every agency in `agencies.json` gets a row in the
   outreach database; once you log `Last contacted` in Notion, the pipeline
   auto-schedules `Next follow-up` (+7 days by default) and checks
   `Due for follow-up` when the date arrives.

Zero npm dependencies — plain Node ≥ 18.

## One-time setup

1. **Create a Notion integration**: <https://www.notion.so/my-integrations> →
   *New integration* (internal), copy the secret.
2. **Share a parent page with it**: open the Notion page that should hold the
   databases → `⋯` → *Connections* → add your integration.
   (If the databases were already created for you, share *that* page instead
   and skip step 3.)
3. **Create the databases** (skips if you already have them):

   ```bash
   NOTION_API_KEY=secret_xxx NOTION_PARENT_PAGE_ID=<page-id> node job-pipeline/run.mjs --setup
   ```

   This prints `NOTION_JOBS_DB_ID` and `NOTION_OUTREACH_DB_ID`.
4. **Add GitHub Actions secrets** (repo → Settings → Secrets and variables →
   Actions): `NOTION_API_KEY`, `NOTION_JOBS_DB_ID`, `NOTION_OUTREACH_DB_ID`.
   (Alternatively commit the two IDs into `config.json → notion` — they are
   not secrets — and only add `NOTION_API_KEY`.)
5. **Fill `agencies.json`** with the agencies/studios you want to pitch.

Test locally or from the Actions tab (*Daily job pipeline → Run workflow*):

```bash
NOTION_API_KEY=... NOTION_JOBS_DB_ID=... NOTION_OUTREACH_DB_ID=... node job-pipeline/run.mjs
```

## Tuning

Everything lives in `config.json`:

- `search.queries` — what to search job boards for.
- `search.minScore` — listings below this never reach Notion (default 30).
- `search.maxNewJobsPerRun` — flood protection (default 40/day).
- `scoring.*` — keyword weights, bonuses, tier thresholds.
- `outreach.followUpDays` — follow-up cadence (default 7).
- `sources.*` — toggle individual job boards on/off.

## Workflow in Notion

- **Jobs**: filter the inbox by `Status = New`, skim 🔥/👍 tiers first, move
  anything you act on to `Applied` / `Interview` / … and junk to `Ignored`.
  The pipeline never touches rows after creating them.
- **Outreach**: when you email an agency, set `Status = Contacted` and
  `Last contacted = today`. The next run schedules the follow-up; a
  `Due for follow-up` checkbox view gives you a daily call sheet.
