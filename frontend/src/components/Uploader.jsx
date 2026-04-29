import { useState, useEffect, useRef, useCallback } from 'react';
import { gql, useMutation } from '@apollo/client';
import {
  getUserData,
  saveApiKey,
  clearApiKey,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setActiveProfile,
} from '../lib/userStore.js';

const ADD_TO_SEGMENT = gql`
  mutation AddToSegment($input: SegmentEntryInput!) {
    addToSegment(input: $input) {
      success
      status
      message
    }
  }
`;

const DEFAULT_FORM = {
  listName: '',
  conditionId: 757,
  idType: 'card',
  mode: 'append',
};

export default function Uploader({ user, onSignOut }) {
  // ── Form state ─────────────────────────────────────────────────────
  const [listName, setListName] = useState(DEFAULT_FORM.listName);
  const [conditionId, setConditionId] = useState(DEFAULT_FORM.conditionId);
  const [idType, setIdType] = useState(DEFAULT_FORM.idType);
  const [mode, setMode] = useState(DEFAULT_FORM.mode);

  // ── API key state ──────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // ── Profile state ──────────────────────────────────────────────────
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [showNewProfileModal, setShowNewProfileModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);

  // ── Upload state ───────────────────────────────────────────────────
  const [entries, setEntries] = useState([]);
  const [fileName, setFileName] = useState('');
  const [rowStatus, setRowStatus] = useState({});
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

  // ── Load user data + profiles on mount ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [userData, profileList] = await Promise.all([
          getUserData(user.uid),
          listProfiles(user.uid),
        ]);
        if (cancelled) return;

        if (userData?.mobieApiKey) {
          setSavedApiKey(userData.mobieApiKey);
          setApiKey(userData.mobieApiKey);
        } else {
          setEditingApiKey(true);
        }

        setProfiles(profileList);

        const lastId = userData?.lastProfileId;
        const lastProfile = lastId && profileList.find((p) => p.id === lastId);
        if (lastProfile) {
          applyProfileToForm(lastProfile);
          setActiveProfileId(lastProfile.id);
        }
      } catch (err) {
        log('warn', `Could not load saved settings: ${err.message}`);
        setEditingApiKey(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  // ── Profile helpers ────────────────────────────────────────────────
  const applyProfileToForm = (p) => {
    setListName(p.listName ?? '');
    setConditionId(p.conditionId ?? DEFAULT_FORM.conditionId);
    setIdType(p.idType ?? DEFAULT_FORM.idType);
    setMode(p.mode ?? DEFAULT_FORM.mode);
  };

  const currentFormValues = () => ({
    listName: listName.trim(),
    conditionId: parseInt(conditionId, 10) || 0,
    idType,
    mode,
  });

  const onProfileSelect = (e) => {
    const id = e.target.value;
    setActiveProfileId(id);
    if (!id) {
      applyProfileToForm(DEFAULT_FORM);
      return;
    }
    const p = profiles.find((x) => x.id === id);
    if (p) {
      applyProfileToForm(p);
      setActiveProfile(user.uid, id).catch((err) => console.warn('setActiveProfile:', err));
    }
  };

  const onSaveProfile = async () => {
    if (!activeProfileId) {
      // No profile picked — open the new-profile modal so the user can name it
      setNewProfileName(listName.trim() || '');
      setShowNewProfileModal(true);
      return;
    }
    setProfileBusy(true);
    try {
      const data = currentFormValues();
      await updateProfile(user.uid, activeProfileId, data);
      setProfiles((ps) =>
        ps.map((p) => (p.id === activeProfileId ? { ...p, ...data, updatedAt: new Date() } : p))
      );
      log('sys', `Profile updated.`);
    } catch (err) {
      log('err', `Could not save profile: ${err.message}`);
    } finally {
      setProfileBusy(false);
    }
  };

  const onCreateProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    setProfileBusy(true);
    try {
      const data = { name, ...currentFormValues() };
      const id = await createProfile(user.uid, data);
      const created = { id, ...data, updatedAt: new Date(), createdAt: new Date() };
      setProfiles((ps) => [created, ...ps]);
      setActiveProfileId(id);
      await setActiveProfile(user.uid, id);
      setShowNewProfileModal(false);
      setNewProfileName('');
      log('sys', `Profile "${name}" created.`);
    } catch (err) {
      log('err', `Could not create profile: ${err.message}`);
    } finally {
      setProfileBusy(false);
    }
  };

  const onDeleteProfile = async () => {
    if (!activeProfileId) return;
    const p = profiles.find((x) => x.id === activeProfileId);
    if (!p) return;
    if (!window.confirm(`Delete profile "${p.name}"? This can't be undone.`)) return;
    setProfileBusy(true);
    try {
      await deleteProfile(user.uid, activeProfileId);
      setProfiles((ps) => ps.filter((x) => x.id !== activeProfileId));
      setActiveProfileId('');
      applyProfileToForm(DEFAULT_FORM);
      log('sys', `Profile "${p.name}" deleted.`);
    } catch (err) {
      log('err', `Could not delete profile: ${err.message}`);
    } finally {
      setProfileBusy(false);
    }
  };

  // ── API key handlers ───────────────────────────────────────────────
  const onApiKeyBlur = async () => {
    const trimmed = apiKey.trim();
    if (!editingApiKey) return;
    if (!trimmed || trimmed === savedApiKey) {
      // Nothing to save — exit edit mode if we still have a saved key
      if (savedApiKey) {
        setApiKey(savedApiKey);
        setEditingApiKey(false);
      }
      return;
    }
    try {
      await saveApiKey(user.uid, trimmed);
      setSavedApiKey(trimmed);
      setEditingApiKey(false);
      setShowApiKey(false);
      log('sys', 'Mobie API key saved to your account.');
    } catch (err) {
      log('err', `Could not save API key: ${err.message}`);
    }
  };

  const startEditApiKey = () => {
    setApiKey('');
    setEditingApiKey(true);
    setShowApiKey(false);
  };

  const cancelEditApiKey = () => {
    setApiKey(savedApiKey);
    setEditingApiKey(false);
    setShowApiKey(false);
  };

  const onClearApiKey = async () => {
    if (!window.confirm('Forget the saved Mobie API key on this account?')) return;
    try {
      await clearApiKey(user.uid);
      setSavedApiKey('');
      setApiKey('');
      setEditingApiKey(true);
      log('sys', 'Saved API key cleared.');
    } catch (err) {
      log('err', `Could not clear API key: ${err.message}`);
    }
  };

  const apiKeyMask = savedApiKey
    ? '•'.repeat(Math.max(0, savedApiKey.length - 4)) + savedApiKey.slice(-4)
    : '';

  // ── File handling ──────────────────────────────────────────────────
  const resetStats = () => {
    setStats({ total: 0, success: 0, error: 0, skipped: 0 });
    setProgress({ done: 0, pct: 0, rate: '' });
  };

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

  // ── Upload flow ────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────
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

      {/* Profile selector */}
      <div className="profile-bar">
        <div className="field-group" style={{ flex: 1, marginBottom: 0 }}>
          <label>Saved Profile</label>
          <select value={activeProfileId} onChange={onProfileSelect} disabled={profileBusy || running}>
            <option value="">— New / Unsaved —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="profile-actions">
          <button className="btn btn-secondary" onClick={onSaveProfile} disabled={profileBusy || running}>
            💾 {activeProfileId ? 'Update' : 'Save as new'}
          </button>
          {activeProfileId && (
            <button className="btn btn-secondary" onClick={onDeleteProfile} disabled={profileBusy || running}>
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      {/* Mobie API key */}
      <div className="field-group" style={{ marginBottom: 16 }}>
        <label>Mobie API Key</label>
        {editingApiKey ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={onApiKeyBlur}
              placeholder="Paste your Mobie API key — saved to your account on save"
              autoComplete="off"
              style={{ flex: 1 }}
              autoFocus={!savedApiKey}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowApiKey((s) => !s)}
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
            {savedApiKey && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelEditApiKey}
                style={{ padding: '4px 12px', fontSize: 11 }}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={apiKeyMask}
              readOnly
              style={{ flex: 1, fontFamily: 'monospace' }}
              aria-label="Saved API key (masked)"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={startEditApiKey}
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClearApiKey}
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              Clear
            </button>
          </div>
        )}
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

      {showNewProfileModal && (
        <div className="modal-overlay show">
          <div className="modal">
            <h2>Save as new profile</h2>
            <p>Give this configuration a name so you can reuse it later.</p>
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="e.g. Fall 2025 — Card Append"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && onCreateProfile()}
              style={{ width: '100%', marginTop: 8 }}
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => { setShowNewProfileModal(false); setNewProfileName(''); }}
                disabled={profileBusy}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={onCreateProfile}
                disabled={profileBusy || !newProfileName.trim()}
              >
                {profileBusy ? 'Saving…' : 'Save profile'}
              </button>
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
