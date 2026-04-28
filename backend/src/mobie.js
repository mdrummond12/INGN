const API_HOST = process.env.API_HOST || 'mobileorderprodapi.transactcampus.com';

const ALLOWED_ENDPOINTS = new Set(['adduser', 'removeuser']);

/**
 * Call the Mobie Ordering segment endpoint. The caller must supply their own
 * Mobie API key (currently via the `x-mobie-api-key` request header; later
 * fetched from the user's encrypted record in Firestore).
 */
export async function callMobieSegment(endpoint, { conditionId, value }, apiKey) {
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return { success: false, status: 400, message: `Endpoint not allowed: ${endpoint}`, raw: null };
  }
  if (!apiKey) {
    return { success: false, status: 401, message: 'Missing Mobie API key', raw: null };
  }

  const body = JSON.stringify({
    type: 'listuploader',
    conditionid: conditionId,
    value: String(value),
  });

  const url = `https://${API_HOST}/api_campus/segment/${endpoint}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_key: apiKey,
      },
      body,
    });

    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response — return raw
    }

    return {
      success: res.ok,
      status: res.status,
      message: parsed?.message || parsed?.error || (res.ok ? 'OK' : 'Request failed'),
      raw: text,
    };
  } catch (err) {
    return { success: false, status: 502, message: err.message, raw: null };
  }
}
