# Image Manager

Веб-застосунок для редагування зображень з обмеженням складності задачі, історією операцій і балансувальником запитів на рівні бекенда.

---

## Огляд функціоналу

- **Авторизація через JWT** (реєстрація/логін, токен зберігається у `localStorage` під ключами `image-manager-token` та `image-manager-user`).

- **Редактор фільтрів**: яскравість, контраст, насиченість, відтінки, сепія, ч/б, блюр. Для поточного параметра показується слайдер, а зміни фіксуються в історії.

- **Історія змін**: панель відображає останні 10 кроків; доступні кнопки `BACK` (undo) і `RESET`.

- **Обмеження складності** (`MAX_TASK_COMPLEXITY = 70`): перед створенням задачі фронтенд перевіряє сумарне відхилення фільтрів і блокує старт, якщо межа перевищена.

- **Черга на бекенді**: одночасно може виконуватись обмежена кількість задач (`MAX_ACTIVE_TASKS`, за замовчуванням 5). Надлишок ставиться в статус `queued` із повідомленням про позицію та приблизний час очікування.

- **Автоочищення**: задачі в стані `queued`/`running`, которыми не цікавився клієнт довше `STALE_TASK_TIMEOUT_SECONDS` (120 с), автоматично позначаються як `cancelled`/`failed`, щоб черга не зависала.

- **Прогрес-бар** показує %, етап (`Очікує запуску → Підготовка зображення → Застосування фільтрів → Фіналізація обробки → Обробка завершена`) та актуальну задачу.

- **Балансування навантаження**: HTTPS load balancer роздає запити round-robin між кількома application servers на HTTP-портах.

---

## Відповідність вимогам

1. **Максимальна складність задачі.** Перевірка на клієнті: `frontend/src/components/App/AppContainer.jsx` (функція startProcessingTask, змінні MAX_TASK_COMPLEXITY, calculateTaskComplexity з frontend/src/config/filters.js і frontend/src/utils/filters.js). При перевищенні показує помилку і не звертається до сервера.

2. **Інформування про хід виконання .** Клієнт: `AppContainer.jsx` (processingProgress, processingMessage, getProcessingStage, runProcessingInterval), UI в `frontend/src/components/App/ProcessingPanel.jsx`. Синхронізація статусів із бекендом через updateTask.

3. **Історія, стан, скасування, ліміт активних задач, зберігання в БД .** Бекенд: `backend/src/createApp.cjs` (черга, MAX_ACTIVE_TASKS, маршрути /api/tasks, /api/tasks/:id/cancel), дані в SQLite `backend/src/db.cjs`. Фронт: `AppContainer.jsx` (fetchTasks, cancelActiveTaskOnServer, TaskHistory).

4. **Авторизація по HTTPS.** `backend/src/load-balancer.cjs` підіймає HTTPS LB на 4000 і розподіляє round-robin на HTTP application servers (порти з APP_SERVER_PORTS), перевірка через /health.

5. **Балансування навантаження.** Файл `backend/src/load-balancer.cjs` підіймає HTTPS LB на 4000 і розподіляє round-robin на HTTP application servers (порти з APP_SERVER_PORTS), перевірка через /health.

6. **Черга та оцінка часу очікування .** Бекенд: `createApp.cjs` при перевищенні MAX_ACTIVE_TASKS повертає queued, queuePosition, estimatedWaitSeconds. Фронт: `AppContainer.jsx` обробляє queued, показує позицію й ETA.

---
## Схема
```
┌────────────────────────────────┐
│         Frontend (React)       │
│  • Авторизація                 │
│  • Редактор фільтрів           │
│  • Історія та прогрес          │
└───────────────-────────────────┘
                │ HTTPS
                │
┌────────────────────────────────┐
│        HTTPS Load Balancer     │
│  • Приймає всі зовнішні запити │
│  • Роздає їх round-robin       │
│    між backend-серверами       │
└───────────────-────────────────┘
                │ HTTP
                │
┌────────────────────────────────┐
│      Backend Application       │
│    Servers (app-1, app-2…)     │
│  • Express API                 │
│  • JWT-auth middleware         │
│  • Черга задач                 │
│  • Автоочищення задач          │
└───────────────-────────────────┘
                │
                │ SQLite 
                │
┌────────────────────────────────┐
│         SQLite Database        │
│        tasks.db + WAL          │
│  • users                       │
│  • tasks (queued, running…)    │
└────────────────────────────────┘
```
---
## Структура репозиторію

```
.
├─ package.json            # Скрипти для воркспейсів
├─ frontend/               # React + Vite клієнт
│  ├─ package.json
│  ├─ index.html
│  └─ src/
│     ├─ main.jsx
│     ├─ api/             # auth.js, tasks.js (fetch з JWT)
│     ├─ components/
│     │  └─ App/          # AppContainer + Layout + TopControls + ProcessingPanel + ImageWorkspace
│     ├─ config/filters.js
│     └─ utils/           # helpers для історії, фільтрів, blob URL тощо
└─ backend/                # HTTPS load balancer + Express app
   ├─ package.json
   └─ src/
      ├─ load-balancer.cjs  # HTTPS → HTTP round-robin
      ├─ index.cjs          # один процес без LB (debug)
      ├─ createApp.cjs      # маршрути auth/tasks, CORS, черга, очищення
      ├─ db.cjs             # ініціалізація SQLite (users, tasks)
      ├─ certs/             # self-signed TLS (server.crt/key)
      └─ tasks.db*          # WAL-файли з історією задач
```

---

## Налаштування та запуск

### 0. Встановлення

```bash
npm install   # виконується з кореня; ставить залежності frontend + backend
```

### 1. HTTPS-сертифікат

За замовчуванням backend шукає `backend/src/certs/server.crt` і `backend/src/certs/server.key`. Створити самопідписаний сертифікат:

```bash
mkdir -p backend/src/certs
openssl req -x509 -newkey rsa:2048 \
  -keyout backend/src/certs/server.key \
  -out backend/src/certs/server.crt \
  -days 365 -nodes -subj "/CN=localhost"
```

Додайте `.crt` у довірені сертифікати ОС/браузера або запускайте клієнт із прапорцем `--ignore-certificate-errors`.

### 2. Бекенд

```bash
# HTTPS load balancer + 2 application server-и
npm run backend:start
```

Корисні змінні:

- `APP_SERVER_PORTS="5001,5002,5003"` — порти HTTP-воркерів (мінімум два).
- `MAX_ACTIVE_TASKS=1` — ліміт одночасних задач на користувача (для демонстрації черги є готовий скрипт `npm run backend:start:max1`).
- `JWT_SECRET`, `JWT_EXPIRES_IN` — налаштування токена.
- `ALLOWED_ORIGINS` — whitelist для CORS.
- `STALE_TASK_TIMEOUT_SECONDS` — тайм-аут автоочищення черги.
- `CERT_PATH`, `KEY_PATH`, `PORT` — альтернативні шляхи/порт для LB.


### 3. Фронтенд

```bash
npm run frontend:dev
```

Клієнт дивиться на `https://localhost:4000/api`. Для іншого бекенда задайте `VITE_API_BASE` (через `.env` або `VITE_API_BASE=http://... npm run frontend:dev`).

### 4. Перевірка балансувальника

```bash
curl -k https://localhost:4000/health
```

У відповіді буде `serverId` (`app-1`, `app-2` ...). Повторні виклики показують round-robin.

---

## UX та поведінка клієнта

- **Авторизація.** Якщо немає токена — показується форма входу/реєстрації (`AuthPanel`). Після логіну дані зберігаються локально, а список задач підтягується з API.

- **Top controls.** Кнопки `UPLOAD`, `DELETE`, `BACK`, `RESET`. Завантаження приймає лише зображення, перевіряє розмір (≤5 MB), зберігає ім’я файлу і створює `blob:` URL.

- **Історія.** Кожна зміна слайдера, undo/redo чи відновлення зі списку створює запис через `createHistoryEntry`. Панель зберігає до 10 останніх кроків.

- **Прогрес.** Після запуску локальний таймер поступово піднімає `%` і синхронізує статус з API (`updateTask`). Коли обробка завершена, користувач може завантажити результат (формується новий `blob` через canvas).

- **Черга.** Якщо бекенд повернув `queued=true`, інтерфейс показує позицію/оцінку та кожні 5 секунд пробує активувати задачу (PATCH `/api/tasks/:id` → `running`). Якщо отримано 409 (ще не час) — повідомлення оновлюється.

- **Скасування.** Кнопка `Cancel` викликає `POST /api/tasks/:id/cancel`, очищає локальний стан і готує інтерфейс до нової задачі.

---

## Особливості бекенда

- **Токени.** Усі `/api/tasks*` маршрути проходять через middleware `authenticate`, який валідує JWT (`Authorization: Bearer ...`) і підвантажує користувача з SQLite.

- **Черга та складність.** Під час `POST /api/tasks` сервер перевіряє кількість активних задач поточного користувача. Якщо ліміт перевищено — записується `status='queued'`, повертається HTTP 202, позиція у черзі та `estimatedWaitSeconds`.

- **Автоочищення.** Кожен запит користувача викликає `cleanupStaleTasks`, що переводить давні `queued` у `cancelled`, а `running` у `failed`, звільняючи чергу.

- **Зберігання даних.** Таблиці `users` і `tasks` із зовнішнім ключем та індексами (див. `backend/src/db.cjs`). Файли WAL лежать у `backend/src/`.

---

## Корисні команди

| Команда                                 | Призначення                                   |
|-----------------------------------------|-----------------------------------------------|
| `npm run backend:start`                 | LB + кілька application server-ів             |
| `npm run backend:start:max1`            | Те саме, але `MAX_ACTIVE_TASKS=1`             |
| `npm run backend:start:single`          | Один HTTPS-сервер без балансування            |
| `npm run frontend:dev`                  | Vite dev server (http://localhost:5173)       |
| `npm run frontend:build`                | Збірка продакшн-версії                        |
| `curl -k https://localhost:4000/health` | Перевірка роботи балансувальника              |

---
