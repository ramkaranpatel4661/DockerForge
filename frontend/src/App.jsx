import { useState } from 'react';
import './App.css';

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!repoUrl) {
      alert('Bhai, pehle GitHub URL toh daal do!');
      return;
    }

    setLoading(true);
    setStatus('Cloning repository and scanning files... Please wait.');

    try {
      // Backend ko POST request bhej rahe hain
      const response = await fetch('http://localhost:3000/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repoUrl }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('Success! Repository cloned successfully.');
        console.log("Extracted File Tree from Backend:", data.files);
        alert('Check the Browser Console (F12) to see the file structure!');
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
        <div style={{ marginTop: '30px', fontSize: '18px', fontWeight: 'bold', color: status.includes('Error') ? 'red' : 'green' }}>
          {status}
        </div>
      )}
    </div>
  );
}

export default App;