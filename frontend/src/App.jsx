import { useState } from 'react';
import './App.css';

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState(''); // 'info', 'success', 'warning', 'error'
  const [loading, setLoading] = useState(false);
  const [dockerfile, setDockerfile] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!repoUrl) {
      alert('Bhai, pehle GitHub URL toh daal do!');
      return;
    }

    setLoading(true);
    setStatus('Cloning repo, analyzing repository, and generating Dockerfile using AI... Please wait.');
    setStatusType('info');
    setDockerfile('');
    setCopied(false);

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
        setDockerfile(data.dockerfile);
        if (data.buildSuccess) {
          setStatus('Success! AI generated the Dockerfile and local Docker build succeeded.');
          setStatusType('success');
        } else if (data.dockerRunning === false) {
          setStatus(data.message || 'Dockerfile generated successfully! Local build was skipped because Docker daemon is offline. Please start Docker Desktop.');
          setStatusType('warning');
        } else {
          setStatus('Dockerfile generated, but local Docker build failed. AI attempted fixes. Error log: ' + (data.error || 'Build failure'));
          setStatusType('error');
        }
      } else {
        setStatus('Error: ' + (data.error || 'Failed to generate Dockerfile.'));
        setStatusType('error');
      }
    } catch (error) {
      setStatus('Failed to connect to the backend. Make sure the Node server is running.');
      setStatusType('error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (dockerfile) {
      navigator.clipboard.writeText(dockerfile);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderAlert = () => {
    if (!status) return null;

    let icon = 'ℹ️';
    let title = 'Information';
    let className = 'alert-info';

    if (statusType === 'success') {
      icon = '✅';
      title = 'Success';
      className = 'alert-success';
    } else if (statusType === 'warning') {
      icon = '⚠️';
      title = 'System Warning';
      className = 'alert-warning';
    } else if (statusType === 'error') {
      icon = '❌';
      title = 'Process Error';
      className = 'alert-error';
    }

    return (
      <div className={`alert-box ${className}`}>
        <span className="alert-icon">{icon}</span>
        <div className="alert-content">
          <div className="alert-title">{title}</div>
          <div>{status}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="title-section">
        <h1>🐳 DockerForge</h1>
        <p className="subtitle">AI-Powered Dockerfile Generator & Validator</p>
      </div>

      <div className="input-container">
        <input
          type="url"
          className="repo-input"
          placeholder="Paste public GitHub repository URL (e.g., https://github.com/user/repo)..."
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
        />
        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Generate Dockerfile'}
        </button>
      </div>

      {renderAlert()}

      {dockerfile && (
        <div className="dockerfile-section">
          <div className="dockerfile-header">
            <h3 className="dockerfile-title">
              🐳 Generated Dockerfile
            </h3>
            <button className="copy-btn" onClick={handleCopy}>
              {copied ? '✅ Copied!' : '📋 Copy Content'}
            </button>
          </div>
          <pre className="dockerfile-pre">
            <code className="dockerfile-code">{dockerfile}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;