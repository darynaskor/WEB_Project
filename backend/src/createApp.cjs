const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db.cjs');

function mapTask(row) {
  return {
    id: row.id,
    status: row.status,
    progress: row.progress,
    complexity: row.complexity,
    filters: JSON.parse(row.filters || '[]'),
    imageName: row.image_name,
    resultSummary: row.result_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
  };
}

function mapUser(row) {
  return row
    ? {
        id: row.id,
        email: row.email,
        createdAt: row.created_at,
      }
    : null;
}

function createApp() {
  const jwtSecret = process.env.JWT_SECRET || 'change-me-super-secret';
  const tokenExpiry = '2h';


  const MAX_TASKS_STORED = 100;                     
  const MAX_ACTIVE_TASKS = Number(process.env.MAX_ACTIVE_TASKS || 2);   
  const MAX_USER_TASKS = Number(process.env.MAX_USER_TASKS || 50);      
  const MAX_TASK_COMPLEXITY = Number(process.env.MAX_TASK_COMPLEXITY || 100); 

  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(bodyParser.json({ limit: '10mb' }));

  function signToken(user) {
    return jwt.sign({ id: user.id, email: user.email }, jwtSecret, {
      expiresIn: tokenExpiry,
    });
  }

  function authenticate(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: 'Потрібна авторизація.' });
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      const userStmt = db.prepare(
        'SELECT id, email, created_at FROM users WHERE id = ?'
      );
      const user = userStmt.get(payload.id);
      if (!user) {
        return res.status(401).json({ error: 'Користувача не знайдено.' });
      }
      req.user = mapUser(user);
      next();
    } catch (error) {
      console.error('JWT error', error);
      return res.status(401).json({ error: 'Недійсний токен.' });
    }
  }

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });


  app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res
        .status(400)
        .json({ error: 'Email та пароль є обовʼязковими.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Некоректний email.' });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Пароль має містити щонайменше 6 символів.' });
    }

    const findStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existing = findStmt.get(trimmedEmail);
    if (existing) {
      return res
        .status(409)
        .json({ error: 'Користувач із таким email вже існує.' });
    }

    const now = new Date().toISOString();
    const passwordHash = bcrypt.hashSync(password, 10);
    const insertStmt = db.prepare(`
      INSERT INTO users (email, password_hash, created_at)
      VALUES (@email, @passwordHash, @createdAt)
    `);
    const info = insertStmt.run({
      email: trimmedEmail,
      passwordHash,
      createdAt: now,
    });

    const selectStmt = db.prepare(
      'SELECT id, email, created_at FROM users WHERE id = ?'
    );
    const user = mapUser(selectStmt.get(info.lastInsertRowid));
    const token = signToken(user);
    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res
        .status(400)
        .json({ error: 'Email та пароль є обовʼязковими.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const selectStmt = db.prepare(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = ?'
    );
    const userRow = selectStmt.get(trimmedEmail);
    if (!userRow) {
      return res.status(401).json({ error: 'Невірний email або пароль.' });
    }

    const passwordOk = bcrypt.compareSync(password, userRow.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Невірний email або пароль.' });
    }

    const user = mapUser(userRow);
    const token = signToken(user);
    res.json({ user, token });
  });

  app.get('/api/tasks', authenticate, (req, res) => {
    const stmt = db.prepare(`
      SELECT id, status, progress, complexity, filters, image_name, result_summary, error_message, created_at, updated_at
      FROM tasks
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(req.user.id, MAX_TASKS_STORED);
    res.json({ tasks: rows.map(mapTask) });
  });

  app.post('/api/tasks', authenticate, (req, res) => {
    const { filters, complexity, imageName } = req.body || {};

    if (!Array.isArray(filters) || typeof complexity !== 'number') {
      return res.status(400).json({ error: 'Невірні дані задачі.' });
    }

    if (!Number.isFinite(complexity) || complexity < 0) {
      return res.status(400).json({ error: 'Некоректна складність задачі.' });
    }

    if (complexity > MAX_TASK_COMPLEXITY) {
      return res.status(400).json({
        error: `Складність задачі (${complexity}) перевищує максимальне значення ${MAX_TASK_COMPLEXITY}.`,
      });
    }

    const activeCountStmt = db.prepare(
      `SELECT COUNT(*) AS cnt FROM tasks WHERE user_id = ? AND status = 'running'`
    );
    const { cnt: activeCount } = activeCountStmt.get(req.user.id);
    if (activeCount >= MAX_ACTIVE_TASKS) {
      return res.status(429).json({
        error: `Досягнуто ліміт активних задач (${MAX_ACTIVE_TASKS}). Дочекайтеся завершення поточних задач.`,
      });
    }

    const totalCountStmt = db.prepare(
      `SELECT COUNT(*) AS cnt FROM tasks WHERE user_id = ?`
    );
    const { cnt: totalCount } = totalCountStmt.get(req.user.id);
    if (totalCount >= MAX_USER_TASKS) {
      return res.status(429).json({
        error: `Досягнуто ліміт збережених задач (${MAX_USER_TASKS}). Видаліть старі записи або зверніться до адміністратора.`,
      });
    }

    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO tasks (status, progress, complexity, filters, image_name, result_summary, result_data, error_message, created_at, updated_at, user_id)
      VALUES (@status, @progress, @complexity, @filters, @imageName, @resultSummary, @resultData, @errorMessage, @createdAt, @updatedAt, @userId)
    `);

    const info = insertStmt.run({
      status: 'running',
      progress: 0,
      complexity,
      filters: JSON.stringify(filters),
      imageName: imageName || null,
      resultSummary: null,
      resultData: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      userId: req.user.id,
    });

    const taskStmt = db.prepare(`
      SELECT id, status, progress, complexity, filters, image_name, result_summary, error_message, created_at, updated_at
      FROM tasks
      WHERE id = ? AND user_id = ?
    `);
    const task = taskStmt.get(info.lastInsertRowid, req.user.id);
    res.status(201).json({ task: mapTask(task) });
  });

  app.patch('/api/tasks/:id', authenticate, (req, res) => {
    const id = Number(req.params.id);
    if (!id) {
      return res
        .status(400)
        .json({ error: 'Некоректний ідентифікатор задачі.' });
    }

    const { status, progress, resultSummary, errorMessage } = req.body || {};

    const selectStmt = db.prepare(
      `SELECT * FROM tasks WHERE id = ? AND user_id = ?`
    );
    const existing = selectStmt.get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Задачу не знайдено.' });
    }

    const nextStatus = status || existing.status;
    const nextProgress =
      typeof progress === 'number'
        ? Math.max(0, Math.min(100, progress))
        : existing.progress;
    const nextSummary =
      typeof resultSummary === 'string'
        ? resultSummary
        : existing.result_summary;
    const nextError =
      typeof errorMessage === 'string'
        ? errorMessage
        : existing.error_message;

    const allowedStatuses = new Set([
      'running',
      'completed',
      'cancelled',
      'failed',
    ]);
    if (!allowedStatuses.has(nextStatus)) {
      return res.status(400).json({ error: 'Некоректний статус задачі.' });
    }

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE tasks
      SET status = @status,
          progress = @progress,
          result_summary = @resultSummary,
          error_message = @errorMessage,
          updated_at = @updatedAt
      WHERE id = @id AND user_id = @userId
    `);

    updateStmt.run({
      id,
      status: nextStatus,
      progress: nextProgress,
      resultSummary: nextSummary,
      errorMessage: nextError,
      updatedAt: now,
      userId: req.user.id,
    });

    const findStmt = db.prepare(`
      SELECT id, status, progress, complexity, filters, image_name, result_summary, error_message, created_at, updated_at
      FROM tasks
      WHERE id = ? AND user_id = ?
    `);

    const updated = findStmt.get(id, req.user.id);
    res.json({ task: mapTask(updated) });
  });

  app.post('/api/tasks/:id/cancel', authenticate, (req, res) => {
    const id = Number(req.params.id);
    if (!id) {
      return res
        .status(400)
        .json({ error: 'Некоректний ідентифікатор задачі.' });
    }

    const selectStmt = db.prepare(
      `SELECT * FROM tasks WHERE id = ? AND user_id = ?`
    );
    const existing = selectStmt.get(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Задачу не знайдено.' });
    }

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return res.status(409).json({ error: 'Задача вже завершена.' });
    }

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE tasks
      SET status = 'cancelled',
          progress = CASE WHEN progress < 100 THEN progress ELSE 100 END,
          updated_at = @updatedAt
      WHERE id = @id AND user_id = @userId
    `);

    updateStmt.run({ id, updatedAt: now, userId: req.user.id });

    const findStmt = db.prepare(`
      SELECT id, status, progress, complexity, filters, image_name, result_summary, error_message, created_at, updated_at
      FROM tasks
      WHERE id = ? AND user_id = ?
    `);

    const updated = findStmt.get(id, req.user.id);
    res.json({ task: mapTask(updated) });
  });


  app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не знайдено.' });
  });

  return app;
}

module.exports = { createApp };