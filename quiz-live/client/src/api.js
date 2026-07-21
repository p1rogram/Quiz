// api.js — общий доступ к REST API, хранение токена, фабрика сокета
import { io } from 'socket.io-client';

export const auth = {
  get token() { return localStorage.getItem('token'); },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  save({ token, user }) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); },
};

export async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

// Один сокет на игровой экран; создаётся при входе в игру, закрывается при выходе
export const createSocket = () => io('/', { auth: { token: auth.token } });
