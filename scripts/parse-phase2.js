import fs from 'fs';

function extractFromLog(logPath) {
  const content = fs.readFileSync(logPath, 'utf8');
  const sections = content.split('=== BEGIN_');
  const result = {};
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const slugEnd = sec.indexOf(' ===');
    const slug = sec.slice(0, slugEnd).trim();
    const bodyEnd = sec.indexOf(`=== END_${slug} ===`);
    const html = sec.slice(slugEnd + 4, bodyEnd !== -1 ? bodyEnd : undefined).trim();

    // Look for inner showcase preview
    // In our preview, usually there's <div data-slot="..." or <div class="relative flex h-full w-full...
    // Let's locate data-slot
    const slotIdx = html.indexOf('data-slot="');
    let slotSnippet = '';
    let dataSlotName = '';
    if (slotIdx !== -1) {
      const quoteEnd = html.indexOf('"', slotIdx + 11);
      dataSlotName = html.slice(slotIdx + 11, quoteEnd);
      // find closing tag or reasonable snippet
      slotSnippet = html.slice(slotIdx, slotIdx + 3000);
    }
    result[slug] = {
      dataSlotName,
      html: html.slice(0, 3500)
    };
  }
  return result;
}

const logPath1 = process.argv[2] || '';
const logPath2 = process.argv[3] || '';
if (!logPath1) {
  console.log('Usage: node parse-phase2.js <logPath1> [logPath2]');
  process.exit(0);
}
const res1 = extractFromLog(logPath1);
const res2 = logPath2 ? extractFromLog(logPath2) : {};

const combined = { ...res1, ...res2 };
fs.writeFileSync('scripts/phase2-specs.json', JSON.stringify(combined, null, 2));
console.log('Saved phase2-specs.json with keys:', Object.keys(combined));
