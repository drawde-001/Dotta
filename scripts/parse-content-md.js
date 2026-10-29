import fs from 'fs';

const filePath = process.argv[2] || 'C:/Users/USER/.gemini/antigravity/brain/180726b3-799f-46ed-a248-d1a4395d6319/.system_generated/steps/2954/content.md';
const html = fs.readFileSync(filePath, 'utf8');
const docIdx = html.indexOf('rounded-document');
console.log('docIdx:', docIdx);
if (docIdx !== -1) {
  const start = html.lastIndexOf('<div', docIdx);
  const snippet = html.slice(start, start + 3000);
  const varIdx = snippet.indexOf('aria-label="Variants"');
  console.log(varIdx !== -1 ? snippet.slice(0, varIdx) : snippet);
} else {
  const dataSlotIdx = html.indexOf('data-slot="');
  if (dataSlotIdx !== -1) {
    console.log(html.slice(dataSlotIdx, dataSlotIdx + 2000));
  } else {
    console.log('No rounded-document or data-slot found');
  }
}
