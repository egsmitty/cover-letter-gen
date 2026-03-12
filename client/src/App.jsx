import { useState, useRef, useEffect } from 'react';

const DEFAULT_PARAMS = { tone: 'professional', length: 'standard', focus: 'technical' };
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function splitParagraphs(text) {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}

function joinParagraphs(paragraphs) {
  return paragraphs.join('\n\n');
}

// ─── Letter Page ────────────────────────────────────────────────────────────

function LetterPage({ paragraphs, setParagraphs, resumeText, jobPosting, companyName, positionTitle, onBack }) {
  const [rethinking, setRethinking] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function rethinkParagraph(index) {
    setRethinking(index);
    setError('');
    try {
      const res = await fetch('/api/rethink-paragraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paragraph: paragraphs[index],
          fullLetter: joinParagraphs(paragraphs),
          resumeText,
          jobPosting,
          companyName,
          positionTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rethink failed');
      setParagraphs(prev => prev.map((p, i) => i === index ? data.paragraph : p));
    } catch (err) {
      setError(err.message.includes('fetch') ? 'Could not reach server.' : err.message);
    } finally {
      setRethinking(null);
    }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(joinParagraphs(paragraphs));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Select all and copy manually.');
    }
  }

  const last = paragraphs.length - 1;

  return (
    <div className="letter-page">
      <div className="letter-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <button className={`btn-copy ${copied ? 'copied' : ''}`} onClick={copyAll}>
          {copied ? 'Copied!' : 'Copy all'}
        </button>
      </div>

      <p className="letter-hint">Click any paragraph to edit. Use "↺ Rethink" to regenerate a middle paragraph.</p>

      {error && <div className="error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="paragraphs">
        {paragraphs.map((para, i) => (
          <ParagraphBlock
            key={i}
            text={para}
            isRethinking={rethinking === i}
            isEdge={i === 0 || i === last}
            onChange={val => setParagraphs(prev => prev.map((p, idx) => idx === i ? val : p))}
            onRethink={() => rethinkParagraph(i)}
            disabled={rethinking !== null}
          />
        ))}
      </div>
    </div>
  );
}

function ParagraphBlock({ text, isRethinking, isEdge, onChange, onRethink, disabled }) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef(null);

  // Close edit mode when another paragraph starts rethinking
  useEffect(() => {
    if (disabled && editing) setEditing(false);
  }, [disabled]);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = 'auto';
      taRef.current.style.height = taRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  function autoResize(e) {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }

  // Rethink is only available for non-edge paragraphs with content
  const canRethink = !isEdge && !disabled && !editing && text.trim() !== '';

  return (
    <div className={`para-block ${isRethinking ? 'para-rethinking' : ''} ${disabled && !isRethinking ? 'para-disabled' : ''}`}>
      {editing ? (
        <textarea
          ref={taRef}
          className="para-textarea"
          value={text}
          onChange={e => { onChange(e.target.value); autoResize(e); }}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <p className="para-text" onClick={() => !disabled && setEditing(true)}>
          {isRethinking
            ? <span className="rethink-placeholder">Rethinking<span className="blink-dots">...</span></span>
            : text || <span className="para-empty">Empty — click to type</span>}
        </p>
      )}
      {!isEdge && (
        <button
          className="btn-rethink"
          onClick={onRethink}
          disabled={!canRethink}
          title={text.trim() === '' ? 'Add some text before rethinking' : 'Regenerate this paragraph'}
        >
          {isRethinking ? '...' : '↺ Rethink'}
        </button>
      )}
    </div>
  );
}

// ─── Form Page ───────────────────────────────────────────────────────────────

export default function App() {
  const [resumeText, setResumeText] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [jobPosting, setJobPosting] = useState('');
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [companyName, setCompanyName] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [paragraphs, setParagraphs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState('form');
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  // Abort any in-flight generate request on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { setError('File too large. Max 5MB.'); return; }
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
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, jobPosting, ...params, companyName, positionTitle }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setParagraphs(splitParagraphs(data.letter));
      setView('letter');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message.includes('fetch') ? 'Could not reach server. Is it running?' : err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    // Warn if the user has a letter with edits they'd lose
    if (paragraphs.length > 0 && !window.confirm('Go back? Your edits to this letter will be lost.')) return;
    abortRef.current?.abort();
    setError('');
    setView('form');
  }

  const canGenerate = resumeText && jobPosting.trim() && !loading && !uploading;

  if (view === 'letter') {
    return (
      <LetterPage
        paragraphs={paragraphs}
        setParagraphs={setParagraphs}
        resumeText={resumeText}
        jobPosting={jobPosting}
        companyName={companyName}
        positionTitle={positionTitle}
        onBack={handleBack}
      />
    );
  }

  return (
    <>
      <h1>Cover Letter Generator</h1>
      <p className="subtitle">Upload your resume + paste a job posting. Get a letter that sounds like you.</p>

      <div className="section">
        <label>Resume</label>
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''} ${resumeFileName ? 'has-file' : ''}`}
          onClick={() => !uploading && !loading && fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={onFileChange} />
          {uploading ? (
            <p>Parsing resume...</p>
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

      <div className="section">
        <label>Job Posting</label>
        <textarea
          rows={8}
          placeholder="Paste the full job description here..."
          value={jobPosting}
          onChange={e => { setJobPosting(e.target.value); if (error) setError(''); }}
        />
      </div>

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

      <div className="section">
        <label>Optional Details</label>
        <div className="optional-row">
          <input type="text" placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} />
          <input type="text" placeholder="Position title" value={positionTitle} onChange={e => setPositionTitle(e.target.value)} />
        </div>
      </div>

      <button className="btn-generate" onClick={generate} disabled={!canGenerate}>
        {loading && <span className="spinner" />}
        {loading ? 'Generating...' : 'Generate Cover Letter'}
      </button>

      {error && <div className="error" role="alert">{error}</div>}
    </>
  );
}
