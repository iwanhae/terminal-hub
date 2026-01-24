import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './contexts/SessionContext';
import Sidebar from './components/Sidebar';
import SessionList from './pages/SessionList';
import TerminalPage from './pages/TerminalPage';
import { Toaster } from 'react-hot-toast';
import './App.css';

function App() {
  return (
    <SessionProvider>
      <Router>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <Sidebar />
          <main style={{ flex: 1, overflow: 'auto' }}>
            <Routes>
              <Route path="/" element={<SessionList />} />
              <Route path="/session/:sessionId" element={<TerminalPage />} />
            </Routes>
          </main>
        </div>
        <Toaster position="top-right" />
      </Router>
    </SessionProvider>
  );
}

export default App;
