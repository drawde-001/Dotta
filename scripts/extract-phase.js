import https from 'https';

export function fetchPage(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      };
      const req = https.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchPage(res.headers.location, n).then(resolve, reject);
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ statusCode: res.statusCode, html: data, url }));
      });
      req.on('error', (err) => {
        if (n > 0) {
          setTimeout(() => attempt(n - 1), 1000);
        } else {
          reject(err);
        }
      });
      req.setTimeout(15000, () => {
        req.destroy();
        if (n > 0) {
          setTimeout(() => attempt(n - 1), 1000);
        } else {
          reject(new Error('Request timed out'));
        }
      });
    };
    attempt(retries);
  });
}

export function extractShowcase(html) {
  // Find rounded-document
  const marker = 'rounded-document';
  const docIdx = html.indexOf(marker);
  if (docIdx === -1) return { error: 'No rounded-document found' };

  const containerStart = html.lastIndexOf('<div', docIdx);
  if (containerStart === -1) return { error: 'No container start found' };

  // Look for the inner showcase element inside the container
  // Cut until aria-label="Variants" or 8000 chars
  const sub = html.slice(containerStart, containerStart + 12000);
  const variantsIdx = sub.indexOf('aria-label="Variants"');
  const previewHtml = variantsIdx !== -1 ? sub.slice(0, variantsIdx) : sub;

  return { previewHtml };
}

async function run() {
  const slugs = process.argv.slice(2);
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
      console.log(`=== BEGIN_${slug} ===`);
      console.log(sc.previewHtml);
      console.log(`=== END_${slug} ===\n`);
    } catch (err) {
      console.log(`[URL_STATUS] ERROR ${slug}: ${err.message}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('extract-phase.js')) {
  run();
}
