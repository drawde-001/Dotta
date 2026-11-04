/**
 * src/core/auth/verify-provider.js
 *
 * Live verification probes and SSRF defenses for User-Funded Billing.
 * Validates Meta and Modal credentials with tiny capped requests before anything is written to the database.
 */

import dns from 'dns/promises';
import { URL } from 'url';

/**
 * Checks if an IP string is within loopback, link-local, cloud metadata, or private RFC1918 ranges.
 */
export function isPrivateOrRestrictedIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  // IPv6 loopback / unspecified / link-local / unique local
  if (cleanIp === '::1' || cleanIp === '::' || cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
    return true;
  }

  // IPv4 checks
  const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false; // Not standard IPv4
  }

  const [a, b, c, d] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private 172.16 - 172.31)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local & AWS/Azure/GCP metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

/**
 * Strict SSRF Shield:
 * - Must use HTTPS.
 * - Disallow loopback, private RFC1918, and cloud metadata hostnames / IPs.
 * - Resolves DNS to ensure domain does not point to internal infrastructure.
 */
export async function assertSafeExternalUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('Endpoint URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    throw new Error('Invalid endpoint URL format.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only secure HTTPS endpoints are permitted for Modal compute.');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost, internal, and local tlds
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home')
  ) {
    throw new Error('Local and internal network hostnames are not allowed.');
  }

  // If hostname is directly an IP address
  if (isPrivateOrRestrictedIp(hostname)) {
    throw new Error('Private, loopback, or cloud metadata IP addresses are strictly prohibited.');
  }

  // Resolve DNS to verify the target IP is not private/metadata
  try {
    const addresses = await dns.resolve4(hostname).catch(() => []);
    for (const addr of addresses) {
      if (isPrivateOrRestrictedIp(addr)) {
        throw new Error(`Hostname ${hostname} resolves to restricted IP ${addr}. Connection blocked.`);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('restricted IP')) {
      throw err;
    }
    // DNS resolution failure will be caught as network error during fetch probe
  }

  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/**
 * Map Meta API errors to friendly user-facing messages.
 */
export function mapMetaError(status, errText = '') {
  const lower = String(errText).toLowerCase();
  if (status === 401 || status === 403 || lower.includes('invalid_api_key') || lower.includes('unauthorized')) {
    return {
      code: 'INVALID_KEY',
      message: 'Invalid Meta API key. Please verify your key in the Meta developer portal.'
    };
  }
  if (status === 402 || lower.includes('insufficient_quota') || lower.includes('payment_required') || lower.includes('credit')) {
    return {
      code: 'INSUFFICIENT_CREDITS',
      message: 'Account restricted or insufficient credits on your Meta account.'
    };
  }
  if (status === 429 || lower.includes('rate_limit')) {
    return {
      code: 'RATE_LIMITED',
      message: 'Meta API rate limit reached. Please try again in a few moments.'
    };
  }
  return {
    code: 'UPSTREAM_ERROR',
    message: `Meta API returned HTTP ${status}. Please check your Meta configuration.`
  };
}

/**
 * Live verification probe for Meta API key.
 * Sends a tiny 1-token request (max_tokens: 1) to verify key validity.
 */
export async function verifyMetaCredentials(apiKey, customBaseUrl = null) {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) {
    return { ok: false, code: 'EMPTY_KEY', error: 'Please enter a valid Meta API key.' };
  }

  const baseUrl = (customBaseUrl || process.env.META_MUSE_BASE_URL || process.env.MODEL_API_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const probePayload = {
      model: 'muse-spark-open',
      messages: [{ role: 'user', content: 'probe' }],
      max_tokens: 1,
      temperature: 0.1
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`
      },
      body: JSON.stringify(probePayload),
      redirect: 'error',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return { ok: true };
    }

    const errText = await res.text().catch(() => '');
    const mapped = mapMetaError(res.status, errText);
    return { ok: false, code: mapped.code, error: mapped.message };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, code: 'TIMEOUT', error: 'Meta verification timed out. Please check your network connection.' };
    }
    return { ok: false, code: 'NETWORK_ERROR', error: `Could not reach Meta API endpoint: ${err.message}` };
  }
}

/**
 * Live verification probe for Modal Compute credentials.
 * Performs SSRF validation, then sends a capped model request with Token ID and Secret.
 */
export async function verifyModalCredentials({ endpointUrl, tokenId, tokenSecret }) {
  const cleanTokenId = String(tokenId || '').trim();
  const cleanTokenSecret = String(tokenSecret || '').trim();

  if (!cleanTokenId || !cleanTokenSecret) {
    return { ok: false, code: 'MISSING_TOKENS', error: 'Modal Token ID and Token Secret are both required.' };
  }

  let safeUrl;
  try {
    safeUrl = await assertSafeExternalUrl(endpointUrl);
  } catch (ssrfErr) {
    return { ok: false, code: 'SSRF_BLOCKED', error: ssrfErr.message };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // Allow cold start tolerance

  try {
    const probePayload = {
      model: 'meta-models/Muse-Spark-Open-816B-A42B',
      messages: [{ role: 'user', content: 'probe' }],
      max_tokens: 1,
      temperature: 0.1
    };

    const targetEndpoint = safeUrl.endsWith('/chat/completions') ? safeUrl : `${safeUrl}/chat/completions`;

    const res = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanTokenId}.${cleanTokenSecret}`,
        'Modal-Key': cleanTokenId,
        'Modal-Secret': cleanTokenSecret
      },
      body: JSON.stringify(probePayload),
      redirect: 'error',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return { ok: true, safeUrl };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid Modal Token ID or Secret. Please verify your Modal authentication tokens.'
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        code: 'ENDPOINT_NOT_FOUND',
        error: 'Modal web endpoint not found. Please verify the deployed Modal URL path.'
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Modal endpoint rate limit reached. Please try again shortly.'
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      code: 'MODAL_ERROR',
      error: `Modal endpoint returned HTTP ${res.status}. Please check your deployment logs.`
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        ok: false,
        code: 'TIMEOUT',
        error: 'Modal endpoint request timed out (25s). If cold starting, please allow your container to warm up.'
      };
    }
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      error: `Could not reach Modal endpoint: ${err.message}`
    };
  }
}
