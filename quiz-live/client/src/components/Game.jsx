import { useEffect, useState } from 'react';

// Обратный отсчёт, синхронизированный с серверным endsAt
export function Countdown({ endsAt, limitMs }) {
  const [left, setLeft] = useState(Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 100);
    return () => clearInterval(t);
  }, [endsAt]);
  const pct = limitMs ? (left / limitMs) * 100 : 0;
  return (
    <div className="countdown">
      <div className="countdown-bar" style={{ width: `${pct}%`, background: pct < 25 ? 'var(--red)' : 'var(--accent)' }} />
      <span className="countdown-num">{Math.ceil(left / 1000)}</span>
    </div>
  );
}

const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank);

export function Leaderboard({ rows, meId, title = 'Лидерборд' }) {
  return (
    <div className="leaderboard">
      <h2>{title}</h2>
      {rows.length === 0 ? <div className="empty">Пока нет участников</div> : rows.map((p) => (
        <div className={`lb-row${p.id === meId ? ' me' : ''}${p.rank === 1 ? ' first' : ''}`} key={p.id}>
          <span className="lb-rank">{medal(p.rank)}</span>
          <span className="lb-name">{p.name}</span>
          {p.correct !== undefined && <span className="lb-correct muted">{p.correct} верно</span>}
          <span className="lb-score">{p.score}</span>
        </div>
      ))}
    </div>
  );
}

const OPTION_COLORS = ['#FF5D73', '#3E8EFF', '#2EC27E', '#B36BFF', '#FFA23E', '#22C3DD'];

// Карточка вопроса. selectable=true — для участника; reveal — показать правильные
export function QuestionCard({ q, picked = [], onToggle, reveal = null, disabled = false }) {
  return (
    <div className="question-card">
      <div className="q-meta">Вопрос {q.index + 1} из {q.total}{q.type === 'multi' && ' · выберите все подходящие'}</div>
      <h2 className="q-text">{q.text}</h2>
      {q.image_url && <img className="q-image" src={q.image_url} alt="Иллюстрация к вопросу" />}
      <div className="options">
        {q.options.map((opt, i) => {
          const isPicked = picked.includes(i);
          const isCorrect = reveal?.includes(i);
          const cls = ['option', isPicked && 'picked', reveal && (isCorrect ? 'correct' : isPicked ? 'wrong' : 'faded')]
            .filter(Boolean).join(' ');
          return (
            <button key={i} className={cls} style={{ '--opt': OPTION_COLORS[i % OPTION_COLORS.length] }}
              onClick={() => !disabled && !reveal && onToggle?.(i)} disabled={disabled || !!reveal}>
              <span className="option-letter">{String.fromCharCode(65 + i)}</span>
              <span>{opt}</span>
              {reveal && isCorrect && <span className="option-mark">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
