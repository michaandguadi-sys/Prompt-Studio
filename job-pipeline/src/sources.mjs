import { fetchWithRetry, stripHtml, sha1 } from './util.mjs';

// Every fetcher returns a list of normalized jobs:
// { title, company, url, source, description, location, salary, postedAt, tags, dedupeKey }

function normalize(job) {
  return {
    ...job,
    description: stripHtml(job.description ?? ''),
    dedupeKey: sha1((job.url || `${job.source}:${job.title}@${job.company}`).toLowerCase()),
  };
}

async function fromRemotive(queries) {
  const jobs = [];
  for (const q of queries) {
    const res = await fetchWithRetry(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=50`);
    const data = await res.json();
    for (const j of data.jobs ?? []) {
      jobs.push(normalize({
        title: j.title,
        company: j.company_name,
        url: j.url,
        source: 'Remotive',
        description: j.description,
        location: j.candidate_required_location || 'Remote',
        salary: j.salary || '',
        postedAt: j.publication_date,
        tags: (j.tags ?? []).slice(0, 8),
      }));
    }
  }
  return jobs;
}

async function fromRemoteOK(queries) {
  const res = await fetchWithRetry('https://remoteok.com/api');
  const data = await res.json();
  const items = Array.isArray(data) ? data.filter((x) => x && x.id) : [];
  const needles = queries.map((q) => q.toLowerCase());
  return items
    .filter((j) => {
      const haystack = `${j.position ?? ''} ${(j.tags ?? []).join(' ')}`.toLowerCase();
      return needles.some((n) => haystack.includes(n)) || /(^|\W)(video|editor|editing)(\W|$)/.test(haystack);
    })
    .map((j) => normalize({
      title: j.position,
      company: j.company,
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      source: 'RemoteOK',
      description: j.description,
      location: j.location || 'Remote',
      salary: j.salary_min ? `$${j.salary_min}–$${j.salary_max ?? '?'} /yr` : '',
      postedAt: j.date,
      tags: (j.tags ?? []).slice(0, 8),
    }));
}

async function fromWeWorkRemotely(queries) {
  const res = await fetchWithRetry('https://weworkremotely.com/remote-jobs.rss');
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const needles = queries.map((q) => q.toLowerCase());
  const jobs = [];
  for (const item of items) {
    const pick = (tag) => {
      const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return m ? m[1].trim() : '';
    };
    const rawTitle = pick('title'); // "Company: Job Title"
    const [company, ...rest] = rawTitle.split(':');
    const title = rest.join(':').trim() || rawTitle;
    const description = pick('description');
    const haystack = `${rawTitle} ${description}`.toLowerCase();
    if (!needles.some((n) => haystack.includes(n))) continue;
    jobs.push(normalize({
      title,
      company: rest.length ? company.trim() : '',
      url: pick('link'),
      source: 'WeWorkRemotely',
      description,
      location: pick('region') || 'Remote',
      salary: '',
      postedAt: pick('pubDate'),
      tags: [],
    }));
  }
  return jobs;
}

async function fromJobicy(queries) {
  const jobs = [];
  for (const q of queries) {
    const res = await fetchWithRetry(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(q)}`);
    const data = await res.json();
    for (const j of data.jobs ?? []) {
      const salary = j.annualSalaryMin
        ? `${j.salaryCurrency ?? 'USD'} ${j.annualSalaryMin}–${j.annualSalaryMax ?? '?'} /yr`
        : '';
      jobs.push(normalize({
        title: j.jobTitle,
        company: j.companyName,
        url: j.url,
        source: 'Jobicy',
        description: j.jobExcerpt || j.jobDescription || '',
        location: j.jobGeo || 'Remote',
        salary,
        postedAt: j.pubDate,
        tags: [j.jobIndustry, j.jobType].flat().filter(Boolean).slice(0, 8),
      }));
    }
  }
  return jobs;
}

const FETCHERS = {
  remotive: fromRemotive,
  remoteok: fromRemoteOK,
  weworkremotely: fromWeWorkRemotely,
  jobicy: fromJobicy,
};

export async function fetchAllJobs(config) {
  const { queries } = config.search;
  const jobs = [];
  const errors = [];
  for (const [name, enabled] of Object.entries(config.sources)) {
    if (!enabled || !FETCHERS[name]) continue;
    try {
      const found = await FETCHERS[name](queries);
      console.log(`  ${name}: ${found.length} candidate listings`);
      jobs.push(...found);
    } catch (err) {
      errors.push({ source: name, error: String(err) });
      console.warn(`  ${name}: FAILED — ${err}`);
    }
  }
  // In-run dedupe (same job can appear under several queries/sources)
  const seen = new Set();
  const unique = jobs.filter((j) => !seen.has(j.dedupeKey) && seen.add(j.dedupeKey));
  return { jobs: unique, errors };
}
