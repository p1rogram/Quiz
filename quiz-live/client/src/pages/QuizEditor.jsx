import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';

const emptyQuestion = () => ({ text: '', image_url: '', type: 'single', time_limit: '', options: ['', ''], correct: [] });

export default function QuizEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api('/categories'), api(`/quizzes/${id}`)])
      .then(([cats, q]) => {
        setCategories(cats);
        setQuiz(q);
        setQuestions(q.questions.length ? q.questions.map((x) => ({ ...x, time_limit: x.time_limit || '' })) : [emptyQuestion()]);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const setQ = (patch) => setQuiz({ ...quiz, ...patch });
  const setQuestion = (i, patch) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const toggleCorrect = (i, optIdx) => {
    const q = questions[i];
    const correct = q.type === 'single'
      ? [optIdx]
      : q.correct.includes(optIdx) ? q.correct.filter((c) => c !== optIdx) : [...q.correct, optIdx];
    setQuestion(i, { correct });
  };

  const setOption = (i, optIdx, value) => {
    const opts = [...questions[i].options]; opts[optIdx] = value;
    setQuestion(i, { options: opts });
  };
  const addOption = (i) => questions[i].options.length < 6 && setQuestion(i, { options: [...questions[i].options, ''] });
  const removeOption = (i, optIdx) => {
    const q = questions[i];
    if (q.options.length <= 2) return;
    setQuestion(i, {
      options: q.options.filter((_, j) => j !== optIdx),
      correct: q.correct.filter((c) => c !== optIdx).map((c) => (c > optIdx ? c - 1 : c)),
    });
  };
  const moveQuestion = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions]; [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  };

  const save = async () => {
    setError(''); setSaved(false);
    try {
      await api(`/quizzes/${id}`, { method: 'PUT', body: quiz });
      await api(`/quizzes/${id}/questions`, { method: 'PUT', body: { questions } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e.message); }
  };

  if (!quiz) return <div className="empty">{error || 'Загрузка…'}</div>;

  return (
    <>
      <div className="page-head">
        <h1>Редактор квиза</h1>
        <div className="row">
          <button className="btn ghost" onClick={() => navigate('/dashboard')}>← Назад</button>
          <button className="btn primary" onClick={save}>Сохранить</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {saved && <div className="ok">Сохранено ✓</div>}

      <div className="panel stack">
        <label>Название
          <input value={quiz.title} onChange={(e) => setQ({ title: e.target.value })} />
        </label>
        <div className="row wrap">
          <label>Категория
            <select value={quiz.category} onChange={(e) => setQ({ category: e.target.value })}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Время на вопрос (сек, по умолчанию)
            <input type="number" min={5} max={300} value={quiz.time_per_question}
              onChange={(e) => setQ({ time_per_question: e.target.value })} />
          </label>
        </div>
        <label>Правила проведения (участники увидят их в лобби)
          <textarea rows={2} value={quiz.rules} onChange={(e) => setQ({ rules: e.target.value })}
            placeholder="Например: отвечайте быстро — за скорость начисляется бонус" />
        </label>
      </div>

      <h2>Вопросы ({questions.length})</h2>
      {questions.map((q, i) => (
        <div className="panel question-panel" key={i}>
          <div className="row space">
            <strong>Вопрос {i + 1}</strong>
            <div className="row">
              <button className="btn ghost sm" onClick={() => moveQuestion(i, -1)} disabled={i === 0}>↑</button>
              <button className="btn ghost sm" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1}>↓</button>
              <button className="btn danger sm" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                disabled={questions.length === 1}>Удалить</button>
            </div>
          </div>
          <label>Текст вопроса
            <textarea rows={2} value={q.text} onChange={(e) => setQuestion(i, { text: e.target.value })} />
          </label>
          <div className="row wrap">
            <label>Изображение (URL, необязательно)
              <input value={q.image_url} onChange={(e) => setQuestion(i, { image_url: e.target.value })}
                placeholder="https://…/image.jpg" />
            </label>
            <label>Тип ответа
              <select value={q.type} onChange={(e) => setQuestion(i, { type: e.target.value, correct: q.correct.slice(0, e.target.value === 'single' ? 1 : undefined) })}>
                <option value="single">Один правильный</option>
                <option value="multi">Несколько правильных</option>
              </select>
            </label>
            <label>Время (сек, пусто = общее)
              <input type="number" min={5} max={300} value={q.time_limit}
                onChange={(e) => setQuestion(i, { time_limit: e.target.value })} />
            </label>
          </div>
          {q.image_url && <img className="q-image preview" src={q.image_url} alt="" onError={(e) => { e.target.style.display = 'none'; }} onLoad={(e) => { e.target.style.display = ''; }} />}
          <div className="muted sm-text">Отметьте правильные варианты галочкой:</div>
          {q.options.map((opt, oi) => (
            <div className="option-row" key={oi}>
              <input type="checkbox" checked={q.correct.includes(oi)} onChange={() => toggleCorrect(i, oi)} title="Правильный ответ" />
              <input className="grow" value={opt} onChange={(e) => setOption(i, oi, e.target.value)} placeholder={`Вариант ${oi + 1}`} />
              <button className="btn ghost sm" onClick={() => removeOption(i, oi)} disabled={q.options.length <= 2}>✕</button>
            </div>
          ))}
          <button className="btn ghost sm" onClick={() => addOption(i)} disabled={q.options.length >= 6}>+ Вариант</button>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={() => setQuestions([...questions, emptyQuestion()])}>+ Добавить вопрос</button>
        <button className="btn primary" onClick={save}>Сохранить квиз</button>
      </div>
    </>
  );
}
