import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../api.js';

const fmt = (iso) => (iso ? new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function StatCards({ items }) {
  return (
    <div className="stat-grid">
      {items.map(([label, value]) => (
        <div className="stat-card" key={label}><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
      ))}
    </div>
  );
}

function OrganizerDashboard() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');

  const load = () => Promise.all([api('/quizzes'), api('/my-sessions')])
    .then(([q, s]) => { setQuizzes(q); setSessions(s); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const createQuiz = async () => {
    const title = prompt('Название нового квиза:');
    if (!title?.trim()) return;
    try { const q = await api('/quizzes', { method: 'POST', body: { title } }); navigate(`/edit/${q.id}`); }
    catch (e) { setError(e.message); }
  };

  const removeQuiz = async (id) => {
    if (!confirm('Удалить квиз вместе с вопросами?')) return;
    try { await api(`/quizzes/${id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); }
  };

  const totalPlayers = sessions.reduce((a, s) => a + s.players, 0);
  return (
    <>
      <div className="page-head">
        <h1>Мои квизы</h1>
        <button className="btn primary" onClick={createQuiz}>+ Новый квиз</button>
      </div>
      {error && <div className="error">{error}</div>}
      <StatCards items={[['Квизов', quizzes.length], ['Проведено игр', sessions.length], ['Всего участников', totalPlayers]]} />

      {quizzes.length === 0 ? (
        <div className="empty">Пока нет ни одного квиза. Создайте первый — это займёт пару минут.</div>
      ) : (
        <div className="quiz-grid">
          {quizzes.map((q) => (
            <div className="quiz-card" key={q.id}>
              <div className="quiz-cat">{q.category}</div>
              <h3>{q.title}</h3>
              <div className="muted">{q.question_count} вопр. · {q.time_per_question} с на вопрос</div>
              <div className="row">
                <button className="btn primary sm" disabled={!q.question_count} title={q.question_count ? '' : 'Сначала добавьте вопросы'}
                  onClick={() => navigate(`/host/${q.id}`)}>Запустить</button>
                <button className="btn ghost sm" onClick={() => navigate(`/edit/${q.id}`)}>Изменить</button>
                <button className="btn danger sm" onClick={() => removeQuiz(q.id)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>История проведённых игр</h2>
      {sessions.length === 0 ? <div className="empty">Проведите первую игру — статистика появится здесь.</div> : (
        <table className="table">
          <thead><tr><th>Квиз</th><th>Код</th><th>Дата</th><th>Участников</th><th>Средний балл</th><th>Лучший балл</th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}><td>{s.title}</td><td className="mono">{s.code}</td><td>{fmt(s.started_at)}</td>
                <td>{s.players}</td><td>{s.avg_score}</td><td>{s.top_score}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function ParticipantDashboard() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [data, setData] = useState({ history: [], stats: { games: 0, wins: 0, avg_score: 0, best_score: 0 } });
  const [error, setError] = useState('');
  useEffect(() => { api('/history').then(setData).catch((e) => setError(e.message)); }, []);

  const join = (e) => {
    e.preventDefault();
    if (code.trim().length === 6) navigate(`/play/${code.trim()}`);
    else setError('Код комнаты состоит из 6 цифр');
  };

  const s = data.stats;
  return (
    <>
      <div className="join-hero">
        <h1>Подключиться к квизу</h1>
        <p className="muted">Введите код комнаты, который показывает организатор</p>
        <form className="join-form" onSubmit={join}>
          <input className="code-input" value={code} maxLength={6} inputMode="numeric"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
          <button className="btn primary lg">Войти в игру</button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>

      <h2>Моя статистика</h2>
      <StatCards items={[['Сыграно игр', s.games], ['Побед', s.wins], ['Средний балл', s.avg_score], ['Лучший результат', s.best_score]]} />

      <h2>История участия</h2>
      {data.history.length === 0 ? <div className="empty">Вы ещё не участвовали в квизах. Введите код комнаты выше!</div> : (
        <table className="table">
          <thead><tr><th>Квиз</th><th>Категория</th><th>Дата</th><th>Место</th><th>Баллы</th><th>Верных ответов</th></tr></thead>
          <tbody>
            {data.history.map((h, i) => (
              <tr key={i}><td>{h.title}</td><td>{h.category}</td><td>{fmt(h.started_at)}</td>
                <td>{h.rank === 1 ? '🏆 1' : h.rank} из {h.players}</td><td>{h.score}</td><td>{h.correct_count}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function Dashboard() {
  return auth.user?.role === 'organizer' ? <OrganizerDashboard /> : <ParticipantDashboard />;
}
