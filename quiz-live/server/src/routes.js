// routes.js — REST API: квизы, вопросы, история, статистика
const express = require('express');
const db = require('./db');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['Общие знания', 'Наука', 'История', 'География', 'Кино и музыка', 'Спорт', 'Технологии', 'Литература'];
router.get('/categories', (_req, res) => res.json(CATEGORIES));

const ownQuiz = (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz || quiz.owner_id !== req.user.id) { res.status(404).json({ error: 'Квиз не найден' }); return null; }
  return quiz;
};

const parseQ = (q) => ({ ...q, options: JSON.parse(q.options), correct: JSON.parse(q.correct) });

// --- Квизы (организатор) ---
router.get('/quizzes', requireRole('organizer'), (req, res) => {
  const rows = db.prepare(`
    SELECT q.*, COUNT(qs.id) AS question_count
    FROM quizzes q LEFT JOIN questions qs ON qs.quiz_id = q.id
    WHERE q.owner_id = ? GROUP BY q.id ORDER BY q.created_at DESC`).all(req.user.id);
  res.json(rows);
});

router.post('/quizzes', requireRole('organizer'), (req, res) => {
  const { title, category, rules, time_per_question } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'Укажите название квиза' });
  const t = Math.min(300, Math.max(5, parseInt(time_per_question, 10) || 20));
  const info = db.prepare('INSERT INTO quizzes (owner_id, title, category, rules, time_per_question) VALUES (?,?,?,?,?)')
    .run(req.user.id, title.trim(), CATEGORIES.includes(category) ? category : CATEGORIES[0], rules || '', t);
  res.json(db.prepare('SELECT * FROM quizzes WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/quizzes/:id', requireRole('organizer'), (req, res) => {
  const quiz = ownQuiz(req, res); if (!quiz) return;
  const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY ord').all(quiz.id).map(parseQ);
  res.json({ ...quiz, questions });
});

router.put('/quizzes/:id', requireRole('organizer'), (req, res) => {
  const quiz = ownQuiz(req, res); if (!quiz) return;
  const { title, category, rules, time_per_question } = req.body || {};
  const t = Math.min(300, Math.max(5, parseInt(time_per_question, 10) || quiz.time_per_question));
  db.prepare('UPDATE quizzes SET title = ?, category = ?, rules = ?, time_per_question = ? WHERE id = ?')
    .run(title?.trim() || quiz.title, CATEGORIES.includes(category) ? category : quiz.category, rules ?? quiz.rules, t, quiz.id);
  res.json(db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quiz.id));
});

router.delete('/quizzes/:id', requireRole('organizer'), (req, res) => {
  const quiz = ownQuiz(req, res); if (!quiz) return;
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id);
  res.json({ ok: true });
});

// Полная замена списка вопросов квиза (одним запросом из редактора)
router.put('/quizzes/:id/questions', requireRole('organizer'), (req, res) => {
  const quiz = ownQuiz(req, res); if (!quiz) return;
  const list = Array.isArray(req.body?.questions) ? req.body.questions : null;
  if (!list) return res.status(400).json({ error: 'Ожидается массив questions' });

  for (const [i, q] of list.entries()) {
    const opts = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
    const correct = Array.isArray(q.correct) ? [...new Set(q.correct.map(Number))].filter((c) => c >= 0 && c < opts.length) : [];
    if (!q.text?.trim()) return res.status(400).json({ error: `Вопрос ${i + 1}: пустой текст` });
    if (opts.length < 2) return res.status(400).json({ error: `Вопрос ${i + 1}: минимум 2 варианта ответа` });
    if (!correct.length) return res.status(400).json({ error: `Вопрос ${i + 1}: отметьте правильный ответ` });
    if (q.type === 'single' && correct.length > 1) return res.status(400).json({ error: `Вопрос ${i + 1}: для одиночного выбора допустим один правильный ответ` });
    q._norm = { opts, correct };
  }

  db.transaction(() => {
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quiz.id);
    const ins = db.prepare('INSERT INTO questions (quiz_id, ord, text, image_url, type, time_limit, options, correct) VALUES (?,?,?,?,?,?,?,?)');
    list.forEach((q, i) => ins.run(quiz.id, i, q.text.trim(), q.image_url?.trim() || '',
      q.type === 'multi' ? 'multi' : 'single',
      q.time_limit ? Math.min(300, Math.max(5, parseInt(q.time_limit, 10))) : null,
      JSON.stringify(q._norm.opts), JSON.stringify(q._norm.correct)));
  })();
  res.json({ ok: true, count: list.length });
});

// --- Личный кабинет ---
// Участник: история и статистика
router.get('/history', (req, res) => {
  const rows = db.prepare(`
    SELECT r.score, r.correct_count, r.rank, s.started_at, s.finished_at, s.code,
           q.title, q.category,
           (SELECT COUNT(*) FROM results r2 WHERE r2.session_id = s.id) AS players
    FROM results r JOIN sessions s ON s.id = r.session_id JOIN quizzes q ON q.id = s.quiz_id
    WHERE r.user_id = ? ORDER BY s.started_at DESC`).all(req.user.id);
  const stats = {
    games: rows.length,
    wins: rows.filter((r) => r.rank === 1).length,
    avg_score: rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0,
    best_score: rows.length ? Math.max(...rows.map((r) => r.score)) : 0,
  };
  res.json({ history: rows, stats });
});

// Организатор: история проведённых сессий и статистика по каждому квизу
router.get('/my-sessions', requireRole('organizer'), (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.code, s.started_at, s.finished_at, q.title, q.category, q.id AS quiz_id,
           COUNT(r.id) AS players, COALESCE(ROUND(AVG(r.score)), 0) AS avg_score, COALESCE(MAX(r.score), 0) AS top_score
    FROM sessions s JOIN quizzes q ON q.id = s.quiz_id LEFT JOIN results r ON r.session_id = s.id
    WHERE q.owner_id = ? GROUP BY s.id ORDER BY s.started_at DESC`).all(req.user.id);
  res.json(rows);
});

router.get('/sessions/:id/results', (req, res) => {
  const session = db.prepare(`
    SELECT s.*, q.title, q.owner_id FROM sessions s JOIN quizzes q ON q.id = s.quiz_id WHERE s.id = ?`).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
  const results = db.prepare(`
    SELECT r.rank, r.score, r.correct_count, u.name FROM results r JOIN users u ON u.id = r.user_id
    WHERE r.session_id = ? ORDER BY r.rank`).all(session.id);
  const isOwner = session.owner_id === req.user.id;
  if (!isOwner && !db.prepare('SELECT 1 FROM results WHERE session_id = ? AND user_id = ?').get(session.id, req.user.id))
    return res.status(403).json({ error: 'Нет доступа к этой сессии' });
  res.json({ title: session.title, started_at: session.started_at, results });
});

module.exports = router;
