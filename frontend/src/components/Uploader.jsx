import { useState, useRef, useCallback } from 'react';
import { gql, useMutation } from '@apollo/client';

const ADD_TO_SEGMENT = gql`
  mutation AddToSegment($input: SegmentEntryInput!) {
    addToSegment(input: $input) {
      success
      status
      message
    }
  }
`;

export default function Uploader({ user, onSignOut }) {
  const [listName, setListName] = useState('');
  const [conditionId, setConditionId] = useState(757);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [idType, setIdType] = useState('card');
  const [mode, setMode] = useState('append');
  const [entries, setEntries] = useState([]);
  const [fileName, setFileName] = useState('');
  const [rowStatus, setRowStatus] = useState({}); // { i: 'pending'|'processing'|'success'|'error' }
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ total: 0, success: 0, error: 0, skipped: 0 });
  const [progress, setProgress] = useState({ done: 0, pct: 0, rate: '' });
  const [logLines, setLogLines] = useState([
    { t: '--:--:--', type: 'sys', msg: 'Ready. Load a CSV and configure your segment to begin.' },
  ]);
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  const abortRef = useRef(false);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const [addToSegment] = useMutation(ADD_TO_SEGMENT);

  const log = useCallback((type, msg) => {
    const t = new Date().toTimeString().slice(0, 8);
    setLogLines((l) => [...l, { t, type, msg }]);
  }, []);

  const resetStats = () => {
    setStats({ total: 0, success: 0, error: 0, skipped: 0 });
    setProgress({ done: 0, pct: 0, rate: '' });
  };

  // ── File handling ────────────────────────────────────────────────
  const loadFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      setEntries(lines);
      setFileName(file.name);
      setRowStatus(Object.fromEntries(lines.map((_, i) => [i, 'pending'])));
      resetStats();
      log('sys', `Loaded "${file.name}" — ${lines.length} entries`);
    };
    reader.readAsText(file);
  };

  const onFileChange = (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    dropRef.current?.classList.remove('dragover');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  };

  const clearFile = () => {
    setEntries([]);
    setFileName('');
    setRowStatus({});
    resetStats();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Upload flow ───────────────────────────────────────────────────
  const startUpload = () => {
    if (!entries.length) return log('warn', 'No entries loaded.');
    if (!listName.trim()) return log('warn', 'Please enter a List Name.');
    if (!apiKey.trim()) return log('warn', 'Please enter your Mobie API key.');
    if (mode === 'replace') setShowReplaceModal(true);
    else runUpload();
  };

  const runUpload = async () => {
    setShowReplaceModal(false);
    abortRef.current = false;
    setRunning(true);
    resetStats();
    setRowStatus(Object.fromEntries(entries.map((_, i) => [i, 'pending'])));

    const total = entries.length;
    const start = Date.now();
    log('sys', `▶ ${mode.toUpperCase()} — "${listName}" — ${total} entries via ${idType === 'card' ? 'Card' : 'Email'}`);

    let success = 0;
    let error = 0;

    for (let i = 0; i < total; i++) {
      if (abortRef.current) {
        log('warn', `Stopped at entry ${i + 1}.`);
        break;
      }
      const val = entries[i];
      setRowStatus((s) => ({ ...s, [i]: 'processing' }));

      const elapsed = (Date.now() - start) / 1000;
      const rate = i > 0 ? (i / elapsed).toFixed(1) + ' req/s' : '';
      setProgress({ done: i, pct: Math.round((i / total) * 100), rate });

      try {
        const res = await addToSegment({
          variables: { input: { conditionId: parseInt(conditionId, 10), value: val } },
          context: { mobieApiKey: apiKey.trim() },
        });
        const r = res.data?.addToSegment;
        if (r?.success) {
          success++;
          setRowStatus((s) => ({ ...s, [i]: 'success' }));
          log('ok', `[${i + 1}/${total}] ✓ ${val}`);
        } else {
          error++;
          setRowStatus((s) => ({ ...s, [i]: 'error' }));
          log('err', `[${i + 1}/${total}] ✗ ${val} — ${r?.message || r?.status}`);
        }
      } catch (err) {
        error++;
        setRowStatus((s) => ({ ...s, [i]: 'error' }));
        log('err', `[${i + 1}/${total}] ✗ ${val} — ${err.message}`);
      }

      setStats({ total: i + 1, success, error, skipped: 0 });
      await sleep(100);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    setProgress({ done: total, pct: 100, rate: '' });
    log('sys', `⬛ Done — ${success} succeeded, ${error} failed — ${elapsed}s`);
    setRunning(false);
  };

  const stopUpload = () => {
    abortRef.current = true;
    log('warn', 'Stop requested…');
  };

  const downloadLog = () => {
    const lines = logLines.map((l) => `[${l.t}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n');
    const name = (listName.trim() || 'upload').replace(/\s+/g, '_');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines], { type: 'text/plain' }));
    a.download = name + '_log.txt';
    a.click();
  };

  const clearLog = () => setLogLines([]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="app">
      <header>
        <h1>⬡ INGN Segment Bulk Uploader</h1>
        <span className="badge">Mobie Ordering API</span>
        <div className="user-info">
          <span>{user.email}</span>
          <button className="btn btn-secondary" onClick={onSignOut} style={{ padding: '4px 12px', fontSize: 11 }}>
            Sign out
          </button>
        </div>
      </header>

      <div className="field-group" style={{ marginBottom: 16 }}>
        <label>Mobie API Key</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your Mobie API key — kept only in this browser session"
            autoComplete="off"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowApiKey((s) => !s)}
            style={{ padding: '4px 12px', fontSize: 11 }}
          >
            {showApiKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div className="grid">
        <div className="field-group">
          <label>List / Segment Name</label>
          <input type="text" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. Fall 2025 Promo" />
        </div>
        <div className="field-group">
          <label>Condition ID</label>
          <input type="number" value={conditionId} onChange={(e) => setConditionId(e.target.value)} />
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="field-group">
          <label>Identifier Type</label>
          <div className="radio-group">
            <label className={`card ${idType === 'card' ? 'active' : ''}`} onClick={() => setIdType('card')}>
              🪪 Card Number
            </label>
            <label className={`email ${idType === 'email' ? 'active' : ''}`} onClick={() => setIdType('email')}>
              ✉️ Email
            </label>
          </div>
        </div>
        <div className="field-group">
          <label>Upload Mode</label>
          <div className="radio-group">
            <label className={mode === 'append' ? 'active' : ''} onClick={() => setMode('append')}>
              + Append
            </label>
            <label className={mode === 'replace' ? 'active' : ''} onClick={() => setMode('replace')}>
              ↺ Replace
            </label>
          </div>
        </div>
      </div>

      {mode === 'replace' && (
        <div className="alert alert-warn">
          ⚠️ <strong>Replace mode:</strong> All entries in your file will be added; remove existing members separately if needed.
        </div>
      )}

      {!entries.length ? (
        <div
          ref={dropRef}
          className="dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            dropRef.current?.classList.add('dragover');
          }}
          onDragLeave={() => dropRef.current?.classList.remove('dragover')}
          onDrop={onDrop}
        >
          <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={onFileChange} />
          <div className="dropzone-icon">📂</div>
          <div className="dropzone-text">
            <strong>Click to browse</strong> or drag & drop your CSV / TXT file
            <br />
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
              One card number or email per line — no header row
            </span>
          </div>
        </div>
      ) : (
        <div className="file-info">
          <span className="file-info-icon">📄</span>
          <div>
            <div className="file-info-name">{fileName}</div>
            <div className="file-info-count">{entries.length} entries loaded</div>
          </div>
          <button className="file-info-remove" onClick={clearFile}>✕</button>
        </div>
      )}

      {entries.length > 0 && (
        <div className="preview-section">
          <div className="preview-header">
            <span className="preview-label">Preview — {entries.length} entries</span>
          </div>
          <div className="preview-scroll">
            {entries.map((val, i) => (
              <div className="preview-row" key={i}>
                <span className="row-num">{i + 1}</span>
                <span className="row-val">{val}</span>
                <span className={`row-status status-${rowStatus[i] || 'pending'}`}>
                  {symbolFor(rowStatus[i])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-divider" />

      <div className="actions">
        {!running ? (
          <button className="btn btn-primary" onClick={startUpload} disabled={!entries.length || !apiKey.trim()}>
            ▶ Run Upload
          </button>
        ) : (
          <button className="btn btn-danger" onClick={stopUpload}>⬛ Stop</button>
        )}
        <button className="btn btn-secondary" onClick={downloadLog} disabled={logLines.length <= 1}>
          ↓ Export Log
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
          {progress.rate}
        </span>
      </div>

      {(running || progress.pct > 0) && (
        <div className="progress-section">
          <div className="progress-meta">
            <span>{progress.done} / {entries.length}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      <div className="stats">
        <Stat label="Total"   value={stats.total}   className="stat-total"   />
        <Stat label="Success" value={stats.success} className="stat-success" />
        <Stat label="Failed"  value={stats.error}   className="stat-error"   />
        <Stat label="Skipped" value={stats.skipped} className="stat-skipped" />
      </div>

      <div className="log-section">
        <div className="log-header">
          <span className="preview-label">Activity Log</span>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={clearLog}>
            Clear
          </button>
        </div>
        <div className="log-scroll" ref={(el) => el && (el.scrollTop = el.scrollHeight)}>
          {logLines.map((l, i) => (
            <div className={`log-line log-${l.type}`} key={i}>
              <span className="log-time">{l.t}</span>
              <span className="log-msg">{l.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {showReplaceModal && (
        <div className="modal-overlay show">
          <div className="modal">
            <h2>⚠️ Confirm Replace Mode</h2>
            <p>
              All entries in your file will be submitted via <code>addToSegment</code>. Proceed for all{' '}
              {entries.length} entries?
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReplaceModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={runUpload}>Yes, Proceed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, className }) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function symbolFor(status) {
  switch (status) {
    case 'processing': return '⟳';
    case 'success': return '✓';
    case 'error': return '✗';
    default: return '—';
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
