import { useSessions } from '../contexts/SessionContext';
import { Link } from 'react-router-dom';

export default function SessionList() {
  const { sessions, loading, error, deleteSession } = useSessions();

  const handleDelete = async (sessionId: string, sessionName: string) => {
    if (confirm(`Are you sure you want to delete session "${sessionName}"?`)) {
      try {
        await deleteSession(sessionId);
      } catch (err) {
        console.error('Failed to delete session:', err);
      }
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Terminal Hub - Sessions</h1>

      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div>
          <p>No sessions found. Create your first session to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {sessions.map((session) => (
            <div key={session.id} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '15px' }}>
              <h3>{session.metadata.name}</h3>
              <p><strong>Session ID:</strong> {session.id}</p>
              <p><strong>Clients:</strong> {session.metadata.client_count}</p>
              <p><strong>Created:</strong> {new Date(session.metadata.created_at).toLocaleString()}</p>
              <p><strong>Last Activity:</strong> {new Date(session.metadata.last_activity_at).toLocaleString()}</p>
              {session.metadata.working_directory && (
                <p><strong>Working Directory:</strong> {session.metadata.working_directory}</p>
              )}
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                <Link
                  to={`/session/${session.id}`}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '4px',
                  }}
                >
                  Connect
                </Link>
                <button
                  onClick={() => handleDelete(session.id, session.metadata.name)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
