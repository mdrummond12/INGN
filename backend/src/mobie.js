const API_HOST = process.env.API_HOST || 'mobileorderprodapi.transactcampus.com';
const API_KEY = process.env.API_KEY || '';

const ALLOWED_ENDPOINTS = new Set(['adduser', 'removeuser']);

/**
 * Call the Mobie Ordering segment endpoint with the server-side API key.
 * Returns a SegmentResult-shaped object (matches the GraphQL type).
 */
export async function callMobieSegment(endpoint, { conditionId, value }) {
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return { success: false, status: 400, message: `Endpoint not allowed: ${endpoint}`, raw: null };
  }
  if (!API_KEY) {
    return { success: false, status: 500, message: 'API_KEY not configured on server', raw: null };
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
        api_key: API_KEY,
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
