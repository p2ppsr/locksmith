const http = require('http')
const httpProxy = require('http-proxy')

const TARGET_PORT = 8088
const LISTEN_PORT = 3321

const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${TARGET_PORT}`,
  changeOrigin: true,
  selfHandleResponse: true
})

const server = http.createServer((req, res) => {
  console.log(`➡️  Incoming request on ${LISTEN_PORT}, proxying to ${TARGET_PORT}: ${req.url}`)

  // Inject Origin header if missing
  if (!req.headers.origin) {
    req.headers.origin = 'http://localhost:8090'
  }

  proxy.web(req, res, {}, (err) => {
    console.error(`❌ Proxy error: ${err.message}`)
    res.writeHead(502)
    res.end('Proxy error')
  })
})

proxy.on('proxyRes', (proxyRes, req, res) => {
  let body = ''
  proxyRes.on('data', chunk => (body += chunk.toString()))
  proxyRes.on('end', () => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    res.end(body)
  })
})

server.listen(LISTEN_PORT, () => {
  console.log(`✅ Proxy listening on ${LISTEN_PORT}, forwarding to ${TARGET_PORT}`)
})
