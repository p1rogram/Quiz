import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

// StrictMode отключён сознательно: двойной вызов эффектов в dev-режиме
// создавал бы по два WebSocket-подключения на игровых экранах.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
