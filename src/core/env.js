import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Robust API key retriever that checks process.env and multiple .env / .env.local locations.
 */
export function getApiKey(keyName) {
  if (process.env[keyName] && String(process.env[keyName]).trim()) {
    return String(process.env[keyName]).replace(/[\r\n"']/g, '').trim();
  }
  const locations = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '.env.local')
  ];
  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      try {
        const content = fs.readFileSync(loc, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const k = trimmed.substring(0, eqIdx).trim();
              if (k === keyName) {
                const v = trimmed.substring(eqIdx + 1).replace(/^['"]|['"]$/g, '').replace(/[\r\n]/g, '').trim();
                if (v) return v;
              }
            }
          }
        }
      } catch {}
    }
  }
  return null;
}
