import { useState } from 'react';
import './App.css';

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [dockerfile, setDockerfile] = useState(''); // Naya state Dockerfile ke liye

  const handleGenerate = async () => {
    if (!repoUrl) {
      alert('Bhai, pehle GitHub URL toh daal do!');
      return;
    }

    setLoading(true);
    setStatus('Cloning repo, analyzing, and generating Dockerfile using AI... Please wait.');
    setDockerfile(''); // Purani file clear kar rahe hain

    try {
      const response = await fetch('http://localhost:3000/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repoUrl }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('Success! AI generated the Dockerfile.');
        setDockerfile(data.dockerfile); // State me Dockerfile set kar di
      } else {
        setStatus('Error: ' + data.error);
      }
    } catch (error) {
      setStatus('Failed to connect to the backend. Make sure the Node server is running.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      <h1>🐳 DockerForge</h1>
      <p>AI-Powered Dockerfile Generator</p>

      <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
        <input
          type="url"
          placeholder="Paste public GitHub repository URL..."
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          style={{ width: '400px', padding: '12px', fontSize: '16px', borderRadius: '5px', border: '1px solid #ccc' }}
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px'
          }}
        >
          {loading ? 'Processing...' : 'Generate Dockerfile'}
        </button>
      </div>

      {status && (
        <div style={{ marginTop: '20px', fontSize: '18px', fontWeight: 'bold', color: status.includes('Error') ? 'red' : 'green' }}>
          {status}
        </div>
      )}

      {/* Ye naya section hai generated Dockerfile ko display karne ke liye */}
      {dockerfile && (
        <div style={{ marginTop: '30px', textAlign: 'left', display: 'inline-block', width: '80%', maxWidth: '800px' }}>
          <h3>Generated Dockerfile:</h3>
          <pre style={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            padding: '20px',
            borderRadius: '8px',
            overflowX: 'auto',
            fontSize: '14px',
            lineHeight: '1.5'
          }}>
            <code>{dockerfile}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;