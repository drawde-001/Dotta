import fs from 'fs';

const slug = process.argv[2];
const specs = JSON.parse(fs.readFileSync('scripts/phase2-specs.json', 'utf8'));

if (!slug) {
  console.log('Available slugs:', Object.keys(specs).join(', '));
} else {
  console.log(`=== SPEC FOR: ${slug} ===`);
  console.log(specs[slug]?.html || 'Not found');
}
