const DEFAULT_MAINNET = 'https://api.predict.fun';
const DEFAULT_TESTNET = 'https://api-testnet.predict.fun';
const ETH_RE = /^0x[0-9a-fA-F]{40}$/;

function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extraHeaders,
  })) {
    res.setHeader(key, value);
  }
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function isAllowedPath(path, query) {
  if (typeof path !== 'string') return false;

  // 查询持仓
  if (/^\/v1\/positions\/0x[0-9a-fA-F]{40}$/.test(path)) return true;

  // 查询最近成交
  if (path === '/v1/orders/matches') {
    const signerAddress = query.signerAddress;
    if (!signerAddress) return true;
    return ETH_RE.test(String(signerAddress));
  }

  return false;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  try {
    const network = req.query.network === 'testnet' ? 'testnet' : 'mainnet';
    const path = String(req.query.path || '');

    if (!isAllowedPath(path, req.query)) {
      return send(res, 400, { error: 'Invalid or unsupported Predict API path' });
    }

    const base = network === 'testnet'
      ? (process.env.PREDICT_TESTNET_API_BASE || DEFAULT_TESTNET)
      : (process.env.PREDICT_API_BASE || DEFAULT_MAINNET);

    const apiKey = network === 'testnet'
      ? (process.env.PREDICT_TESTNET_API_KEY || process.env.PREDICT_API_KEY || '')
      : (process.env.PREDICT_API_KEY || '');

    if (network === 'mainnet' && !apiKey && base === DEFAULT_MAINNET) {
      return send(res, 500, {
        error: 'Missing PREDICT_API_KEY. Set it in Vercel Project Settings → Environment Variables, then redeploy.',
      });
    }

    const target = new URL(path, base.replace(/\/$/, '') + '/');

    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path' || key === 'network') continue;

      if (Array.isArray(value)) {
        for (const v of value) target.searchParams.append(key, v);
      } else if (value !== undefined && value !== null && value !== '') {
        target.searchParams.set(key, String(value));
      }
    }

    const headers = { Accept: 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers,
    });

    const text = await upstream.text();

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  } catch (err) {
    send(res, 500, {
      error: err?.message || 'Predict proxy failed',
    });
  }
};
