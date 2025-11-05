# HTTPS сертифікат

Сервер очікує наявність приватного ключа (`server.key`) та сертифіката (`server.crt`).
Їх можна згенерувати так:

```bash
openssl req -x509 -newkey rsa:2048 \\
  -keyout server/certs/server.key \\
  -out server/certs/server.crt \\
  -days 365 -nodes -subj "/CN=localhost"
```

Після генерації додайте сертифікат до довірених у вашій ОС/браузері.
