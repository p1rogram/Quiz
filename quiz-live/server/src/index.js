// index.js — точка входа сервера: Express (REST) + Socket.IO (real-time)
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const { router: authRouter } = require('./auth');
const apiRouter = require('./routes');
const { attachGame } = require('./game');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// В продакшене раздаём собранный клиент одним сервером
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
attachGame(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`QuizLive server: http://localhost:${PORT}`));
