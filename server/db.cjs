const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'tasks.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL,
    complexity INTEGER NOT NULL,
    filters TEXT NOT NULL,
    image_name TEXT,
    result_summary TEXT,
    result_data TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  );
`);

const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
const hasUserId = taskColumns.some((col) => col.name === 'user_id');
if (!hasUserId) {
  db.exec('ALTER TABLE tasks ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id);
`);

module.exports = db;
