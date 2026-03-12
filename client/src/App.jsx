import { useState, useRef, useEffect } from 'react';

const DEFAULT_PARAMS = { tone: 'professional', length: 'standard', focus: 'technical' };
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function App() {
  const [resumeText, setResumeText] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [jobPosting, setJobPosting] = useState('');
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [companyName, setCompanyName] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [letter, setLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const outputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (letter && outputRef.current) outputRef.current.focus();
  }, [letter]);

  async function handleFile(file) {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large. Maximum size is 5MB.');
      return;
    }

    setError('');
    setUploading(true);
    setResumeFileName(file.name);
    fileInputRef.current.value = '';

    const form = new FormData();
    form.append('resume', file);

    try {
      const res = await fetch('/api/parse-resume', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse resume');
      setResumeText(data.text);
    } catch (err) {
      setError(err.message.includes('fetch') ? 'Could not reach server. Is it running?' : err.message);
      setResumeFileName('');
      setResumeText('');
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e) { handleFile(e.target.files[0]); }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onParam(key, val) { setParams(p => ({ ...p, [key]: val })); }

  async function generate() {
    if (!resumeText || !jobPosting.trim()) {
      setError('Please upload a resume and paste a job posting.');
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError('');
    setLoading(true);
    setLetter('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, jobPosting, ...params, companyName, positionTitle }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setLetter(data.letter);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message.includes('fetch') ? 'Could not reach server. Is it running?' : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Select all text in the box and copy manually.');
    }
  }

  const canGenerate = resumeText && jobPosting.trim() && !loading && !uploading;

  return (
    <>
      <h1>Cover Letter Generator</h1>
      <p className="subtitle">Upload your resume + paste a job posting. Get a letter that sounds like you.</p>

      {/* Resume Upload */}
      <div className="section">
        <label>Resume</label>
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''} ${resumeFileName ? 'has-file' : ''}`}
          onClick={() => !uploading && fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={onFileChange} />
          {uploading ? (
            <p>Parsing resume<span className="dots" />...</p>
          ) : resumeFileName ? (
            <>
              <p>&#10003; File loaded</p>
              <p className="file-name">{resumeFileName}</p>
            </>
          ) : (
            <p>Drop your resume here or click to browse<br /><span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>PDF, DOCX, or TXT · Max 5MB</span></p>
          )}
        </div>
      </div>

      {/* Job Posting */}
      <div className="section">
        <label>Job Posting</label>
        <textarea
          rows={8}
          placeholder="Paste the full job description here..."
          value={jobPosting}
          onChange={e => { setJobPosting(e.target.value); if (error) setError(''); }}
        />
      </div>

      {/* Parameters */}
      <div className="section">
        <label>Parameters</label>
        <div className="params-grid">
          <div className="param-group">
            <label>Tone</label>
            <select value={params.tone} onChange={e => onParam('tone', e.target.value)}>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
            </select>
          </div>
          <div className="param-group">
            <label>Length</label>
            <select value={params.length} onChange={e => onParam('length', e.target.value)}>
              <option value="short">Short (~250 words)</option>
              <option value="standard">Standard (~350 words)</option>
              <option value="detailed">Detailed (~500 words)</option>
            </select>
          </div>
          <div className="param-group">
            <label>Focus</label>
            <select value={params.focus} onChange={e => onParam('focus', e.target.value)}>
              <option value="technical">Technical Skills</option>
              <option value="leadership">Leadership</option>
              <option value="culture">Culture Fit</option>
            </select>
          </div>
        </div>
      </div>

      {/* Optional fields */}
      <div className="section">
        <label>Optional Details</label>
        <div className="optional-row">
          <input
            type="text"
            placeholder="Company name"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Position title"
            value={positionTitle}
            onChange={e => setPositionTitle(e.target.value)}
          />
        </div>
      </div>

      <button className="btn-generate" onClick={generate} disabled={!canGenerate}>
        {loading && <span className="spinner" />}
        {loading ? 'Generating...' : 'Generate Cover Letter'}
      </button>

      {error && <div className="error">{error}</div>}

      {letter && (
        <>
          <hr className="divider" />
          <div className="output-header">
            <label style={{ margin: 0 }}>Cover Letter</label>
            <button className={`btn-copy ${copied ? 'copied' : ''}`} onClick={copyLetter}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="output-note">Edit directly below before copying.</p>
          <textarea
            ref={outputRef}
            rows={18}
            value={letter}
            onChange={e => setLetter(e.target.value)}
          />
        </>
      )}
    </>
  );
}
