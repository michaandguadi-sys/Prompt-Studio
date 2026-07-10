import { createHash } from 'node:crypto';

export function sha1(text) {
  return createHash('sha1').update(text).digest('hex');
}

export function daysAgo(dateLike) {
  const t = new Date(dateLike).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

export function isoDate(dateLike = new Date()) {
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text = '', max = 1900) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Fetch JSON/text with a timeout and a couple of retries; job boards are flaky.
export async function fetchWithRetry(url, { headers = {}, retries = 2, timeoutMs = 20_000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'job-pipeline/1.0 (personal job search bot)', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}
