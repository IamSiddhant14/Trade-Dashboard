const http = require('http')
const net = require('net')

const PUBLIC_PORT = Number(process.env.PORT ?? 10000)
const BACKEND_HTTP_PORT = Number(process.env.BACKEND_HTTP_PORT ?? 3000)
const BACKEND_WS_PORT = Number(process.env.BACKEND_WS_PORT ?? 8080)

if (process.env.SKIP_BACKEND_START !== '1') {
  require('./socket-backend/index.js')
}

const proxyHttp = (request, response) => {
  if (request.url === '/' || request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }

  const upstreamRequest = http.request(
    {
      hostname: '127.0.0.1',
      port: BACKEND_HTTP_PORT,
      path: request.url,
      method: request.method,
      headers: request.headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    },
  )

  upstreamRequest.on('error', () => {
    response.writeHead(502, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Unable to reach backend HTTP server' }))
  })

  request.pipe(upstreamRequest)
}

const server = http.createServer(proxyHttp)

server.on('upgrade', (request, socket, head) => {
  const upstreamSocket = net.connect(BACKEND_WS_PORT, '127.0.0.1', () => {
    upstreamSocket.write(
      `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n` +
        Object.entries(request.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n') +
        '\r\n\r\n',
    )
    if (head.length > 0) upstreamSocket.write(head)
    socket.pipe(upstreamSocket).pipe(socket)
  })

  upstreamSocket.on('error', () => socket.destroy())
})

server.listen(PUBLIC_PORT, () => {
  console.log(`Render proxy listening on http://localhost:${PUBLIC_PORT}`)
  console.log(`Proxying HTTP to http://localhost:${BACKEND_HTTP_PORT}`)
  console.log(`Proxying WebSocket to ws://localhost:${BACKEND_WS_PORT}`)
})
