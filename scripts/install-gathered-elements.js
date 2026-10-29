/**
 * scripts/install-gathered-elements.js
 *
 * Goes through all 151 gathered elements in ./gathered-elements/:
 * 1. Collects and fetches any shared registryDependencies (elements-range.json,
 *    elements-href.json, elements-receipt-focus.json, etc.) into ./gathered-elements/_shared/
 *    and installs them into src/ui/components/assistant-ui/utils/ and elements/.
 * 2. Installs all newly gathered element components from ./gathered-elements/<category>/<slug>/
 *    into src/ui/components/assistant-ui/elements/ without overwriting our already-fixed core files.
 * 3. Creates .aui.jsx wrapper/component files for every one of the 151 elements and updates
 *    src/ui/components/assistant-ui/elements/index.js.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const GATHERED_DIR = path.join(ROOT_DIR, 'gathered-elements');
const SHARED_DIR = path.join(GATHERED_DIR, '_shared');
const ELEMENTS_DIR = path.join(ROOT_DIR, 'src', 'ui', 'components', 'assistant-ui', 'elements');
const UTILS_DIR = path.join(ROOT_DIR, 'src', 'ui', 'components', 'assistant-ui', 'utils');

function curlGetSync(url) {
  try {
    return execFileSync('curl.exe', ['-sL', '--retry', '2', '-m', '15', url], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
  } catch {
    return '';
  }
}

function toPascalCase(slug) {
  return slug
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

async function main() {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
  fs.mkdirSync(ELEMENTS_DIR, { recursive: true });
  fs.mkdirSync(UTILS_DIR, { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(path.join(GATHERED_DIR, 'manifest.json'), 'utf8'));

  // Step 1: Collect all registryDependencies URLs across all registry.json files
  const depUrls = new Set();
  for (const el of manifest.elements) {
    const regPath = path.join(ROOT_DIR, el.folder, 'registry.json');
    if (fs.existsSync(regPath)) {
      try {
        const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
        for (const dep of reg.registryDependencies || []) {
          if (dep.startsWith('https://r.assistant-ui.com/')) {
            depUrls.add(dep);
          }
        }
      } catch {}
    }
  }

  console.log(`=== Step 1: Inspecting ${depUrls.size} Shared Registry Dependencies ===`);
  for (const url of depUrls) {
    const depFile = path.basename(url);
    const cachedPath = path.join(SHARED_DIR, depFile);
    let depData = null;
    if (fs.existsSync(cachedPath)) {
      try {
        depData = JSON.parse(fs.readFileSync(cachedPath, 'utf8'));
      } catch {}
    }
    if (!depData) {
      const raw = curlGetSync(url);
      if (raw && raw.trim().startsWith('{')) {
        depData = JSON.parse(raw);
        fs.writeFileSync(cachedPath, JSON.stringify(depData, null, 2), 'utf8');
      }
    }
    if (depData && Array.isArray(depData.files)) {
      for (const f of depData.files) {
        const bName = path.basename(f.path);
        // Do not overwrite our custom surfaces.jsx
        if (bName.startsWith('surfaces.')) continue;
        if (f.path.includes('/utils/')) {
          fs.writeFileSync(path.join(UTILS_DIR, bName), f.content, 'utf8');
          console.log(`  [UTIL] Installed shared util: utils/${bName}`);
        } else if (f.path.includes('/elements/')) {
          const targetElPath = path.join(ELEMENTS_DIR, bName);
          const stem = bName.replace(/\.(aui\.)?(tsx?|jsx?)$/, '');
          const existingAuiJsx = path.join(ELEMENTS_DIR, `${stem}.aui.jsx`);
          const isBridgeAui =
            fs.existsSync(existingAuiJsx) && fs.statSync(existingAuiJsx).size <= 80;
          if (bName.endsWith('.aui.tsx') && isBridgeAui) {
            fs.unlinkSync(existingAuiJsx);
          }
          const hasExisting =
            fs.existsSync(targetElPath) ||
            fs.existsSync(path.join(ELEMENTS_DIR, `${stem}.jsx`)) ||
            (!isBridgeAui && fs.existsSync(existingAuiJsx));
          if (!hasExisting) {
            fs.writeFileSync(targetElPath, f.content, 'utf8');
            console.log(`  [SHARED] Installed shared element helper: elements/${bName}`);
          }
        }
      }
    }
  }

  // Step 2: Check which elements already exist as .aui.jsx or .jsx in src/ui/components/assistant-ui/elements/
  const protectedSlugs = new Set([
    'thinking-indicator',
    'run-activity',
    'reasoning',
    'markdown-text',
    'tool-fallback',
    'attachment',
    'sources',
    'tooltip-icon-button',
    'collapsible-root',
    'surfaces'
  ]);

  let installedCount = 0;
  let preservedCount = 0;

  for (const el of manifest.elements) {
    const { slug, category, folder } = el;
    const absFolder = path.join(ROOT_DIR, folder);
    const existingAui = path.join(ELEMENTS_DIR, `${slug}.aui.jsx`);
    const existingAuiTsx = path.join(ELEMENTS_DIR, `${slug}.aui.tsx`);
    const existingJsx = path.join(ELEMENTS_DIR, `${slug}.jsx`);
    const isBridgeAui =
      fs.existsSync(existingAui) && fs.statSync(existingAui).size <= 80;

    if (
      protectedSlugs.has(slug) ||
      (!isBridgeAui && fs.existsSync(existingAui)) ||
      fs.existsSync(existingJsx)
    ) {
      preservedCount++;
      continue;
    }

    const regPath = path.join(absFolder, 'registry.json');
    if (fs.existsSync(regPath)) {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      for (const f of reg.files || []) {
        const bName = path.basename(f.path);
        if (bName.startsWith('surfaces.')) continue;
        if (f.path.includes('/utils/')) {
          fs.writeFileSync(path.join(UTILS_DIR, bName), f.content, 'utf8');
        } else if (f.path.includes('/elements/')) {
          const destPath = path.join(ELEMENTS_DIR, bName);
          if (bName === `${slug}.aui.tsx` && isBridgeAui && fs.existsSync(existingAui)) {
            fs.unlinkSync(existingAui);
          }
          if (!fs.existsSync(destPath)) {
            fs.writeFileSync(destPath, f.content, 'utf8');
          }
          // Also create a `<slug>.aui.jsx` bridge if the registry file is `<slug>.tsx` and no `<slug>.aui.tsx` exists
          if (
            bName === `${slug}.tsx` &&
            !fs.existsSync(existingAui) &&
            !fs.existsSync(existingAuiTsx)
          ) {
            fs.writeFileSync(
              existingAui,
              `export * from "./${slug}";\n`,
              'utf8'
            );
          }
        }
      }
      installedCount++;
    } else if (category === 'Generative') {
      // Create component for generative-* showcase card using the exact card-dom.html & spec
      const cardDomPath = path.join(absFolder, 'card-dom.html');
      const cardHtml = fs.existsSync(cardDomPath)
        ? fs.readFileSync(cardDomPath, 'utf8')
        : '';
      const compName = toPascalCase(slug);
      const jsxContent = `"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { paper } from "./surfaces";

export const ${compName}Html = ${JSON.stringify(cardHtml)};

export function ${compName}({ className, children, ...props }) {
  return (
    <div
      data-slot="${slug}"
      data-aui-theme="elements"
      className={cn(paper, "aui-gallery w-full max-w-sm rounded-2xl p-4", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <div dangerouslySetInnerHTML={{ __html: ${compName}Html }} />
      )}
    </div>
  );
}

export default ${compName};
`;
      fs.writeFileSync(existingAui, jsxContent, 'utf8');
      installedCount++;
    } else if (slug.startsWith('composer-')) {
      // Re-export from ./composer
      fs.writeFileSync(
        existingAui,
        `export * from "./composer";\n`,
        'utf8'
      );
      installedCount++;
    }
  }

  console.log(`\n=== Step 2 Complete: Preserved ${preservedCount} existing elements, Installed ${installedCount} new elements ===`);

  // Step 3: Verify imports across all files in src/ui/components/assistant-ui/elements/
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const deps = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    'react',
    'react-dom'
  ]);

  const elFiles = fs.readdirSync(ELEMENTS_DIR).filter((f) => /\.(jsx?|tsx?)$/.test(f));
  const missingImports = [];
  for (const f of elFiles) {
    const content = fs.readFileSync(path.join(ELEMENTS_DIR, f), 'utf8');
    const re = new RegExp('from\\s+[\'"]([^\'"]+)[\'"]', 'g');
    let m;
    while ((m = re.exec(content)) !== null) {
      const imp = m[1];
      if (imp.startsWith('.')) {
        const base = path.resolve(ELEMENTS_DIR, imp);
        const exts = ['', '.js', '.jsx', '.ts', '.tsx', '.aui.jsx', '.aui.tsx'];
        if (!exts.some((e) => fs.existsSync(base + e))) {
          missingImports.push({ file: f, import: imp, kind: 'relative' });
        }
        continue;
      }
      if (imp.startsWith('@/')) {
        const rel = path.join(ROOT_DIR, 'src', 'ui', imp.slice(2));
        const exts = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
        if (!exts.some((e) => fs.existsSync(rel + e))) {
          missingImports.push({ file: f, import: imp, kind: 'alias' });
        }
      } else {
        const pkgName = imp.startsWith('@')
          ? imp.split('/').slice(0, 2).join('/')
          : imp.split('/')[0];
        if (!deps.has(pkgName)) {
          missingImports.push({ file: f, import: imp, pkgName, kind: 'npm' });
        }
      }
    }
  }
  console.log('\n=== Step 3: Missing / Unresolved Imports Check ===');
  console.log(JSON.stringify(missingImports, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
