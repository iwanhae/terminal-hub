import React, { useState } from 'react';
import { useSessions } from '../contexts/SessionContext';

interface CreateSessionDialogProps {
  onClose: () => void;
}

export default function CreateSessionDialog({ onClose }: CreateSessionDialogProps) {
  const { createSession } = useSessions();
  const [name, setName] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [command, setCommand] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      // Parse environment variables from "KEY=VALUE" format (one per line)
      const envVarsMap: Record<string, string> = {};
      if (envVars.trim()) {
        envVars.split('\n').forEach((line) => {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            envVarsMap[key.trim()] = valueParts.join('=').trim();
          }
        });
      }

      const sessionId = await createSession(
        name.trim(),
        workingDirectory.trim() || undefined,
        command.trim() || undefined,
        Object.keys(envVarsMap).length > 0 ? envVarsMap : undefined
      );

      // Navigate to the new session
      window.location.href = `/session/${sessionId}`;
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '8px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Create New Session</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Session Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px',
                boxSizing: 'border-box',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              placeholder="My Development Session"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Working Directory (optional)
            </label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                boxSizing: 'border-box',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              placeholder="/home/user/projects"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Initial Command (optional)
            </label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                boxSizing: 'border-box',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              placeholder="npm run dev"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Environment Variables (optional)
            </label>
            <textarea
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                boxSizing: 'border-box',
                border: '1px solid #ccc',
                borderRadius: '4px',
                minHeight: '100px',
                fontFamily: 'monospace',
              }}
              placeholder="NODE_ENV=development&#10;API_URL=http://localhost:3000"
            />
            <small style={{ color: '#666' }}>One variable per line in KEY=VALUE format</small>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
