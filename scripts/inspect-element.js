import { execFileSync } from 'child_process';

export function curlGet(url, timeoutSec = 15) {
  try {
    return execFileSync('curl.exe', ['-sL', '-m', String(timeoutSec), url], {
      encoding: 'utf8',
      maxBuffer: 15 * 1024 * 1024
    });
  } catch {
    return '';
  }
}

export function fetchElementPage(slug) {
  const url = `https://www.assistant-ui.com/elements/${slug}`;
  const html = curlGet(url, 15);
  return { statusCode: html ? 200 : 500, html, url };
}

export function fetchRegistryJson(slug) {
  const urls = [
    `https://r.assistant-ui.com/elements-${slug}.json`,
    `https://r.assistant-ui.com/${slug}.json`
  ];
  for (const u of urls) {
    const raw = curlGet(u, 12);
    if (raw && raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.files)) {
          return { url: u, data: parsed };
        }
      } catch {}
    }
  }
  return null;
}

export function extractShowcase(html) {
  const marker = 'rounded-document';
  const docIdx = html.indexOf(marker);
  if (docIdx === -1) return null;

  const containerStart = html.lastIndexOf('<div', docIdx);
  if (containerStart === -1) return null;

  const sub = html.slice(containerStart, containerStart + 6000);
  const dataSlotIdx = sub.indexOf('data-slot="');
  let slotSnippet = '';
  if (dataSlotIdx !== -1) {
    const tagStart = sub.lastIndexOf('<', dataSlotIdx);
    slotSnippet = sub.slice(tagStart !== -1 ? tagStart : dataSlotIdx, dataSlotIdx + 1800);
  }

  return {
    rawContainer: sub.slice(0, 2500),
    slotSnippet
  };
}

function main() {
  const slugs = process.argv.slice(2);
  const targets = slugs.length > 0 ? slugs : ['thread', 'web-search', 'subagent-list'];
  for (const slug of targets) {
    const { statusCode, html, url } = fetchElementPage(slug);
    const reg = fetchRegistryJson(slug);
    console.log(`\n======================================================`);
    console.log(`INSPECTED ELEMENT: ${slug}`);
    console.log(`Page URL:          ${url} (HTTP ${statusCode}, ${html.length} bytes)`);
    console.log(`Registry URL:      ${reg ? reg.url : 'none'} (${reg ? reg.data.files.map((f) => f.path).join(', ') : 'n/a'})`);
    const showcase = extractShowcase(html);
    if (showcase) {
      console.log(`--- TARGET SHOWCASE BLOCK (rounded-document / data-slot) ---`);
      console.log((showcase.slotSnippet || showcase.rawContainer).slice(0, 900));
    }
    if (reg && reg.data.files[0]) {
      console.log(`--- COMPONENT SOURCE CODE (${reg.data.files[0].path}) ---`);
      console.log(reg.data.files[0].content.slice(0, 900));
    }
  }
}

main();

