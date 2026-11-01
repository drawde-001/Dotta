import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Robust API key retriever that returns a list of keys from comma/newline-separated
 * environment variables or multiple definitions, checking process.env and .env files.
 */
export function getApiKeys(keyName) {
  const rawValues = [];
  const baseName = String(keyName || '').trim();
  const candidateNames = [
    baseName,
    `${baseName}S`,
    `${baseName}_LIST`
  ];

  if (baseName === 'GEMINI_API_KEY') {
    candidateNames.push('GEMINI_API_KEYS', 'GOOGLE_API_KEY', 'GOOGLE_API_KEYS');
  } else if (baseName === 'GOOGLE_API_KEY') {
    candidateNames.push('GOOGLE_API_KEYS', 'GEMINI_API_KEY', 'GEMINI_API_KEYS');
  }

  // Check process.env for candidates and numbered keys (e.g. GEMINI_API_KEY_1)
  for (const name of candidateNames) {
    if (process.env[name] && String(process.env[name]).trim()) {
      rawValues.push(String(process.env[name]));
    }
  }
  for (let i = 1; i <= 10; i++) {
    const numName = `${baseName}_${i}`;
    if (process.env[numName] && String(process.env[numName]).trim()) {
      rawValues.push(String(process.env[numName]));
    }
  }

  // Check .env files across common directories
  const locations = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../../.env'),
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
              const isMatch = candidateNames.includes(k) ||
                new RegExp(`^${baseName}_\\d+$`).test(k);
              if (isMatch) {
                const v = trimmed.substring(eqIdx + 1).replace(/^['"]|['"]$/g, '').replace(/[\r\n]/g, '').trim();
                if (v) rawValues.push(v);
              }
            }
          }
        }
      } catch {}
    }
  }

  // Parse comma, semicolon, or newline delimited strings
  const parsedKeys = [];
  for (const raw of rawValues) {
    const parts = raw.split(/[,;\n]/);
    for (const part of parts) {
      const cleaned = part.replace(/^['"]|['"]$/g, '').replace(/[\r\n]/g, '').trim();
      if (cleaned && !parsedKeys.includes(cleaned)) {
        parsedKeys.push(cleaned);
      }
    }
  }

  return parsedKeys;
}

/**
 * Robust API key retriever that checks process.env and multiple .env / .env.local locations.
 * Returns the primary key (first key if multiple are configured).
 */
export function getApiKey(keyName) {
  const keys = getApiKeys(keyName);
  return keys.length > 0 ? keys[0] : null;
}

/**
 * Helper to get all configured Gemini API keys
 */
export function getGeminiApiKeys() {
  return getApiKeys('GEMINI_API_KEY');
}

