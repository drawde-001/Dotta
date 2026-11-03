import fs from 'fs';

const filePath = process.argv[2] || '';
if (!filePath) {
  console.log('Usage: node parse-content-md.js <path>');
  process.exit(0);
}
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
