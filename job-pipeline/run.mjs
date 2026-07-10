#!/usr/bin/env node
// Daily editing-job pipeline → Notion.
//   node job-pipeline/run.mjs           run the daily sync (jobs + outreach)
//   node job-pipeline/run.mjs --setup   create both Notion databases under
//                                       NOTION_PARENT_PAGE_ID and print their IDs
//
// Required env: NOTION_API_KEY
// Database IDs come from NOTION_JOBS_DB_ID / NOTION_OUTREACH_DB_ID env vars,
// falling back to job-pipeline/config.json → notion.*.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllJobs } from './src/sources.mjs';
import { scoreJob } from './src/score.mjs';
import { syncOutreach } from './src/outreach.mjs';
import {
  queryAllPages, createPage, prop, read,
  createJobsDatabase, createOutreachDatabase,
} from './src/notion.mjs';
import { isoDate, truncate } from './src/util.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const agencies = JSON.parse(readFileSync(join(here, 'agencies.json'), 'utf8'));

if (!process.env.NOTION_API_KEY) {
  console.error('NOTION_API_KEY is not set. Create an internal integration at https://www.notion.so/my-integrations');
  process.exit(1);
}

if (process.argv.includes('--setup')) {
  await setup();
} else {
  await run();
}

async function setup() {
  const parent = process.env.NOTION_PARENT_PAGE_ID;
  if (!parent) {
    console.error('NOTION_PARENT_PAGE_ID is not set. Point it at the Notion page that should hold the databases (and share that page with your integration).');
    process.exit(1);
  }
  const jobsDb = await createJobsDatabase(parent);
  const outreachDb = await createOutreachDatabase(parent);
  console.log('Databases created. Save these IDs (env vars or config.json → notion.*):');
  console.log(`  NOTION_JOBS_DB_ID=${jobsDb.id}`);
  console.log(`  NOTION_OUTREACH_DB_ID=${outreachDb.id}`);
}

async function run() {
  const jobsDbId = process.env.NOTION_JOBS_DB_ID || config.notion.jobsDatabaseId;
  const outreachDbId = process.env.NOTION_OUTREACH_DB_ID || config.notion.outreachDatabaseId;
  if (!jobsDbId || !outreachDbId) {
    console.error('Missing database IDs. Run `node job-pipeline/run.mjs --setup` first, then set NOTION_JOBS_DB_ID / NOTION_OUTREACH_DB_ID (or fill config.json).');
    process.exit(1);
  }

  console.log('── Fetching job boards…');
  const { jobs, errors } = await fetchAllJobs(config);
  console.log(`  ${jobs.length} unique listings fetched`);

  console.log('── Scoring…');
  const scored = jobs
    .map((job) => ({ job, ...scoreJob(job, config.scoring) }))
    .filter(({ score }) => score >= config.search.minScore)
    .sort((a, b) => b.score - a.score);
  console.log(`  ${scored.length} listings ≥ min score ${config.search.minScore}`);

  console.log('── Deduping against Notion…');
  const existing = await queryAllPages(jobsDbId);
  const known = new Set(existing.map((p) => read.richText(p, 'Dedupe Key')).filter(Boolean));
  const fresh = scored.filter(({ job }) => !known.has(job.dedupeKey)).slice(0, config.search.maxNewJobsPerRun);
  console.log(`  ${fresh.length} new listings to add (cap ${config.search.maxNewJobsPerRun})`);

  let added = 0;
  for (const { job, score, tier, reasons } of fresh) {
    await createPage(jobsDbId, {
      Name: prop.title(job.company ? `${job.title} — ${job.company}` : job.title),
      Company: prop.richText(job.company),
      URL: prop.url(job.url),
      Source: prop.select(job.source),
      Score: prop.number(score),
      Tier: prop.select(tier),
      Status: prop.select('New'),
      Location: prop.richText(job.location),
      Salary: prop.richText(job.salary),
      Posted: prop.date(isoDate(job.postedAt)),
      Added: prop.date(isoDate()),
      Tags: prop.multiSelect(job.tags),
      Notes: prop.richText(truncate(reasons.join(' · '), 500)),
      'Dedupe Key': prop.richText(job.dedupeKey),
    });
    added++;
  }

  console.log('── Syncing agency outreach…');
  const outreach = await syncOutreach(outreachDbId, agencies, config.outreach);

  console.log('── Done');
  console.log(`  Jobs added:            ${added}`);
  console.log(`  Agencies created:      ${outreach.created}`);
  console.log(`  Follow-ups scheduled:  ${outreach.scheduled}`);
  console.log(`  Follow-ups due today:  ${outreach.dueFlagged}`);
  if (errors.length) {
    console.log(`  Source errors:         ${errors.map((e) => e.source).join(', ')} (non-fatal)`);
  }
}
