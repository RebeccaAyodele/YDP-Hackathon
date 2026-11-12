import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User, Minimize2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const ACTION_SUGGESTIONS = [
  { label: 'Cold chain breakdown', prompt: 'Which state has the lowest cold chain readiness and what are the critical clinics there?' },
  { label: 'Drug stockout triage', prompt: 'Which essential drugs have the highest stockout rates and which facilities need immediate delivery?' },
  { label: 'Reporting blackouts', prompt: 'List the top 5 facilities that have missed reporting for 3 or more consecutive weeks.' },
  { label: 'Vulnerable LGAs', prompt: 'Which 3 LGAs have the highest average vulnerability score and why?' }
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: "Repulse Epidemiological Intelligence Assistant online.\nDirect telemetry linked to 1,292 monitored Primary Healthcare Centres across Nigeria.\n\nSelect a priority audit below or submit a resource allocation or triage query.",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, messages]);

  async function sendMessage(text?: string) {
    const msgText = (text ?? input).trim();
    if (!msgText || loading) return;

    const userMsg: Message = { role: 'user', text: msgText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, text: m.text }));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgText, history }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      const assistantMsg: Message = {
        role: 'assistant',
        text: data.reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(err.message || 'Service temporarily busy. Please retry.');
    } finally {
      setLoading(false);
    }
  }

  // Clean plain-text formatting (strips raw markdown symbols like ###, **, *, `)
  function formatCleanText(raw: string) {
    const cleaned = raw
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}(.*?)`{1,3}/g, '$1');

    return cleaned.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return <div key={i} style={{ height: '6px' }} />;
      }
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        return (
          <div key={i} style={{ display: 'flex', gap: '8px', marginTop: '4px', paddingLeft: '4px' }}>
            <span style={{ color: 'var(--teal-primary, #0F766E)', fontWeight: 700, flexShrink: 0 }}>•</span>
            <span style={{ color: 'inherit' }}>{trimmed.replace(/^[-•]\s*/, '')}</span>
          </div>
        );
      }
      return (
        <div key={i} style={{ marginTop: i > 0 ? '4px' : 0 }}>
          {trimmed}
        </div>
      );
    });
  }

  return (
    <>
      {/* Floating Trigger Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="remi-floating-btn"
          title="Open REMI Epidemiological Assistant"
          aria-label="Open AI Assistant"
        >
          <MessageSquare size={22} color="#FFFFFF" />
          <span className="remi-ping-ring" />
        </button>
      )}

      {/* Slide-Up Panel / Fullscreen on Mobile */}
      {open && (
        <div className="remi-panel-wrapper">
          {/* Header */}
          <div className="remi-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="remi-avatar-icon">
                <Bot size={18} color="#FFFFFF" />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                  REMI Intelligence
                </div>
                <div style={{ fontSize: '11px', color: '#CCFBF1', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                  Live Grounded PHC Telemetry
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setOpen(false)}
                className="remi-header-btn"
                title="Minimise"
              >
                <Minimize2 size={15} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="remi-header-btn"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="remi-messages-container">
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '8px',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: msg.role === 'assistant' ? 'var(--teal-primary, #0F766E)' : '#1C2424',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <Bot size={14} color="#FFFFFF" />
                  ) : (
                    <User size={14} color="#FFFFFF" />
                  )}
                </div>

                <div
                  style={{
                    maxWidth: '82%',
                    padding: '11px 14px',
                    borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                    background: msg.role === 'user' ? 'var(--teal-primary, #0F766E)' : '#FFFFFF',
                    color: msg.role === 'user' ? '#FFFFFF' : 'var(--text-primary, #1C2424)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border-light, #E0DCD4)',
                    fontSize: '13.5px',
                    lineHeight: '1.5',
                    fontFamily: 'var(--font-main)',
                    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
                    wordBreak: 'break-word',
                  }}
                >
                  {formatCleanText(msg.text)}
                  <div
                    style={{
                      fontSize: '10.5px',
                      marginTop: '5px',
                      opacity: 0.6,
                      textAlign: msg.role === 'user' ? 'right' : 'left',
                    }}
                  >
                    {msg.timestamp.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--teal-primary, #0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={14} color="#FFFFFF" />
                </div>
                <div style={{ padding: '10px 14px', background: '#FFFFFF', borderRadius: '4px 14px 14px 14px', border: '1px solid var(--border-light, #E0DCD4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={14} color="var(--teal-primary, #0F766E)" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '12.5px', color: 'var(--text-muted, #6B7280)', fontFamily: 'var(--font-main)' }}>
                    Querying 1,292 PHC records…
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '12.5px', color: '#DC2626', fontFamily: 'var(--font-main)' }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick Action Suggestion Chips */}
          {messages.length <= 2 && (
            <div className="remi-suggestions-bar">
              {ACTION_SUGGESTIONS.map((item, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(item.prompt)}
                  className="remi-chip-btn"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <div className="remi-input-bar">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask about commodities, LGAs, PHC status…"
              disabled={loading}
              className="remi-input"
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="remi-send-btn"
              title="Send message"
            >
              <Send size={15} color="#FFFFFF" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
