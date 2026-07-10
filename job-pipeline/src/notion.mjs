const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function notionRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after') ?? 2) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return notionRequest(path, { method, body });
  }
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion ${method} ${path} → ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  return data;
}

export async function queryAllPages(databaseId, { filter } = {}) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;
    const data = await notionRequest(`/databases/${databaseId}/query`, { method: 'POST', body });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

export function createPage(databaseId, properties) {
  return notionRequest('/pages', {
    method: 'POST',
    body: { parent: { database_id: databaseId }, properties },
  });
}

export function updatePage(pageId, properties) {
  return notionRequest(`/pages/${pageId}`, { method: 'PATCH', body: { properties } });
}

// Property-value helpers (Notion's REST payloads are verbose)
export const prop = {
  title: (text) => ({ title: [{ text: { content: String(text).slice(0, 200) } }] }),
  richText: (text) => ({ rich_text: text ? [{ text: { content: String(text).slice(0, 1990) } }] : [] }),
  url: (u) => ({ url: u || null }),
  email: (e) => ({ email: e || null }),
  number: (n) => ({ number: typeof n === 'number' ? n : null }),
  select: (name) => (name ? { select: { name } } : { select: null }),
  multiSelect: (names) => ({
    multi_select: (names ?? []).filter(Boolean).map((n) => ({ name: String(n).replaceAll(',', ' ').slice(0, 90) })),
  }),
  date: (iso) => ({ date: iso ? { start: iso } : null }),
  checkbox: (v) => ({ checkbox: Boolean(v) }),
};

// Plain-value extractors for reading pages back
export const read = {
  title: (page, name) => page.properties[name]?.title?.map((t) => t.plain_text).join('') ?? '',
  richText: (page, name) => page.properties[name]?.rich_text?.map((t) => t.plain_text).join('') ?? '',
  select: (page, name) => page.properties[name]?.select?.name ?? null,
  date: (page, name) => page.properties[name]?.date?.start ?? null,
  checkbox: (page, name) => page.properties[name]?.checkbox ?? false,
};

// --- one-time setup: create both databases under a parent page ---

export async function createJobsDatabase(parentPageId) {
  return notionRequest('/databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: parentPageId },
      icon: { type: 'emoji', emoji: '🎬' },
      title: [{ text: { content: '🎬 Editing Jobs — Inbox' } }],
      properties: {
        Name: { title: {} },
        Company: { rich_text: {} },
        URL: { url: {} },
        Source: { select: { options: ['Remotive', 'RemoteOK', 'WeWorkRemotely', 'Jobicy'].map((name) => ({ name })) } },
        Score: { number: {} },
        Tier: {
          select: {
            options: [
              { name: '🔥 Hot', color: 'red' },
              { name: '👍 Good', color: 'green' },
              { name: '🤷 Maybe', color: 'yellow' },
            ],
          },
        },
        Status: {
          select: {
            options: [
              { name: 'New', color: 'blue' },
              { name: 'Reviewing', color: 'yellow' },
              { name: 'Applied', color: 'orange' },
              { name: 'Interview', color: 'purple' },
              { name: 'Offer', color: 'green' },
              { name: 'Rejected', color: 'red' },
              { name: 'Ignored', color: 'gray' },
            ],
          },
        },
        Location: { rich_text: {} },
        Salary: { rich_text: {} },
        Posted: { date: {} },
        Added: { date: {} },
        Tags: { multi_select: {} },
        Notes: { rich_text: {} },
        'Dedupe Key': { rich_text: {} },
      },
    },
  });
}

export async function createOutreachDatabase(parentPageId) {
  return notionRequest('/databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: parentPageId },
      icon: { type: 'emoji', emoji: '🤝' },
      title: [{ text: { content: '🤝 Agency Outreach' } }],
      properties: {
        Name: { title: {} },
        Website: { url: {} },
        Email: { email: {} },
        Niche: { multi_select: {} },
        Status: {
          select: {
            options: [
              { name: 'Not contacted', color: 'gray' },
              { name: 'Contacted', color: 'blue' },
              { name: 'Replied', color: 'yellow' },
              { name: 'In conversation', color: 'orange' },
              { name: 'Client', color: 'green' },
              { name: 'Dead', color: 'red' },
            ],
          },
        },
        'Last contacted': { date: {} },
        'Next follow-up': { date: {} },
        'Due for follow-up': { checkbox: {} },
        Notes: { rich_text: {} },
      },
    },
  });
}
