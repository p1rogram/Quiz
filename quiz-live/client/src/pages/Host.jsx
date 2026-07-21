import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSocket } from '../api.js';
import { Countdown, Leaderboard, QuestionCard } from '../components/Game.jsx';

export default function Host() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null);        // {code, title, total, ...}
  const [players, setPlayers] = useState([]);
  const [phase, setPhase] = useState('lobby');   // lobby | question | reveal | over
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(0);
  const [standings, setStandings] = useState([]);
  const [final, setFinal] = useState(null);
  const [isLast, setIsLast] = useState(false);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    socket.on('connect_error', () => setError('Не удалось подключиться. Войдите заново.'));
    socket.emit('host:start', { quizId: Number(quizId) }, (res) => {
      if (res?.error) setError(res.error);
      else setRoom(res);
    });
    socket.on('room:players', setPlayers);
    socket.on('game:question', (q) => { setQuestion(q); setPhase('question'); setAnswered(0); });
    socket.on('host:answered', ({ answered: a }) => setAnswered(a));
    socket.on('game:reveal', ({ standings: s, isLast: last, correct }) => {
      setPhase('reveal'); setStandings(s); setIsLast(last);
      setQuestion((q) => (q ? { ...q, reveal: correct } : q));
    });
    socket.on('game:over', ({ leaderboard }) => { setPhase('over'); setFinal(leaderboard); });
    return () => socket.disconnect();
  }, [quizId]);

  const next = () => socketRef.current.emit('host:next', () => {});
  const finish = () => socketRef.current.emit('host:finish');

  if (error) return (
    <div className="center-screen">
      <div className="error">{error}</div>
      <button className="btn" onClick={() => navigate('/dashboard')}>← В кабинет</button>
    </div>
  );
  if (!room) return <div className="empty">Создаём комнату…</div>;

  return (
    <div className="host-screen">
      <div className="host-head">
        <div>
          <div className="muted">{room.category} · {room.total} вопросов</div>
          <h1>{room.title}</h1>
        </div>
        <div className="room-code">
          <div className="muted">Код комнаты</div>
          <div className="code">{room.code}</div>
        </div>
      </div>

      {phase === 'lobby' && (
        <div className="panel center">
          <h2>Ожидание участников</h2>
          {room.rules && <p className="muted">Правила: {room.rules}</p>}
          <div className="players-chips">
            {players.length === 0 ? <span className="muted">Пока никто не подключился — продиктуйте код комнаты</span>
              : players.map((p) => <span className="chip" key={p.id}>{p.name}</span>)}
          </div>
          <button className="btn primary lg" onClick={next} disabled={players.length === 0}>
            Начать квиз ({players.length} участн.)
          </button>
        </div>
      )}

      {phase === 'question' && question && (
        <>
          <Countdown endsAt={question.endsAt} limitMs={question.limitMs} />
          <QuestionCard q={question} disabled />
          <div className="panel center muted">Ответили: {answered} из {players.length}</div>
        </>
      )}

      {phase === 'reveal' && question && (
        <>
          <QuestionCard q={question} reveal={question.reveal} disabled />
          <Leaderboard rows={standings} title="Промежуточные результаты (топ-5)" />
          <div className="row center">
            {!isLast && <button className="btn primary lg" onClick={next}>Следующий вопрос →</button>}
            <button className={`btn lg ${isLast ? 'primary' : 'ghost'}`} onClick={finish}>
              {isLast ? 'Показать итоги 🏁' : 'Завершить досрочно'}
            </button>
          </div>
        </>
      )}

      {phase === 'over' && final && (
        <>
          <Leaderboard rows={final} title="🏆 Итоговый лидерборд" />
          <div className="row center">
            <button className="btn primary" onClick={() => navigate('/dashboard')}>В кабинет — результаты сохранены</button>
          </div>
        </>
      )}
    </div>
  );
}
