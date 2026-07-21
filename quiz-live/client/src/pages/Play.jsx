import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auth, createSocket } from '../api.js';
import { Countdown, Leaderboard, QuestionCard } from '../components/Game.jsx';

export default function Play() {
  const { code } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);        // {title, rules, ...}
  const [players, setPlayers] = useState([]);
  const [phase, setPhase] = useState('lobby');   // lobby | question | waiting | reveal | over
  const [question, setQuestion] = useState(null);
  const [picked, setPicked] = useState([]);
  const [result, setResult] = useState(null);    // {correct, gained, score}
  const [score, setScore] = useState(0);
  const [final, setFinal] = useState(null);
  const [hostLeft, setHostLeft] = useState(false);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    socket.on('connect_error', () => setError('Не удалось подключиться. Войдите заново.'));
    socket.emit('player:join', { code }, (res) => {
      if (res?.error) setError(res.error);
      else setInfo(res);
    });
    socket.on('room:players', setPlayers);
    socket.on('game:question', (q) => {
      setQuestion(q); setPicked([]); setResult(null); setPhase('question');
    });
    socket.on('answer:result', (r) => { setResult(r); setScore(r.score); });
    socket.on('game:reveal', ({ correct }) => {
      setPhase('reveal');
      setQuestion((q) => (q ? { ...q, reveal: correct } : q));
    });
    socket.on('game:over', ({ leaderboard, hostLeft: hl }) => {
      setPhase('over'); setFinal(leaderboard); setHostLeft(!!hl);
    });
    return () => socket.disconnect();
  }, [code]);

  const toggle = (i) => {
    if (question.type === 'single') {
      // одиночный выбор — отправляем сразу, скорость даёт бонус
      setPicked([i]);
      send([i]);
    } else {
      setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
    }
  };

  const send = (choice = picked) => {
    if (!choice.length) return;
    setPhase('waiting');
    socketRef.current.emit('player:answer', { choice }, (res) => {
      if (res?.error) { setError(res.error); setPhase('question'); }
    });
  };

  if (error && !info) return (
    <div className="center-screen">
      <div className="error">{error}</div>
      <button className="btn" onClick={() => navigate('/dashboard')}>← В кабинет</button>
    </div>
  );
  if (!info) return <div className="empty">Подключаемся к комнате {code}…</div>;

  const me = auth.user;
  return (
    <div className="play-screen">
      <div className="play-head">
        <div><div className="muted">{info.category}</div><h1>{info.title}</h1></div>
        <div className="score-pill">⭐ {score}</div>
      </div>
      {error && <div className="error">{error}</div>}

      {phase === 'lobby' && (
        <div className="panel center">
          <h2>Вы в игре! Ждём старта…</h2>
          {info.rules && <p className="muted">Правила: {info.rules}</p>}
          <div className="players-chips">
            {players.map((p) => <span className={`chip${p.id === me?.id ? ' me' : ''}`} key={p.id}>{p.name}</span>)}
          </div>
        </div>
      )}

      {(phase === 'question' || phase === 'waiting') && question && (
        <>
          <Countdown endsAt={question.endsAt} limitMs={question.limitMs} />
          <QuestionCard q={question} picked={picked} onToggle={toggle} disabled={phase === 'waiting'} />
          {phase === 'question' && question.type === 'multi' && (
            <button className="btn primary lg full" onClick={() => send()} disabled={!picked.length}>
              Ответить ({picked.length} выбрано)
            </button>
          )}
          {phase === 'waiting' && <div className="panel center muted">Ответ принят — ждём остальных…</div>}
        </>
      )}

      {phase === 'reveal' && question && (
        <>
          <QuestionCard q={question} picked={picked} reveal={question.reveal} disabled />
          {result && result.answered ? (
            <div className={`panel center ${result.correct ? 'ok' : 'error'}`}>
              {result.correct ? `Верно! +${result.gained} баллов` : 'Увы, неверно'} · всего: {result.score}
            </div>
          ) : (
            <div className="panel center error">Время вышло — ответ не засчитан</div>
          )}
        </>
      )}

      {phase === 'over' && final && (
        <>
          {hostLeft && <div className="error">Организатор завершил игру</div>}
          <Leaderboard rows={final} meId={me?.id} title="🏆 Итоговый лидерборд" />
          <div className="row center">
            <button className="btn primary" onClick={() => navigate('/dashboard')}>В кабинет — результат сохранён</button>
          </div>
        </>
      )}
    </div>
  );
}
