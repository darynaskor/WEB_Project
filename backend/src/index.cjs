const fs = require('fs');
const path = require('path');
const https = require('https');
const { createApp } = require('./createApp.cjs');

const PORT = Number(process.env.PORT || 4000);
const CERT_PATH = process.env.CERT_PATH || path.join(__dirname, 'certs', 'server.crt');
const KEY_PATH = process.env.KEY_PATH || path.join(__dirname, 'certs', 'server.key');

if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  console.error('SSL сертифікат або ключ не знайдено. Задайте CERT_PATH і KEY_PATH або створіть certs/server.crt та certs/server.key');
  process.exit(1);
}

const app = createApp({ serverId: process.env.APP_SERVER_ID || 'app-single' });

const httpsOptions = {
  key: fs.readFileSync(KEY_PATH),
  cert: fs.readFileSync(CERT_PATH),
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`Task API listening on https://localhost:${PORT}/api`);
});
