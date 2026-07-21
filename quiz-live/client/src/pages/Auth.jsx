import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../api.js';

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // login | register
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'participant' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: form });
      auth.save(data);
      navigate('/dashboard');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="logo big">Quiz<span>Live</span></div>
        <p className="muted">Онлайн-квизы в реальном времени</p>

        <div className="tabs">
          <button className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>Вход</button>
          <button className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => setMode('register')}>Регистрация</button>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <label>Имя
              <input value={form.name} onChange={set('name')} placeholder="Как вас показывать в лидерборде" required />
            </label>
          )}
          <label>Почта
            <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </label>
          <label>Пароль
            <input type="password" value={form.password} onChange={set('password')} placeholder="Не короче 6 символов" required minLength={6} />
          </label>
          {mode === 'register' && (
            <div className="role-pick">
              <button type="button" className={form.role === 'participant' ? 'role active' : 'role'}
                onClick={() => setForm({ ...form, role: 'participant' })}>
                <strong>Участник</strong><span>Прохожу квизы по коду комнаты</span>
              </button>
              <button type="button" className={form.role === 'organizer' ? 'role active' : 'role'}
                onClick={() => setForm({ ...form, role: 'organizer' })}>
                <strong>Организатор</strong><span>Создаю и провожу квизы</span>
              </button>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  );
}
