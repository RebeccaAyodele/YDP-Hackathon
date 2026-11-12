import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User, Minimize2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  'Which 3 LGAs need urgent intervention right now?',
  'I have 50 packs of ORS. Where should I send them?',
  'Which state has the worst cold chain situation?',
  'List the top 5 silent facilities I should contact today.',
  'What is the most critical commodity shortage nationally?',
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: "Hi! I'm **REMI** — your Repulse Epidemiological Management Intelligence assistant.\n\nI have live access to data on all **1,292 monitored PHCs** across Nigeria — risk scores, stockout rates, silent facilities, LGA vulnerability, and more.\n\nAsk me anything, like:\n- *\"Which 3 LGAs need urgent help?\"*\n- *\"I have 50 packs of ORS, where should I send them?\"*\n- *\"Which state has the worst cold chain situation?\"*",
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
      setTimeout(() => inputRef.current?.focus(), 100);
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
      const history = messages.slice(-8).map(m => ({ role: m.role, text: m.text }));
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
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function formatText(text: string) {
    // Simple markdown-like formatting for bold and bullet points
    return text
      .split('\n')
      .map((line, i) => {
        // Bold
        const parts = line.split(/\*\*(.*?)\*\*/g);
        const formatted = parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j}>{part}</strong> : part
        );
        // Bullet points
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <span style={{ color: '#0F766E', fontWeight: 700, flexShrink: 0 }}>•</span>
              <span>{formatted.map((p, j) => typeof p === 'string' ? p.replace(/^[-•]\s/, '') : p)}</span>
            </div>
          );
        }
        return <div key={i} style={{ marginTop: i > 0 ? '4px' : 0 }}>{formatted}</div>;
      });
  }

  return (
    <>
      {/* Floating Chat Bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Open REMI — AI Data Assistant"
          style={{
            position: 'fixed',
            bottom: '28px',
            right: '28px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0F766E 0%, #0D5C56 100%)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(15, 118, 110, 0.4)',
            zIndex: 999,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 30px rgba(15, 118, 110, 0.5)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(15, 118, 110, 0.4)';
          }}
        >
          <MessageSquare size={24} color="#FFFFFF" />
          {/* Pulse ring */}
          <span style={{
            position: 'absolute',
            inset: '-4px',
            borderRadius: '50%',
            border: '2px solid rgba(15, 118, 110, 0.4)',
            animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
          }} />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '420px',
            maxWidth: 'calc(100vw - 32px)',
            height: '580px',
            maxHeight: 'calc(100vh - 48px)',
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E0DCD4',
            boxShadow: '0 24px 60px rgba(28, 36, 36, 0.18)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #0F766E 0%, #0D5C56 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.3)',
              }}>
                <Bot size={20} color="#FFFFFF" />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>REMI</div>
                <div style={{ fontSize: '11.5px', color: '#CCFBF1', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                  Repulse AI · Live PHC Data
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', color: '#FFFFFF', cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center' }}
                title="Minimise"
              >
                <Minimize2 size={15} />
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', color: '#FFFFFF', cursor: 'pointer', padding: '5px 8px', display: 'flex', alignItems: 'center' }}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#FAF9F6',
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '10px',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: msg.role === 'assistant' ? '#0F766E' : '#1C2424',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {msg.role === 'assistant'
                    ? <Bot size={15} color="#FFFFFF" />
                    : <User size={15} color="#FFFFFF" />
                  }
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: '78%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                  background: msg.role === 'user' ? '#0F766E' : '#FFFFFF',
                  color: msg.role === 'user' ? '#FFFFFF' : '#1C2424',
                  border: msg.role === 'user' ? 'none' : '1px solid #E0DCD4',
                  fontSize: '13.5px',
                  lineHeight: '1.5',
                  boxShadow: '0 1px 3px rgba(28,36,36,0.06)',
                }}>
                  {formatText(msg.text)}
                  <div style={{ fontSize: '10.5px', marginTop: '5px', opacity: 0.55, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                    {msg.timestamp.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={15} color="#FFFFFF" />
                </div>
                <div style={{ padding: '12px 16px', background: '#FFFFFF', borderRadius: '4px 14px 14px 14px', border: '1px solid #E0DCD4', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={14} color="#0F766E" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '13px', color: '#6B7280' }}>Analysing live PHC data…</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', fontSize: '13px', color: '#DC2626' }}>
                ⚠️ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Suggested prompts (shown when only initial message) */}
          {messages.length === 1 && (
            <div style={{ padding: '0 12px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px', flexShrink: 0, background: '#FAF9F6' }}>
              {SUGGESTED_PROMPTS.slice(0, 3).map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: '#FFFFFF',
                    border: '1px solid #E0DCD4',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    color: '#374151',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#0F766E'; (e.currentTarget as HTMLButtonElement).style.color = '#0F766E'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E0DCD4'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #E0DCD4',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            background: '#FFFFFF',
            flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask about facilities, supplies, LGAs…"
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: '13.5px',
                border: '1px solid #E0DCD4',
                borderRadius: '10px',
                outline: 'none',
                background: '#FAF9F6',
                color: '#1C2424',
                transition: 'border-color 0.12s ease',
              }}
              onFocus={e => (e.target.style.borderColor = '#0F766E')}
              onBlur={e => (e.target.style.borderColor = '#E0DCD4')}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: loading || !input.trim() ? '#E0DCD4' : '#0F766E',
                border: 'none',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.12s ease',
              }}
            >
              <Send size={16} color="#FFFFFF" />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
    </>
  );
}

