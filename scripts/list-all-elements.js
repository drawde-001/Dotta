import { execFileSync } from 'child_process';

function fetchPage(url) {
  const html = execFileSync('curl.exe', ['-sL', '-m', '15', url], {
    encoding: 'utf8',
    maxBuffer: 15 * 1024 * 1024
  });
  return { statusCode: html ? 200 : 500, html };
}

async function run() {
  const { statusCode, html } = fetchPage('https://www.assistant-ui.com/elements/loading-state');
  if (statusCode !== 200) {
    console.error('Failed to fetch elements index, code:', statusCode);
    process.exit(1);
  }

  // Find all category headings and element links
  // In the HTML nav: <p class="text-muted-foreground px-2 text-xs font-medium">Category</p> followed by <a> tags
  const navStart = html.indexOf('<nav aria-label="Elements"');
  if (navStart === -1) {
    console.error('Could not find nav in page');
    return;
  }
  const navEnd = html.indexOf('</nav>', navStart);
  const navHtml = html.slice(navStart, navEnd);

  const catRegex = /<p class="[^"]*text-xs font-medium">([^<]+)<\/p>([\s\S]*?)(?=(<p class="[^"]*text-xs font-medium">|$))/g;
  let catMatch;
  const categories = {};
  while ((catMatch = catRegex.exec(navHtml)) !== null) {
    const categoryName = catMatch[1].trim();
    const sectionHtml = catMatch[2];
    const linkRegex = /href="\/elements\/([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;
    let lMatch;
    const items = [];
    while ((lMatch = linkRegex.exec(sectionHtml)) !== null) {
      items.push({ slug: lMatch[1], title: lMatch[2].trim() });
    }
    categories[categoryName] = items;
  }

  for (const [cat, items] of Object.entries(categories)) {
    console.log(`${cat} (${items.length}):`, items.map(i => i.slug).join(', '));
  }
}

run().catch(console.error);
