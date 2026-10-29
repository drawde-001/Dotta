import fs from 'fs';

export async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(10000)
      });
      const html = await res.text();
      return { statusCode: res.status, html, url };
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

export function extractShowcase(html) {
  const marker = 'rounded-document';
  const docIdx = html.indexOf(marker);
  if (docIdx === -1) return { error: 'No rounded-document found' };

  const containerStart = html.lastIndexOf('<div', docIdx);
  if (containerStart === -1) return { error: 'No container start found' };

  const sub = html.slice(containerStart, containerStart + 12000);
  const variantsIdx = sub.indexOf('aria-label="Variants"');
  const previewHtml = variantsIdx !== -1 ? sub.slice(0, variantsIdx) : sub;

  return { previewHtml };
}

async function run() {
  const slugs = process.argv.slice(2);
  const results = {};
  for (const slug of slugs) {
    const url = `https://www.assistant-ui.com/elements/${slug}`;
    try {
      const res = await fetchPage(url);
      if (res.statusCode !== 200) {
        console.log(`[URL_STATUS] FAIL ${slug} HTTP_${res.statusCode}`);
        continue;
      }
      console.log(`[URL_STATUS] OK ${slug}`);
      const sc = extractShowcase(res.html);
      results[slug] = {
        html: sc.previewHtml || ''
      };
    } catch (err) {
      console.log(`[URL_STATUS] ERROR ${slug}: ${err.message}`);
    }
  }

  const phaseTag = process.env.PHASE_TAG || 'current';
  const outFile = `scripts/phase-${phaseTag}-specs.json`;
  let existing = {};
  if (fs.existsSync(outFile)) {
    try { existing = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
  }
  fs.writeFileSync(outFile, JSON.stringify({ ...existing, ...results }, null, 2));
  console.log(`Saved ${Object.keys(results).length} items to ${outFile}`);
}

if (process.argv[1] && process.argv[1].endsWith('extract-phase.js')) {
  run();
}
