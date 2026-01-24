import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSessions } from '../contexts/SessionContext';
import CreateSessionDialog from './CreateSessionDialog';

export default function Sidebar() {
  const { sessions } = useSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Extract current session ID from location
  const currentSessionId = location.pathname.startsWith('/session/')
    ? location.pathname.split('/')[2]
    : null;

  return (
    <>
      <div
        style={{
          width: collapsed ? '50px' : '280px',
          backgroundColor: '#2c3e50',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.3s ease',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '15px',
            borderBottom: '1px solid #34495e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {!collapsed && <h3 style={{ margin: 0 }}>Sessions</h3>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '5px',
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '☰' : '«'}
          </button>
        </div>

        {/* Create Session Button */}
        <div style={{ padding: '10px' }}>
          <button
            onClick={() => setShowCreateDialog(true)}
            disabled={collapsed}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: collapsed ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
            title={collapsed ? 'Create Session' : ''}
          >
            {collapsed ? '+' : 'Create Session'}
          </button>
        </div>

        {/* Session List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {sessions.length === 0 ? (
            !collapsed && (
              <p style={{ color: '#95a5a6', fontSize: '14px', textAlign: 'center' }}>
                No sessions
              </p>
            )
          ) : (
            sessions.map((session) => {
              const isActive = session.id === currentSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: isActive ? '#3498db' : '#34495e',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  title={collapsed ? session.metadata.name : ''}
                >
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {!collapsed && (
                      <>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          {session.metadata.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#95a5a6' }}>
                          {session.metadata.client_count} client{session.metadata.client_count !== 1 ? 's' : ''}
                        </div>
                      </>
                    )}
                    {collapsed && (
                      <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                        {session.metadata.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {isActive && !collapsed && (
                    <span style={{ marginLeft: '8px', color: '#ecf0f1' }}>●</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer - Home Link */}
        <div style={{ padding: '10px', borderTop: '1px solid #34495e' }}>
          <div
            onClick={() => navigate('/')}
            style={{
              padding: '10px',
              backgroundColor: location.pathname === '/' ? '#27ae60' : 'transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
            title={collapsed ? 'Session List' : ''}
          >
            {collapsed ? '☖' : 'Session List'}
          </div>
        </div>
      </div>

      {/* Create Session Dialog */}
      {showCreateDialog && <CreateSessionDialog onClose={() => setShowCreateDialog(false)} />}
    </>
  );
}
