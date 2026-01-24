import { useParams, useNavigate } from 'react-router-dom';
import TerminalComponent from '../components/Terminal';

export default function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  if (!sessionId) {
    // Redirect to home if no session ID
    navigate('/');
    return null;
  }

  // Determine WebSocket URL based on current protocol
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const wsUrl = `${protocol}${window.location.host}/ws/${sessionId}`;

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <TerminalComponent wsUrl={wsUrl} />
    </div>
  );
}
