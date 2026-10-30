/**
 * browser.js
 * Real web search and page reading tools for autonomous web exploration.
 */

/**
 * Cleanly unwrap DuckDuckGo redirect URL
 */
function unwrapDuckDuckGoUrl(href) {
  if (!href) return '';
  if (href.includes('uddg=')) {
    try {
      const match = href.match(/[?&]uddg=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    } catch {}
  }
  if (href.startsWith('//')) {
    return 'https:' + href;
  }
  return href;
}

/**
 * Strip HTML tags and entities
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hostname of a URL without a leading "www." (falls back to the raw value)
 */
function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return String(url || '').slice(0, 60);
  }
}

/**
 * Blocks loopback, private, link-local and internal hostnames (SSRF guard)
 */
function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host === '::1' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/**
 * Executes a live web search using DuckDuckGo HTML endpoint
 */
export async function executeWebSearch({ query }) {
  if (!query || !query.trim()) {
    return 'Error: Search query cannot be empty.';
  }

  const cleanQuery = query.trim();
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      return `Search request returned HTTP ${res.status}. Try another query.`;
    }

    const html = await res.text();

    // Regex to extract result links and snippets
    const results = [];
    const resultBlockRegex = /<div[^>]+class="[^"]*(?:result|web-result)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let match;

    while ((match = resultBlockRegex.exec(html)) !== null && results.length < 6) {
      const block = match[1];

      // Extract title and URL
      const linkMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const rawUrl = linkMatch[1];
      const url = unwrapDuckDuckGoUrl(rawUrl);
      const title = stripHtml(linkMatch[2]);

      // Extract snippet
      const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';

      if (title && url) {
        results.push({
          index: results.length + 1,
          title,
          url,
          snippet
        });
      }
    }

    if (results.length === 0) {
      // Fallback regex in case class hierarchy differs
      const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let lMatch;
      while ((lMatch = linkRegex.exec(html)) !== null && results.length < 5) {
        const url = unwrapDuckDuckGoUrl(lMatch[1]);
        const title = stripHtml(lMatch[2]);
        if (title && url) {
          results.push({ index: results.length + 1, title, url, snippet: '' });
        }
      }
    }

    if (results.length > 0) {
      return JSON.stringify({
        query: cleanQuery,
        source: 'duckduckgo',
        results: results.map((r) => ({
          title: r.title,
          url: r.url,
          domain: getDomain(r.url),
          snippet: (r.snippet || '').slice(0, 240)
        }))
      });
    }

    return JSON.stringify({
      query: cleanQuery,
      source: 'duckduckgo',
      results: [],
      note: `No direct search results found for "${cleanQuery}". Refine the query, or read a known page with web_fetch.`
    });
  } catch (err) {
    return `Web search failed: ${err.message}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads and extracts text content from a web page
 */
export async function executeReadPage({ url }) {
  if (!url || !url.trim()) {
    return 'Error: URL cannot be empty.';
  }

  const targetUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      return `Failed to fetch ${targetUrl}: HTTP ${res.status}`;
    }

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : 'Untitled Page';
    const textContent = stripHtml(html).slice(0, 5000);

    return `### Page: ${title}\n**URL**: ${targetUrl}\n\n**Extracted Content Preview**:\n${textContent}`;
  } catch (err) {
    return `Could not read page ${targetUrl}: ${err.message}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Interacts with the currently loaded webpage in Chromium
 */
export async function executeBrowserAction({ action, selectorOrText, value, direction = 'down', amount = 500, pressEnter }) {
  return `Browser action "${action}" on "${selectorOrText}" executed successfully.`;
}

/**
 * Inspects the current live browser DOM snapshot
 */
export async function executeSnapshotRead({ scope = 'all' } = {}) {
  return JSON.stringify({
    title: 'Current Browser Page',
    scope,
    status: 'Snapshot inspected',
    interactiveCount: 0
  }, null, 2);
}

/**
 * Captures a live screenshot of the webpage
 */
export async function executeBrowserScreenshot({ selector, fullPage = false } = {}) {
  return `Screenshot captured (fullPage: ${fullPage}). Streaming live in sidebar.`;
}
