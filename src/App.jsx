import { useState, useRef, useEffect, useCallback } from 'react';
import { anonymize, deanonymize, computePrivacyScore, getCategoryLabel, getCategoryColor, getThreatLevel } from './lib/anonymizer';
import { sendToClaude } from './lib/claude';
import { writeToMidnight, connectLaceWallet } from './lib/midnight';
import {
  Shield, ShieldCheck, Lock, Eye, EyeOff, Send, Settings,
  ChevronDown, ChevronUp, Zap, Link, Copy, Check,
  AlertCircle, Wallet, X, RefreshCw, ExternalLink
} from 'lucide-react';

// ── Utility ──────────────────────────────────────────────────────────────────

const generateSessionNonce = () => crypto.randomUUID();
const truncate = (str, n) => str.length > n ? str.slice(0, n) + '...' : str;

// ── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="score-ring" style={{ position: 'relative', width: 80, height: 80 }}>
      <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color }}>{score}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: -2 }}>SCORE</span>
      </div>
    </div>
  );
}

function TokenBadge({ token, value, category, revealed, onReveal }) {
  const color = getCategoryColor(category);
  const threat = getThreatLevel(category);
  return (
    <div className="token-row" style={{ '--cat-color': color }}>
      <div className="token-pill" style={{ background: color + '22', borderColor: color + '55' }}>
        <span style={{ color, fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{token}</span>
      </div>
      <span className="token-category" style={{ color: 'var(--text-dim)', fontSize: 11 }}>
        {getCategoryLabel(category)}
      </span>
      <div style={{
        background: threat.bg, color: threat.color, fontSize: 9, fontWeight: 700, 
        padding: '2px 6px', borderRadius: 10, textTransform: 'uppercase', marginRight: 'auto'
      }}>
        {threat.level}
      </div>
      <div className="token-value" onClick={onReveal} title="Click to reveal original" style={{ textAlign: 'right' }}>
        {revealed
          ? <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value}</span>
          : <span style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
              <EyeOff size={10} /> hover to reveal
            </span>
        }
      </div>
    </div>
  );
}

function CommitmentBadge({ commitment }) {
  const [copied, setCopied] = useState(false);
  const statusColors = {
    pending: '#f59e0b', computing: 'var(--accent)',
    signing: '#60a5fa', broadcasting: '#34d399', confirmed: '#10b981',
  };
  const statusLabels = {
    pending: 'Pending...', computing: 'Computing hash...',
    signing: 'Awaiting wallet...', broadcasting: 'Broadcasting...',
    confirmed: 'Verified on Midnight ✓',
  };

  const copy = () => {
    navigator.clipboard.writeText(commitment.txHash || commitment.hash || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="commitment-badge">
      <div className="commitment-status" style={{ '--status-color': statusColors[commitment.status] }}>
        <div className="status-dot" style={{ background: statusColors[commitment.status] }} />
        <span style={{ fontSize: 11, color: statusColors[commitment.status], fontWeight: 600 }}>
          {statusLabels[commitment.status]}
        </span>
      </div>
      {commitment.hash && (
        <div className="commitment-hash">
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)' }}>
            SHA-256: {truncate(commitment.hash, 20)}
          </span>
          <button onClick={copy} className="icon-btn" title="Copy hash">
            {copied ? <Check size={10} color="#22c55e" /> : <Copy size={10} />}
          </button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, tokenMap }) {
  const isUser = message.role === 'user';
  const [showAnonymized, setShowAnonymized] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className={`message-wrapper ${isUser ? 'user' : 'ai'}`}>
      {!isUser && (
        <div className="ai-avatar">
          <Shield size={14} color="var(--accent)" />
        </div>
      )}
      <div className={`message-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
        <div className="message-content">
          {message.displayContent}
        </div>
        {isUser && message.anonymized && message.anonymized !== message.displayContent && (
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              className="show-anonymized-btn"
              onClick={() => setShowAnonymized(v => !v)}
              style={{ marginTop: 0 }}
            >
              {showAnonymized ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              What AI saw
            </button>
            <button
              className="show-anonymized-btn"
              onClick={() => setShowRaw(v => !v)}
              style={{ marginTop: 0, color: 'var(--red)' }}
            >
              {showRaw ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              Raw Prompt
            </button>
          </div>
        )}
        {showAnonymized && (
          <div className="anonymized-preview">
            <span style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
              Anonymized prompt sent to Claude:
            </span>
            <code style={{ fontSize: 11, color: 'var(--accent)', wordBreak: 'break-word' }}>
              {message.anonymized}
            </code>
          </div>
        )}
        {showRaw && (
          <div className="anonymized-preview" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <span style={{ fontSize: 10, color: '#ef4444', display: 'block', marginBottom: 4 }}>
              Raw unsafe prompt (Never Sent):
            </span>
            <code style={{ fontSize: 11, color: '#ef4444', wordBreak: 'break-word' }}>
              {message.displayContent}
            </code>
          </div>
        )}
        {message.newTokens?.length > 0 && (
          <div className="message-token-count" style={{ color: 'var(--green)' }}>
            <ShieldCheck size={10} /> {message.newTokens.length} item{message.newTokens.length > 1 ? 's' : ''} protected
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsModal({ onClose, apiKey, setApiKey }) {
  const [draft, setDraft] = useState(apiKey);
  const [show, setShow] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <label className="form-label">Anthropic API Key</label>
          <div style={{ position: 'relative' }}>
            <input
              type={show ? 'text' : 'password'}
              className="form-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="sk-ant-..."
            />
            <button
              className="input-eye-btn"
              onClick={() => setShow(v => !v)}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="form-hint">
            Your key stays in your browser only — never sent to any server other than Anthropic.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => { setApiKey(draft); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [liveTokens, setLiveTokens] = useState([]);
  const [liveAnonymized, setLiveAnonymized] = useState('');
  const [tokenMap, setTokenMap] = useState({});
  const [allTokens, setAllTokens] = useState([]);
  const [commitments, setCommitments] = useState([]);
  const [sessionNonce] = useState(generateSessionNonce);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('pp_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [walletInfo, setWalletInfo] = useState(null);
  const [revealedTokens, setRevealedTokens] = useState({});
  const [panelTab, setPanelTab] = useState('shield'); // shield | history
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const conversationHistoryRef = useRef([]);

  // Persist API key
  useEffect(() => { if (apiKey) localStorage.setItem('pp_api_key', apiKey); }, [apiKey]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const connectWallet = async () => {
    const info = await connectLaceWallet();
    setWalletInfo(info);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    setError(null);

    const userText = input.trim();
    setInput('');

    // Anonymize
    const { anonymized, tokenMap: newMap, newTokens } = anonymize(userText, tokenMap);
    setTokenMap(newMap);
    setAllTokens(prev => [...prev, ...newTokens]);
    setLiveTokens([]);
    setLiveAnonymized('');

    // Add user message
    const userMsg = {
      id: Date.now(),
      role: 'user',
      displayContent: userText,
      anonymized,
      newTokens,
    };
    setMessages(prev => [...prev, userMsg]);

    // Build conversation history (anonymized)
    conversationHistoryRef.current.push({ role: 'user', content: anonymized });

    setIsLoading(true);

    // Midnight commitment (async, don't block chat)
    const commitmentId = Date.now();
    setCommitments(prev => [...prev, { id: commitmentId, status: 'computing', hash: null, txHash: null }]);
    
    writeToMidnight(anonymized, sessionNonce, (status) => {
      setCommitments(prev => prev.map(c => c.id === commitmentId ? { ...c, status } : c));
    }).then(result => {
      setCommitments(prev => prev.map(c =>
        c.id === commitmentId
          ? { ...c, status: 'confirmed', ...result }
          : c
      ));
    }).catch(() => {
      setCommitments(prev => prev.map(c =>
        c.id === commitmentId ? { ...c, status: 'pending' } : c
      ));
    });

    try {
      const rawResponse = await sendToClaude(conversationHistoryRef.current, apiKey);
      conversationHistoryRef.current.push({ role: 'assistant', content: rawResponse });

      // De-anonymize response for display
      const displayResponse = deanonymize(rawResponse, newMap);

      const aiMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        displayContent: displayResponse,
        rawContent: rawResponse,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      setError(err.message);
      // Remove the user message if API failed
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      conversationHistoryRef.current.pop();
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, tokenMap, apiKey, sessionNonce]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    const val = e.target.value;
    setInput(val);
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
    
    if (val.trim()) {
      const { anonymized, newTokens } = anonymize(val, tokenMap);
      setLiveTokens(newTokens);
      setLiveAnonymized(anonymized);
    } else {
      setLiveTokens([]);
      setLiveAnonymized('');
    }
  };

  const clearSession = () => {
    setMessages([]);
    setTokenMap({});
    setAllTokens([]);
    setLiveTokens([]);
    setLiveAnonymized('');
    setCommitments([]);
    setRevealedTokens({});
    conversationHistoryRef.current = [];
  };

  const combinedTokens = [...allTokens, ...liveTokens];
  const privacyScore = computePrivacyScore(combinedTokens);
  
  const categoryStats = combinedTokens.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {});

  const userMessagesCount = messages.filter(m => m.role === 'user').length;

  const demoPrompt = "I'm John Smith, SSN 423-55-8821, I was diagnosed with Type 2 diabetes last year and my annual salary is $142,000. Am I eligible for this health plan?";

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <div className="brand-icon">
            <Shield size={18} color="var(--accent)" />
          </div>
          <div>
            <h1 className="brand-name">PrivatePrompt <span className="brand-v2">V2</span></h1>
            <p className="brand-tagline">Verifiable Blind AI</p>
          </div>
        </div>
        <div className="header-actions">
          {walletInfo ? (
            <div className="wallet-connected">
              <div className="wallet-dot" />
              <span>{walletInfo.mock ? 'Demo Mode' : truncate(walletInfo.address, 12)}</span>
            </div>
          ) : (
            <button className="btn-wallet" onClick={connectWallet}>
              <Wallet size={13} /> Connect Lace
            </button>
          )}
          <button className="icon-btn header-icon-btn" onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={16} />
          </button>
        </div>
      </header>

      <div className="main-layout">
        {/* Chat Area */}
        <div className="chat-area">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <ShieldCheck size={40} color="var(--accent)" />
              </div>
              <h2>Your data, cryptographically protected.</h2>
              <p>
                Every message is anonymized before reaching the AI.<br />
                Each exchange is proven on the Midnight blockchain.
              </p>
              <div className="how-it-works">
                <div className="how-step"><span className="step-num">1</span><span>PII detected & replaced with tokens</span></div>
                <div className="how-step"><span className="step-num">2</span><span>AI receives anonymized text only</span></div>
                <div className="how-step"><span className="step-num">3</span><span>Commitment hash written to Midnight</span></div>
                <div className="how-step"><span className="step-num">4</span><span>Response de-tokenized for you</span></div>
              </div>
              <button
                className="btn-demo"
                onClick={() => setInput(demoPrompt)}
              >
                <Zap size={13} /> Try Demo Prompt
              </button>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} tokenMap={tokenMap} />
              ))}
              {isLoading && (
                <div className="message-wrapper ai">
                  <div className="ai-avatar"><Shield size={14} color="var(--accent)" /></div>
                  <div className="ai-bubble thinking-bubble">
                    <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-bar">
              <AlertCircle size={14} />
              <span>{error}</span>
              <button className="icon-btn" onClick={() => setError(null)}><X size={12} /></button>
            </div>
          )}

          {/* Input */}
          <div className="input-area">
            {!apiKey && (
              <div className="api-key-warning">
                <AlertCircle size={12} />
                <span>Add your Claude API key in <button onClick={() => setShowSettings(true)} className="inline-link">Settings</button> to start chatting.</span>
              </div>
            )}
            <div className="input-container">
              <textarea
                ref={textareaRef}
                className="chat-input"
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Type your message — sensitive data will be anonymized automatically..."
                rows={1}
                disabled={isLoading}
              />
              <div className="input-actions">
                <button
                  className="icon-btn clear-btn"
                  onClick={clearSession}
                  title="Clear session"
                  disabled={messages.length === 0}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className={`send-btn ${(!input.trim() || isLoading) ? 'disabled' : ''}`}
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
            <p className="input-hint">
              <Lock size={9} /> Anonymized before sending · No raw data leaves your browser
            </p>
          </div>
        </div>

        {/* Privacy Shield Panel */}
        <aside className="privacy-panel">
          <div className="panel-tabs">
            <button
              className={`panel-tab ${panelTab === 'shield' ? 'active' : ''}`}
              onClick={() => setPanelTab('shield')}
            >
              <Shield size={12} /> Privacy Shield
            </button>
            <button
              className={`panel-tab ${panelTab === 'history' ? 'active' : ''}`}
              onClick={() => setPanelTab('history')}
            >
              <Link size={12} /> Proofs
            </button>
          </div>

          {panelTab === 'shield' && (
            <div className="panel-content">
              {/* Score */}
              <div className="panel-score-section">
                <ScoreRing score={privacyScore} />
                <div className="score-meta">
                  <div className="score-label">Privacy Score</div>
                  <div className="score-sub">
                    {combinedTokens.length === 0
                      ? 'No items detected'
                      : `${combinedTokens.length} item${combinedTokens.length > 1 ? 's' : ''} protected`
                    }
                  </div>
                  {commitments.length > 0 && <CommitmentBadge commitment={commitments[commitments.length - 1]} />}
                </div>
              </div>

              {/* Live Preview Box */}
              {input.trim() && (
                <div className="panel-section" style={{ background: 'rgba(219,39,119,0.03)' }}>
                  <h4 className="panel-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', marginBottom: 8 }}>
                    <div className="wallet-dot" style={{ background: 'var(--accent)' }} />
                    Live Anonymization
                  </h4>
                  <code style={{ fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-word', display: 'block' }}>
                    {liveAnonymized}
                  </code>
                </div>
              )}

              {/* Category breakdown */}
              {Object.keys(categoryStats).length > 0 && (
                <div className="panel-section">
                  <h4 className="panel-section-title">Protection Summary</h4>
                  <div className="category-list">
                    {Object.entries(categoryStats).map(([cat, count]) => (
                      <div key={cat} className="category-item">
                        <div className="category-dot" style={{ background: getCategoryColor(cat) }} />
                        <span className="category-name">{getCategoryLabel(cat)}</span>
                        <span className="category-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tokens table */}
              {combinedTokens.length > 0 && (
                <div className="panel-section">
                  <h4 className="panel-section-title">Redaction Map</h4>
                  <p className="panel-section-hint">Hover to reveal original values</p>
                  <div className="tokens-list">
                    {combinedTokens.map((t, i) => (
                      <TokenBadge
                        key={i}
                        token={t.token}
                        value={t.value}
                        category={t.category}
                        revealed={revealedTokens[t.token]}
                        onReveal={() => setRevealedTokens(prev => ({ ...prev, [t.token]: !prev[t.token] }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {combinedTokens.length === 0 && !input.trim() && (
                <div className="panel-empty" style={{ flex: 1 }}>
                  <ShieldCheck size={28} color="var(--accent-glow)" />
                  <p>Start typing to see your privacy shield in action.</p>
                </div>
              )}

              {/* Streak Counter */}
              <div className="panel-section" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none', background: 'var(--bg-hover)', marginTop: 'auto', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: 'var(--accent-dim)', padding: 8, borderRadius: '50%' }}>
                    <ShieldCheck size={18} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Protection Streak</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                      {userMessagesCount} message{userMessagesCount !== 1 ? 's' : ''} sent. 0 bytes of raw PII ever transmitted.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {panelTab === 'history' && (
            <div className="panel-content">
              <div className="panel-section">
                <h4 className="panel-section-title">Midnight Commitments</h4>
                <p className="panel-section-hint">
                  Each exchange is cryptographically proven on-chain.
                </p>
              </div>
              {commitments.length === 0 ? (
                <div className="panel-empty">
                  <Zap size={28} color="var(--accent-glow)" />
                  <p>Your on-chain privacy receipts will appear here.</p>
                </div>
              ) : (
                <div className="commitments-list">
                  {[...commitments].reverse().map((c, i) => (
                    <div key={c.id} className="commitment-card">
                      <div className="commitment-card-header">
                        <span className="commitment-index">#{commitments.length - i}</span>
                        <CommitmentBadge commitment={c} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="midnight-info">
                <div className="midnight-info-icon">
                  <img
                    src="https://cryptologos.cc/logos/midnight-mid-logo.png"
                    alt="Midnight"
                    style={{ width: 16, height: 16, borderRadius: '50%' }}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  Commitments are written to Midnight Mainnet (launched March 2026) via the Midnight.js SDK.
                  Each hash proves the AI received only anonymized tokens.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          apiKey={apiKey}
          setApiKey={setApiKey}
        />
      )}
    </div>
  );
}
