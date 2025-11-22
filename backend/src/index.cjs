const fs = require('fs');
const path = require('path');
const https = require('https');
const { createApp } = require('./createApp.cjs');

const PORT = Number(process.env.PORT || 4000);

const CERT_PATH = process.env.CERT_PATH || path.join(__dirname, 'certs', 'server.crt');
const KEY_PATH = process.env.KEY_PATH || path.join(__dirname, 'certs', 'server.key');

if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  console.error('\nSSL сертифікат або ключ не знайдено.\n' +
                '   Створіть certs/server.crt і certs/server.key або вкажіть свої шляхи:\n' +
                '   CERT_PATH=/path/to/crt KEY_PATH=/path/to/key\n');
  process.exit(1);
}

const app = createApp();

const httpsOptions = {
  key: fs.readFileSync(KEY_PATH),
  cert: fs.readFileSync(CERT_PATH),
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`\nBackend server running at: https://localhost:${PORT}/api\n`);
});
