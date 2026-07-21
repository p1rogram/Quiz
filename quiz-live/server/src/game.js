// game.js — real-time-логика квиза поверх Socket.IO.
// Сервер — единственный источник истины: он хранит состояние комнат,
// отсчитывает время вопроса и считает баллы; клиенты только отображают.
const db = require('./db');
const { verifyToken } = require('./auth');

const BASE_POINTS = 500;   // за правильный ответ
const SPEED_POINTS = 500;  // бонус за скорость (линейно от оставшегося времени)

const rooms = new Map(); // code -> состояние игры

const genCode = () => {
  let code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(code));
  return code;
};

const sortNum = (arr) => [...arr].sort((x, y) => x - y);
const sameSet = (a, b) => a.length === b.length && sortNum(a).every((v, i) => v === sortNum(b)[i]);

const playersList = (room) =>
  [...room.players.values()].map((p) => ({ id: p.userId, name: p.name, score: p.score }));

const leaderboard = (room) =>
  playersList(room).sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, ...p, correct: room.players.get(p.id).correct }));

function attachGame(io) {
  // Аутентификация сокета по JWT из handshake
  io.use((socket, next) => {
    const payload = verifyToken(socket.handshake.auth?.token || '');
    if (!payload) return next(new Error('unauthorized'));
    socket.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    // ---------- ОРГАНИЗАТОР ----------
    socket.on('host:start', ({ quizId }, ack) => {
      if (socket.user.role !== 'organizer') return ack?.({ error: 'Только организатор может запускать квиз' });
      const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ? AND owner_id = ?').get(quizId, socket.user.id);
      if (!quiz) return ack?.({ error: 'Квиз не найден' });
      const questions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY ord').all(quiz.id)
        .map((q) => ({ ...q, options: JSON.parse(q.options), correct: JSON.parse(q.correct) }));
      if (!questions.length) return ack?.({ error: 'В квизе нет вопросов — добавьте их в редакторе' });

      const code = genCode();
      rooms.set(code, {
        code, quiz, questions, hostSocket: socket.id,
        players: new Map(),        // userId -> {userId, name, score, correct, socketId, answer}
        index: -1,                 // номер текущего вопроса (-1 — лобби)
        phase: 'lobby',            // lobby | question | reveal | over
        timer: null, endsAt: 0,
      });
      socket.join(code);
      socket.roomCode = code;
      ack?.({ code, title: quiz.title, category: quiz.category, rules: quiz.rules, total: questions.length });
    });

    socket.on('host:next', (ack) => {
      const room = rooms.get(socket.roomCode);
      if (!room || room.hostSocket !== socket.id) return;
      if (room.phase === 'question') return; // вопрос ещё идёт
      if (room.index + 1 >= room.questions.length) return finishGame(io, room);

      room.index += 1;
      room.phase = 'question';
      const q = room.questions[room.index];
      const limit = (q.time_limit || room.quiz.time_per_question) * 1000;
      room.endsAt = Date.now() + limit;
      room.players.forEach((p) => { p.answer = null; });

      // Участникам вопрос уходит БЕЗ правильных ответов
      io.to(room.code).emit('game:question', {
        index: room.index, total: room.questions.length,
        text: q.text, image_url: q.image_url, type: q.type,
        options: q.options, endsAt: room.endsAt, limitMs: limit,
      });
      clearTimeout(room.timer);
      room.timer = setTimeout(() => closeQuestion(io, room), limit + 300); // +300мс на сетевую задержку
      ack?.({ ok: true });
    });

    socket.on('host:finish', () => {
      const room = rooms.get(socket.roomCode);
      if (room && room.hostSocket === socket.id) finishGame(io, room);
    });

    // ---------- УЧАСТНИК ----------
    socket.on('player:join', ({ code }, ack) => {
      const room = rooms.get(String(code || '').trim());
      if (!room || room.phase === 'over') return ack?.({ error: 'Комната не найдена или игра завершена' });
      if (room.hostSocket === socket.id) return ack?.({ error: 'Организатор уже ведёт эту игру' });

      const existing = room.players.get(socket.user.id);
      if (existing) existing.socketId = socket.id; // переподключение — счёт сохраняется
      else room.players.set(socket.user.id, {
        userId: socket.user.id, name: socket.user.name, score: 0, correct: 0, socketId: socket.id, answer: null,
      });
      socket.join(room.code);
      socket.roomCode = room.code;
      io.to(room.code).emit('room:players', playersList(room));
      ack?.({ ok: true, title: room.quiz.title, category: room.quiz.category, rules: room.quiz.rules, phase: room.phase });
    });

    socket.on('player:answer', ({ choice }, ack) => {
      const room = rooms.get(socket.roomCode);
      const player = room?.players.get(socket.user.id);
      if (!room || !player || room.phase !== 'question') return ack?.({ error: 'Приём ответов закрыт' });
      if (Date.now() > room.endsAt) return ack?.({ error: 'Время вышло' });
      if (player.answer) return ack?.({ error: 'Ответ уже принят' });

      const q = room.questions[room.index];
      const picked = [...new Set((Array.isArray(choice) ? choice : [choice]).map(Number))]
        .filter((c) => c >= 0 && c < q.options.length);
      if (!picked.length) return ack?.({ error: 'Выберите вариант' });
      player.answer = { picked, at: Date.now() };
      ack?.({ ok: true });
      io.to(room.hostSocket).emit('host:answered', {
        answered: [...room.players.values()].filter((p) => p.answer).length,
        total: room.players.size,
      });
      // Все ответили — закрываем вопрос досрочно
      if ([...room.players.values()].every((p) => p.answer)) closeQuestion(io, room);
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.roomCode);
      if (!room) return;
      if (room.hostSocket === socket.id) {
        // Ведущий ушёл — корректно завершаем игру с текущими результатами
        finishGame(io, room, true);
      } else {
        const p = [...room.players.values()].find((x) => x.socketId === socket.id);
        if (p && room.phase === 'lobby') room.players.delete(p.userId); // в лобби — убираем из списка
        io.to(room.code).emit('room:players', playersList(room));
      }
    });
  });
}

function closeQuestion(io, room) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  room.phase = 'reveal';
  const q = room.questions[room.index];
  const limit = (q.time_limit || room.quiz.time_per_question) * 1000;

  room.players.forEach((p) => {
    let gained = 0, isCorrect = false;
    if (p.answer && sameSet(p.answer.picked, q.correct)) {
      isCorrect = true;
      const remaining = Math.max(0, room.endsAt - p.answer.at);
      gained = BASE_POINTS + Math.round(SPEED_POINTS * (remaining / limit));
      p.score += gained;
      p.correct += 1;
    }
    io.to(p.socketId).emit('answer:result', { answered: !!p.answer, correct: isCorrect, gained, score: p.score, correctOptions: q.correct });
  });

  io.to(room.code).emit('game:reveal', {
    index: room.index, correct: q.correct,
    standings: leaderboard(room).slice(0, 5),
    isLast: room.index + 1 >= room.questions.length,
  });
}

function finishGame(io, room, hostLeft = false) {
  if (room.phase === 'over') return;
  if (room.phase === 'question') closeQuestion(io, room); // досчитать текущий вопрос
  room.phase = 'over';
  clearTimeout(room.timer);

  const board = leaderboard(room);
  // Сохраняем сессию и результаты в БД (если был показан хотя бы один вопрос)
  if (room.index >= 0) db.transaction(() => {
    const s = db.prepare("INSERT INTO sessions (quiz_id, code, finished_at) VALUES (?,?,datetime('now'))")
      .run(room.quiz.id, room.code);
    const ins = db.prepare('INSERT INTO results (session_id, user_id, score, correct_count, rank) VALUES (?,?,?,?,?)');
    board.forEach((p) => ins.run(s.lastInsertRowid, p.id, p.score, p.correct, p.rank));
  })();

  io.to(room.code).emit('game:over', { leaderboard: board, hostLeft, totalQuestions: room.questions.length });
  rooms.delete(room.code);
}

module.exports = { attachGame };
