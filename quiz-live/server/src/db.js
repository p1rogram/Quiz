// db.js — слой данных: встроенный модуль node:sqlite (Node.js >= 22.5).
// Нативных зависимостей нет — ничего компилировать не нужно.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '..', 'quiz.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('organizer','participant')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quizzes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'Общие знания',
  rules             TEXT NOT NULL DEFAULT '',
  time_per_question INTEGER NOT NULL DEFAULT 20,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id    INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  ord        INTEGER NOT NULL,
  text       TEXT NOT NULL,
  image_url  TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL CHECK (type IN ('single','multi')),
  time_limit INTEGER,                -- NULL => берётся time_per_question квиза
  options    TEXT NOT NULL,          -- JSON: ["вариант 1", ...]
  correct    TEXT NOT NULL           -- JSON: [0,2] — индексы правильных вариантов
);
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id     INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score         INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  rank          INTEGER NOT NULL
);
`);

// Совместимая с better-sqlite3 обёртка транзакций: db.transaction(fn)(...args)
db.transaction = (fn) => (...args) => {
  db.exec('BEGIN');
  try { const result = fn(...args); db.exec('COMMIT'); return result; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

module.exports = db;
