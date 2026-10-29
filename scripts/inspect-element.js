import https from 'https';

export async function fetchElementPage(slug) {
  return new Promise((resolve, reject) => {
    const url = `https://www.assistant-ui.com/elements/${slug}`;
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle redirect
        https.get(res.headers.location, (redRes) => {
          let redData = '';
          redRes.on('data', (c) => (redData += c));
          redRes.on('end', () => resolve({ statusCode: redRes.statusCode, html: redData, url }));
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, html: data, url }));
    }).on('error', reject);
  });
}

export function extractShowcase(html) {
  // Look for rounded-document
  const marker = 'rounded-document';
  const docIdx = html.indexOf(marker);
  if (docIdx === -1) return null;

  // Find start of outer container
  const containerStart = html.lastIndexOf('<div', docIdx);
  if (containerStart === -1) return null;

  // Search inside for data-slot or preview root
  const sub = html.slice(containerStart, containerStart + 6000);
  const dataSlotIdx = sub.indexOf('data-slot="');
  let slotSnippet = '';
  if (dataSlotIdx !== -1) {
    slotSnippet = sub.slice(dataSlotIdx, dataSlotIdx + 1500);
  }

  return {
    rawContainer: sub.slice(0, 2500),
    slotSnippet
  };
}

async function main() {
  const slug = process.argv[2] || 'loading-state';
  try {
    const { statusCode, html, url } = await fetchElementPage(slug);
    if (statusCode !== 200) {
      console.error(`FAILED: ${url} returned HTTP ${statusCode}`);
      process.exit(1);
    }
    const showcase = extractShowcase(html);
    console.log(`=== SHOWCASE FOR: ${slug} (${url}) ===`);
    if (showcase) {
      console.log('SLOT SNIPPET:');
      console.log(showcase.slotSnippet || showcase.rawContainer.slice(0, 1000));
    } else {
      console.log('No rounded-document found, search for data-slot:');
      const dsIdx = html.indexOf('data-slot=');
      if (dsIdx !== -1) {
        console.log(html.slice(dsIdx, dsIdx + 1000));
      } else {
        console.log('No data-slot found either.');
      }
    }
  } catch (err) {
    console.error(`ERROR fetching ${slug}:`, err.message);
  }
}

main();
