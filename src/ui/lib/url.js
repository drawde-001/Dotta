/**
 * src/ui/lib/url.js
 *
 * Validates returnTo path to prevent open redirect vulnerabilities.
 * Only allows same-origin relative paths starting with a single '/'.
 */
export function validateReturnTo(path) {
  if (typeof path !== 'string') return '/';
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://') || trimmed.includes('\\')) {
    return '/';
  }
  if (!/^\/[a-zA-Z0-9_\-\/?&=%#.]*$/.test(trimmed)) {
    return '/';
  }
  return trimmed;
}
