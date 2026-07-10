import { daysAgo } from './util.mjs';

// Scores a normalized job 0–100 against the profile in config.scoring.
// Returns { score, tier, reasons } — reasons end up in the Notion "Notes"
// property so you can see *why* something ranked where it did.
export function scoreJob(job, scoring) {
  const title = (job.title ?? '').toLowerCase();
  const description = (job.description ?? '').toLowerCase();
  const full = `${title} ${description}`;
  let score = 0;
  const reasons = [];

  let bestTitle = 0;
  for (const [kw, pts] of Object.entries(scoring.titleKeywords)) {
    if (title.includes(kw) && pts > bestTitle) bestTitle = pts;
  }
  if (bestTitle) {
    score += bestTitle;
    reasons.push(`title match +${bestTitle}`);
  }

  let descPts = 0;
  const hits = [];
  for (const [kw, pts] of Object.entries(scoring.descriptionKeywords)) {
    if (full.includes(kw)) {
      descPts += pts;
      hits.push(kw);
    }
  }
  descPts = Math.min(descPts, scoring.descriptionKeywordsCap);
  if (descPts) {
    score += descPts;
    reasons.push(`skills (${hits.join(', ')}) +${descPts}`);
  }

  for (const [kw, pts] of Object.entries(scoring.negativeKeywords)) {
    if (full.includes(kw)) {
      score += pts;
      reasons.push(`"${kw}" ${pts}`);
    }
  }

  if (job.salary) {
    score += scoring.salaryPresentBonus;
    reasons.push(`salary listed +${scoring.salaryPresentBonus}`);
  }

  const loc = (job.location ?? '').toLowerCase();
  if (loc.includes('remote') || loc.includes('anywhere') || loc.includes('worldwide') || loc === '') {
    score += scoring.remoteBonus;
    reasons.push(`remote +${scoring.remoteBonus}`);
  }

  const age = daysAgo(job.postedAt);
  if (age <= 2) {
    score += scoring.recency.within2Days;
    reasons.push(`fresh (<2d) +${scoring.recency.within2Days}`);
  } else if (age <= 7) {
    score += scoring.recency.within7Days;
    reasons.push(`recent (<7d) +${scoring.recency.within7Days}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier = null;
  if (score >= scoring.tiers.hot) tier = '🔥 Hot';
  else if (score >= scoring.tiers.good) tier = '👍 Good';
  else if (score >= scoring.tiers.maybe) tier = '🤷 Maybe';

  return { score, tier, reasons };
}
