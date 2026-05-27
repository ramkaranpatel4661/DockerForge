import { useState } from 'react';
import './App.css';

const LOADING_STEPS = [
  { id: 'clone',    label: 'Cloning GitHub repository...' },
  { id: 'analyze',  label: 'Analyzing file structure & dependencies...' },
  { id: 'generate', label: 'Generating Dockerfile with AI...' },
  { id: 'validate', label: 'Building & validating Docker image...' },
];

function App() {
  const [repoUrl, setRepoUrl]       = useState('');
  const [urlError, setUrlError]     = useState('');
  const [status, setStatus]         = useState('');
  const [statusType, setStatusType] = useState('');
  const [loading, setLoading]       = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [dockerfile, setDockerfile] = useState('');
  const [copied, setCopied]         = useState(false);
  const [attempts, setAttempts]     = useState(null);

  // Simple client-side GitHub URL check matching backend logic
  const validateUrl = (url) => {
    try {
      const parsed = new URL(url.trim());
      if (parsed.hostname !== 'github.com') return false;
      const parts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
      return parts.length >= 2;
    } catch {
      return false;
    }
  };

  const handleUrlChange = (e) => {
    setRepoUrl(e.target.value);
    if (urlError) setUrlError('');
  };

  const handleGenerate = async () => {
    if (!repoUrl.trim()) {
      setUrlError('Please enter a GitHub repository URL.');
      return;
    }
    if (!validateUrl(repoUrl)) {
      setUrlError('Invalid URL. Use the format: https://github.com/owner/repo');
      return;
    }

    setUrlError('');
    setLoading(true);
    setLoadingStep(0);
    setStatus('');
    setDockerfile('');
    setCopied(false);
    setAttempts(null);

    // Simulate progressive step indicators while the real request is in flight
    const stepTimers = [
      setTimeout(() => setLoadingStep(1), 3000),
      setTimeout(() => setLoadingStep(2), 7000),
      setTimeout(() => setLoadingStep(3), 12000),
    ];

    try {
      const apiHost = window.location.origin.includes('localhost:5173')
        ? 'http://localhost:3000'
        : '';

      const response = await fetch(`${apiHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setDockerfile(data.dockerfile);
        if (data.attempts != null) setAttempts(data.attempts);

        if (data.buildSuccess) {
          setStatus('Dockerfile generated and Docker build + container verification passed successfully.');
          setStatusType('success');
        } else if (data.dockerRunning === false) {
          setStatus(
            data.message ||
            'Dockerfile generated. Local build validation was skipped because Docker Desktop is not running.'
          );
          setStatusType('warning');
        } else {
          setStatus(
            `Dockerfile generated, but the Docker build could not be fully verified after ${data.attempts ?? 3} repair attempt(s). ` +
            'Error: ' + (data.error || 'Build or runtime failure.')
          );
          setStatusType('error');
        }
      } else {
        setStatus('Error: ' + (data.error || 'Failed to generate Dockerfile.'));
        setStatusType('error');
      }
    } catch (err) {
      setStatus('Could not reach the backend server. Ensure the Node.js server is running.');
      setStatusType('error');
      console.error(err);
    } finally {
      stepTimers.forEach(clearTimeout);
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!dockerfile) return;
    navigator.clipboard.writeText(dockerfile);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!dockerfile) return;
    const blob = new Blob([dockerfile], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'Dockerfile';
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderAlert = () => {
    if (!status) return null;
    const config = {
      info:    { icon: 'ℹ️', title: 'Information',   cls: 'alert-info'    },
      success: { icon: '✅', title: 'Success',        cls: 'alert-success' },
      warning: { icon: '⚠️', title: 'System Warning', cls: 'alert-warning' },
      error:   { icon: '❌', title: 'Process Error',  cls: 'alert-error'   },
    };
    const { icon, title, cls } = config[statusType] || config.info;
    return (
      <div className={`alert-box ${cls}`}>
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
        <h1>
          <span className="logo-emoji">🐳</span>{' '}
          <span className="gradient-text">DockerForge</span>
        </h1>
        <p className="subtitle">AI-Powered Dockerfile Generator &amp; Validator</p>
      </div>

      <div className="input-container">
        <div className="input-wrapper">
          <input
            id="repo-url-input"
            type="url"
            className={`repo-input${urlError ? ' repo-input--error' : ''}`}
            placeholder="Paste a public GitHub repository URL (e.g., https://github.com/user/repo)"
            value={repoUrl}
            onChange={handleUrlChange}
            disabled={loading}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleGenerate()}
          />
          {urlError && <p className="input-error">{urlError}</p>}
        </div>
        <button
          id="generate-btn"
          className="generate-btn"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Generate Dockerfile'}
        </button>
      </div>

      {loading && (
        <div className="loading-steps">
          {LOADING_STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`loading-step ${
                index < loadingStep  ? 'step-done'    :
                index === loadingStep ? 'step-active'  : 'step-pending'
              }`}
            >
              <span className="step-dot">
                {index < loadingStep ? '✓' : index === loadingStep ? '' : ''}
              </span>
              <span className="step-label">{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {renderAlert()}

      {dockerfile && (
        <div className="dockerfile-section">
          <div className="dockerfile-header">
            <h3 className="dockerfile-title">
              🐳 Generated Dockerfile
              {attempts != null && (
                <span className="attempts-badge">
                  {attempts === 1 ? 'Generated in 1 attempt' : `Self-repaired in ${attempts} attempts`}
                </span>
              )}
            </h3>
            <div className="action-buttons">
              <button id="copy-btn" className="copy-btn" onClick={handleCopy}>
                {copied ? '✅ Copied!' : '📋 Copy'}
              </button>
              <button id="download-btn" className="download-btn" onClick={handleDownload}>
                ⬇ Download
              </button>
            </div>
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