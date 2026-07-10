import { queryAllPages, createPage, updatePage, prop, read } from './notion.mjs';
import { isoDate } from './util.mjs';

// Statuses where a follow-up cadence applies. "Not contacted" agencies are
// waiting on *you*, and Client/Dead need no automated nudge.
const FOLLOW_UP_STATUSES = new Set(['Contacted', 'Replied', 'In conversation']);

export async function syncOutreach(databaseId, agencies, { followUpDays }) {
  const pages = await queryAllPages(databaseId);
  const byName = new Map(pages.map((p) => [read.title(p, 'Name').trim().toLowerCase(), p]));
  const summary = { created: 0, dueFlagged: 0, scheduled: 0 };

  for (const agency of agencies) {
    if (!agency.name || byName.has(agency.name.trim().toLowerCase())) continue;
    await createPage(databaseId, {
      Name: prop.title(agency.name),
      Website: prop.url(agency.website),
      Email: prop.email(agency.email),
      Niche: prop.multiSelect(agency.niche),
      Status: prop.select('Not contacted'),
      Notes: prop.richText(agency.notes),
    });
    summary.created++;
  }

  const today = isoDate();
  for (const page of pages) {
    const status = read.select(page, 'Status');
    if (!FOLLOW_UP_STATUSES.has(status)) {
      // Clear a stale flag if the deal moved on (Client/Dead/Not contacted)
      if (read.checkbox(page, 'Due for follow-up')) {
        await updatePage(page.id, { 'Due for follow-up': prop.checkbox(false) });
      }
      continue;
    }

    const lastContacted = read.date(page, 'Last contacted');
    let nextFollowUp = read.date(page, 'Next follow-up');

    // If you logged a contact but no next date, schedule one automatically.
    if (lastContacted && !nextFollowUp) {
      const next = new Date(lastContacted);
      next.setDate(next.getDate() + followUpDays);
      nextFollowUp = isoDate(next);
      await updatePage(page.id, { 'Next follow-up': prop.date(nextFollowUp) });
      summary.scheduled++;
    }

    const due = Boolean(nextFollowUp && nextFollowUp <= today);
    if (due !== read.checkbox(page, 'Due for follow-up')) {
      await updatePage(page.id, { 'Due for follow-up': prop.checkbox(due) });
      if (due) summary.dueFlagged++;
    }
  }

  return summary;
}
