const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { createApp } = require('./createApp.cjs');

const CERT_PATH = process.env.CERT_PATH || path.join(__dirname, 'certs', 'server.crt');
const KEY_PATH = process.env.KEY_PATH || path.join(__dirname, 'certs', 'server.key');

if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  console.error('SSL сертифікат або ключ не знайдено. Задайте CERT_PATH і KEY_PATH або створіть certs/server.crt та certs/server.key');
  process.exit(1);
}

const APP_SERVER_PORTS = process.env.APP_SERVER_PORTS
  ? process.env.APP_SERVER_PORTS.split(',').map((value) => Number(value.trim())).filter(Boolean)
  : [5001, 5002];

if (APP_SERVER_PORTS.length < 2) {
  console.error('Для балансування необхідно мінімум два порти у APP_SERVER_PORTS.');
  process.exit(1);
}

const HTTPS_PORT = Number(process.env.PORT || 4000);
let currentIndex = 0;

const appServers = APP_SERVER_PORTS.map((port, index) => {
  const serverId = `app-${index + 1}`;
  const app = createApp({ serverId });
  const server = http.createServer(app);
  server.listen(port, () => {
    console.log(`[${serverId}] listening on http://localhost:${port}`);
  });
  return { port, serverId, target: { host: 'localhost', port } };
});

const httpsOptions = {
  key: fs.readFileSync(KEY_PATH),
  cert: fs.readFileSync(CERT_PATH),
};

const httpsServer = https.createServer(httpsOptions, (req, res) => {
  const target = appServers[currentIndex];
  currentIndex = (currentIndex + 1) % appServers.length;
  forwardRequest(target, req, res);
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`Load balancer listening on https://localhost:${HTTPS_PORT}/api`);
  console.log(`Forwarding requests round-robin to: ${appServers.map((s) => `http://${s.target.host}:${s.target.port}`).join(', ')}`);
});

function forwardRequest(target, clientReq, clientRes) {
  const options = {
    hostname: target.target.host,
    port: target.target.port,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: `${target.target.host}:${target.target.port}`,
      'x-forwarded-host': clientReq.headers.host,
      'x-app-server-id': target.serverId,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (error) => {
    console.error(`[${target.serverId}] Proxy error:`, error);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
    }
    clientRes.end(JSON.stringify({ error: 'Сервер тимчасово недоступний. Спробуйте пізніше.' }));
  });

  clientReq.pipe(proxyReq, { end: true });
}

process.on('SIGINT', () => {
  console.log('\nShutting down load balancer...');
  httpsServer.close();
  appServers.forEach(({ serverId, port, server }) => {
    server.close(() => console.log(`[${serverId}] stopped (port ${port})`));
  });
  setTimeout(() => process.exit(0), 200);
});
