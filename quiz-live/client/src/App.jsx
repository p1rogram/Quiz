import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { auth } from './api.js';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import QuizEditor from './pages/QuizEditor.jsx';
import Host from './pages/Host.jsx';
import Play from './pages/Play.jsx';

function Layout({ children }) {
  const navigate = useNavigate();
  const user = auth.user;
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/dashboard" className="logo">Quiz<span>Live</span></Link>
        {user && (
          <div className="topbar-user">
            <span className="badge">{user.role === 'organizer' ? 'Организатор' : 'Участник'}</span>
            <span className="username">{user.name}</span>
            <button className="btn ghost sm" onClick={() => { auth.clear(); navigate('/login'); }}>Выйти</button>
          </div>
        )}
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

const Private = ({ children }) => (auth.token ? <Layout>{children}</Layout> : <Navigate to="/login" replace />);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={auth.token ? <Navigate to="/dashboard" replace /> : <Auth />} />
      <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
      <Route path="/edit/:id" element={<Private><QuizEditor /></Private>} />
      <Route path="/host/:quizId" element={<Private><Host /></Private>} />
      <Route path="/play/:code" element={<Private><Play /></Private>} />
      <Route path="*" element={<Navigate to={auth.token ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
