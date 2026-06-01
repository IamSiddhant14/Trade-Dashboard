const toIntervalsUrl = (url) => {
  const trimmed = url.replace(/\/$/, '')
  return trimmed.endsWith('/intervals') ? trimmed : `${trimmed}/intervals`
}

const readBody = async (request) => {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, OPTIONS')
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const backendUrl = process.env.MARKET_HTTP_URL
  if (!backendUrl) {
    response.statusCode = 500
    response.end(JSON.stringify({ error: 'MARKET_HTTP_URL is not configured' }))
    return
  }

  try {
    const upstreamResponse = await fetch(toIntervalsUrl(backendUrl), {
      method: request.method,
      headers: request.method === 'POST'
        ? { 'Content-Type': 'application/json' }
        : undefined,
      body: request.method === 'POST' ? await readBody(request) : undefined,
    })
    const body = await upstreamResponse.text()

    response.statusCode = upstreamResponse.status
    response.setHeader(
      'Content-Type',
      upstreamResponse.headers.get('content-type') ?? 'application/json',
    )
    response.end(body)
  } catch {
    response.statusCode = 502
    response.end(JSON.stringify({ error: 'Unable to reach market backend' }))
  }
}
