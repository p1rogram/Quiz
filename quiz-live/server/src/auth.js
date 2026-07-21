// auth.js — регистрация, вход, JWT
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const router = express.Router();

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });
const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, SECRET, { expiresIn: '7d' });

router.post('/register', (req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!email || !name || !password || !['organizer', 'participant'].includes(role))
    return res.status(400).json({ error: 'Заполните все поля и выберите роль' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  try {
    const info = db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,?)')
      .run(email.trim().toLowerCase(), name.trim(), bcrypt.hashSync(password, 10), role);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Эта почта уже зарегистрирована' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = email && db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Неверная почта или пароль' });
  res.json({ token: sign(user), user: publicUser(user) });
});

// --- middleware и утилиты ---
function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

function requireAuth(req, res, next) {
  const payload = verifyToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  if (!payload) return res.status(401).json({ error: 'Требуется авторизация' });
  req.user = payload;
  next();
}

const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'Недостаточно прав' });

router.get('/me', requireAuth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u) return res.status(401).json({ error: 'Пользователь не найден' });
  res.json({ user: publicUser(u) });
});

module.exports = { router, requireAuth, requireRole, verifyToken };
