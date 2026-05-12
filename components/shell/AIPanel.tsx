'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Send, Loader2, RotateCcw, Mic, MicOff, CheckCircle2, Navigation, Briefcase } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { ScreenKey } from '@/types';

const CONTEXTUAL_HINT: Partial<Record<ScreenKey, string>> = {
  dashboard:     'Summarize my day, highlight blockers, or plan my morning.',
  tasks:         'Create tasks, prioritize, or break down complex work.',
  opportunities: 'Rank opportunities by fit, or help me pick what to work on.',
  jobs:          'Draft a follow-up, prep for an interview, or analyze a JD.',
  resume:        'Tailor my resume, close skill gaps, or rewrite weak bullets.',
  interview:     'Quiz me on system design, simulate behavioral questions.',
  focus:         'Help plan this session or think through what I\'m working on.',
  brief:         'Give me my morning briefing or highlight what\'s urgent.',
  email:         'Convert emails to tasks, draft replies, or summarize threads.',
  learning:      'Generate flashcard questions or suggest what to study.',
  vault:         'Search my notes, suggest connections, or summarize a topic.',
  analytics:     'Interpret my productivity trends or suggest improvements.',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: { type: 'navigate'; screen: ScreenKey; reason: string } | { type: 'task_created'; title: string; priority: string } | { type: 'task_updated'; taskTitle: string; status: string } | { type: 'job_added'; company: string; role: string; stage: string } | { type: 'flashcard_created'; front: string; deckName: string };
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Parse [NAVIGATE:screen:reason] tokens injected by the stream
function extractActions(text: string): { cleaned: string; navigateTo?: { screen: ScreenKey; reason: string } } {
  const navMatch = text.match(/\[NAVIGATE:(\w+):([^\]]*)\]/);
  if (navMatch) {
    return {
      cleaned: text.replace(/\[NAVIGATE:[^\]]*\]/g, '').trim(),
      navigateTo: { screen: navMatch[1] as ScreenKey, reason: navMatch[2] },
    };
  }
  return { cleaned: text };
}

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

export function AIPanel() {
  const active             = useAppStore((s) => s.active);
  const setActive          = useAppStore((s) => s.setActive);
  const aiOpen             = useAppStore((s) => s.aiOpen);
  const setAiOpen          = useAppStore((s) => s.setAiOpen);
  const addNotification    = useAppStore((s) => s.addNotification);
  const lastGreetedDate    = useAppStore((s) => s.lastGreetedDate);
  const setLastGreetedDate = useAppStore((s) => s.setLastGreetedDate);
  const badges             = useAppStore((s) => s.badges);
  const aiPendingPrompt    = useAppStore((s) => s.aiPendingPrompt);
  const setAiPendingPrompt = useAppStore((s) => s.setAiPendingPrompt);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [lastAction, setLastAction] = useState<Message['action'] | null>(null);
  // Prevents double-greet if panel is toggled multiple times in a session
  const [sessionGreeted, setSessionGreeted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Check voice support
  useEffect(() => {
    setVoiceSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamBuffer]);
  useEffect(() => { if (aiOpen) setTimeout(() => inputRef.current?.focus(), 50); }, [aiOpen]);

  // ── Proactive daily greeting + CommandPalette prompt routing ─────────────
  // Priority: pending prompt from ⌘K → daily greeting → nothing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aiOpen) return;

    // ⌘K routed a specific prompt — send it immediately (skip greeting)
    if (aiPendingPrompt) {
      const p = aiPendingPrompt;
      setAiPendingPrompt(null);
      setTimeout(() => sendGreeting(p), 300);
      return;
    }

    // Daily greeting — once per session, once per calendar day
    if (sessionGreeted) return;
    if (lastGreetedDate === todayDateString()) return;

    const urgencyParts: string[] = [];
    if (badges.tasks > 0)         urgencyParts.push(`${badges.tasks} P0 task${badges.tasks > 1 ? 's' : ''}`);
    if (badges.jobs > 0)          urgencyParts.push(`${badges.jobs} active interview${badges.jobs > 1 ? 's' : ''}/offer${badges.jobs > 1 ? 's' : ''}`);
    if (badges.opportunities > 0) urgencyParts.push(`${badges.opportunities} new opportunit${badges.opportunities > 1 ? 'ies' : 'y'}`);

    const urgency = urgencyParts.length > 0 ? ` I have ${urgencyParts.join(', ')} right now.` : '';

    setSessionGreeted(true);
    setLastGreetedDate(todayDateString());

    setTimeout(() => {
      sendGreeting(`Good morning. Brief me on what matters most today.${urgency}`);
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOpen, aiPendingPrompt]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  /** Core streaming send — used by both user input and auto-greeting */
  const sendCore = useCallback(async (text: string, prevMessages: Message[]) => {
    const userMsg: Message = { role: 'user', content: text.trim() };
    const next = [...prevMessages, userMsg];
    setMessages(next);
    setInput('');
    setStreaming(true);
    setStreamBuffer('');
    setLastAction(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next, screen: active }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setStreamBuffer(accumulated);
      }

      let finalText = accumulated;
      let action: Message['action'] | undefined;

      // ── Parse tool result action tokens ───────────────────────────────────
      // Navigate
      const navToken = accumulated.match(/"navigateTo"\s*:\s*"(\w+)"[^}]*"reason"\s*:\s*"([^"]+)"/);
      if (navToken) {
        const screen = navToken[1] as ScreenKey;
        const reason = navToken[2];
        action = { type: 'navigate', screen, reason };
        finalText = accumulated.replace(/{[^}]*"navigateTo"[^}]*}/g, '').trim() || `Navigating to ${screen}…`;
        setTimeout(() => setActive(screen), 800);
      }

      // Task created
      const taskToken = accumulated.match(/"title"\s*:\s*"([^"]+)"[^}]*"priority"\s*:\s*"([^"]+)"[^}]*"success"\s*:\s*true/);
      if (taskToken && accumulated.includes('"success":true')) {
        action = { type: 'task_created', title: taskToken[1], priority: taskToken[2] };
        addNotification({ type: 'ai', title: 'Task created by AI', body: taskToken[1], screen: 'tasks' });
      }

      // Task updated
      const updateToken = accumulated.match(/"taskTitle"\s*:\s*"([^"]+)"[^}]*"status"\s*:\s*"([^"]+)"[^}]*"success"\s*:\s*true/);
      if (updateToken) {
        action = { type: 'task_updated', taskTitle: updateToken[1], status: updateToken[2] };
      }

      // Job added
      const jobToken = accumulated.match(/"company"\s*:\s*"([^"]+)"[^}]*"role"\s*:\s*"([^"]+)"[^}]*"stage"\s*:\s*"([^"]+)"[^}]*"success"\s*:\s*true/);
      if (jobToken) {
        action = { type: 'job_added', company: jobToken[1], role: jobToken[2], stage: jobToken[3] };
        addNotification({ type: 'job_action', title: 'Job added by AI', body: `${jobToken[1]} — ${jobToken[2]}`, screen: 'jobs' });
      }

      // Flashcard created
      const flashToken = accumulated.match(/"front"\s*:\s*"([^"]+)"[^}]*"deckName"\s*:\s*"([^"]+)"[^}]*"success"\s*:\s*true/);
      if (flashToken) {
        action = { type: 'flashcard_created', front: flashToken[1], deckName: flashToken[2] };
        addNotification({ type: 'ai', title: 'Flashcard created', body: flashToken[1], screen: 'learning' });
      }

      // Clean JSON fragments from display text
      const cleanText = finalText
        .replace(/\{[^}]{0,400}\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      setMessages((prev) => [...prev, { role: 'assistant', content: cleanText || 'Done.', action }]);
      if (action) setLastAction(action);
      setStreamBuffer('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Something went wrong. Try again.' }]);
        setStreamBuffer('');
      }
    } finally {
      setStreaming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, setActive, addNotification]);

  /** Public send — called from input UI (uses current messages state) */
  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    await sendCore(text, messages);
  }, [messages, streaming, sendCore]);

  /** Silent send for proactive greeting (empty message history) */
  const sendGreeting = useCallback(async (text: string) => {
    await sendCore(text, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendCore]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreamBuffer('');
    setStreaming(false);
    setInput('');
    setLastAction(null);
    setSessionGreeted(false); // allow re-greeting on manual reset
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (!aiOpen) return null;

  const hint = CONTEXTUAL_HINT[active] ?? 'Ask anything about your work, tasks, or pipeline.';
  const allMessages: Message[] = [...messages, ...(streamBuffer ? [{ role: 'assistant' as const, content: streamBuffer }] : [])];

  return (
    <aside className="ai-panel">
      <header className="ai-h">
        <span className="ai-glyph">✦</span>
        <b>Assistant</b>
        <span className="ai-ctx">contextual · {active}</span>
        <button className="ai-x" onClick={reset} aria-label="New conversation" title="New conversation" style={{ marginRight: 2 }}>
          <RotateCcw size={12} />
        </button>
        <button className="ai-x" onClick={() => setAiOpen(false)} aria-label="Close">
          <X size={14} />
        </button>
      </header>

      <div className="ai-stream">
        {allMessages.length === 0 ? (
          <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>{hint}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {getQuickPrompts(active).map((p) => (
                <button
                  key={p}
                  className="btn btn-ghost btn-sm"
                  style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: 11.5, whiteSpace: 'normal', height: 'auto', padding: '6px 10px', lineHeight: 1.4 }}
                  onClick={() => send(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          allMessages.map((msg, i) => (
            <div key={i} className={`ai-msg ai-msg-${msg.role === 'user' ? 'user' : 'bot'}`}>
              <div className="ai-msg-body">
                <FormattedMessage content={msg.content} streaming={streaming && i === allMessages.length - 1 && msg.role === 'assistant'} />
                {msg.action && <ActionBadge action={msg.action} onNavigate={(s) => { setActive(s); setAiOpen(false); }} />}
              </div>
            </div>
          ))
        )}
        {streaming && streamBuffer === '' && (
          <div className="ai-msg ai-msg-bot">
            <div className="ai-msg-body" style={{ color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12 }}>Working…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <footer className="ai-input-wrap">
        {voiceSupported && (
          <button
            className={`ai-send ${listening ? 'listening' : ''}`}
            onClick={listening ? stopListening : startListening}
            aria-label={listening ? 'Stop listening' : 'Start voice input'}
            title={listening ? 'Stop' : 'Voice input'}
            style={{
              background: listening ? 'color-mix(in oklch, var(--danger) 20%, transparent)' : 'transparent',
              color: listening ? 'var(--danger)' : 'var(--text-faint)',
              border: '1px solid var(--border-soft)',
              marginRight: 4,
              animation: listening ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          >
            {listening ? <MicOff size={13} /> : <Mic size={13} />}
          </button>
        )}
        <input
          ref={inputRef}
          className="ai-input"
          placeholder={listening ? 'Listening…' : 'Ask anything or give a command…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
        <button
          className="ai-send"
          onClick={() => send(input)}
          disabled={!input.trim() || streaming}
          aria-label="Send"
        >
          {streaming ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
        </button>
      </footer>
    </aside>
  );
}

const BADGE_ROW: React.CSSProperties = {
  marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
  borderRadius: 6, padding: '5px 10px', fontSize: 11.5,
};

function ActionBadge({ action, onNavigate }: { action: NonNullable<Message['action']>; onNavigate: (s: ScreenKey) => void }) {
  if (action.type === 'navigate') {
    return (
      <button
        onClick={() => onNavigate(action.screen)}
        style={{
          ...BADGE_ROW, cursor: 'pointer',
          background: 'color-mix(in oklch, var(--accent) 12%, transparent)',
          border: '1px solid color-mix(in oklch, var(--accent) 25%, transparent)',
          color: 'var(--accent)', fontFamily: 'inherit',
        }}
      >
        <Navigation size={11} /> Go to {action.screen} →
      </button>
    );
  }
  if (action.type === 'task_created') {
    return (
      <div style={{
        ...BADGE_ROW,
        background: 'color-mix(in oklch, var(--success) 10%, transparent)',
        border: '1px solid color-mix(in oklch, var(--success) 22%, transparent)',
        color: 'var(--success)',
      }}>
        <CheckCircle2 size={11} />
        <span>Task created: <strong>{action.title}</strong> [{action.priority}]</span>
      </div>
    );
  }
  if (action.type === 'task_updated') {
    return (
      <div style={{
        ...BADGE_ROW,
        background: 'color-mix(in oklch, var(--success) 10%, transparent)',
        border: '1px solid color-mix(in oklch, var(--success) 22%, transparent)',
        color: 'var(--success)',
      }}>
        <CheckCircle2 size={11} />
        <span>Updated: <strong>{action.taskTitle}</strong> → {action.status}</span>
      </div>
    );
  }
  if (action.type === 'job_added') {
    return (
      <div style={{
        ...BADGE_ROW,
        background: 'color-mix(in oklch, var(--accent) 10%, transparent)',
        border: '1px solid color-mix(in oklch, var(--accent) 22%, transparent)',
        color: 'var(--accent)',
      }}>
        <Briefcase size={11} />
        <span>Job added: <strong>{action.company}</strong> — {action.role} · {action.stage}</span>
      </div>
    );
  }
  if (action.type === 'flashcard_created') {
    return (
      <div style={{
        ...BADGE_ROW,
        background: 'color-mix(in oklch, var(--success) 10%, transparent)',
        border: '1px solid color-mix(in oklch, var(--success) 22%, transparent)',
        color: 'var(--success)',
      }}>
        <CheckCircle2 size={11} />
        <span>Flashcard created in <strong>{action.deckName}</strong></span>
      </div>
    );
  }
  return null;
}

function getQuickPrompts(screen: ScreenKey): string[] {
  const map: Partial<Record<ScreenKey, string[]>> = {
    dashboard:     [
      "What's my single highest-leverage move right now?",
      "Plan my day — create tasks for the top 3 priorities",
      "Summarize what's blocking me and suggest fixes",
    ],
    tasks:         [
      "Which tasks should I kill, defer, or attack today?",
      "Create a task: review all open job applications",
      "Break down my most complex P0 into subtasks",
    ],
    jobs:          [
      "Which application needs a follow-up this week?",
      "I just applied to [company] — add it to my pipeline",
      "Prepare me for my next interview",
    ],
    opportunities: [
      "Rank my opportunities by effort-to-reward ratio",
      "Create a task to tackle the top-scored opportunity",
      "Which opportunities have upcoming deadlines?",
    ],
    interview:     [
      "Quiz me on system design for 10 minutes",
      "What behavioral questions am I weakest on?",
      "Build me a prep plan for a FAANG system design round",
    ],
    focus:         [
      "Structure the next 90 minutes with time blocks",
      "What's the one thing I should ship this session?",
    ],
    brief:         [
      "What's the single most important thing I should do today?",
      "Which tasks are overdue or blocking other work?",
      "Give me a realistic energy forecast for today",
    ],
    vault:         [
      "Find my notes on system design",
      "What topics have I written about most?",
      "Search vault for interview prep notes",
    ],
    learning:      [
      "Create a flashcard: What is consistent hashing?",
      "What should I study for distributed systems interviews?",
      "Create a task to review flashcards tonight",
    ],
    resume:        [
      "Which bullets in my resume are weakest?",
      "Rewrite my experience section for a senior SWE role",
      "What skills am I missing for Staff Engineer positions?",
    ],
    analytics:     [
      "What productivity pattern do you see in my data?",
      "Am I making progress toward my career goals?",
      "Which day of the week am I most productive?",
    ],
    github:        [
      "Summarize my GitHub activity this week",
      "What open source contributions would boost my profile?",
    ],
    email:         [
      "Which emails need my immediate action?",
      "Convert my latest recruiter email into a task",
      "Draft a follow-up to my most recent interview",
    ],
  };
  return map[screen] ?? [
    "What should I focus on right now?",
    "Plan my day — create tasks for my top priorities",
    "I just applied to [company] — add it to my pipeline",
  ];
}

function FormattedMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  // Render markdown-ish: bold **text**, code `x`, bullet lines
  const lines = content.split('\n');
  return (
    <div style={{ margin: 0, lineHeight: 1.65, fontSize: 13 }}>
      {lines.map((line, li) => {
        // Bullet points
        const isBullet = /^[-•*]\s/.test(line.trim());
        const processedLine = line.replace(/^[-•*]\s/, '');
        const parts = processedLine.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        const rendered = parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>
                {part.slice(1, -1)}
              </code>
            );
          }
          return <span key={i}>{part}</span>;
        });

        return (
          <div key={li} style={{ marginBottom: li < lines.length - 1 ? (isBullet ? 2 : 6) : 0, display: 'flex', gap: isBullet ? 6 : 0 }}>
            {isBullet && <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>•</span>}
            <span>{rendered}</span>
          </div>
        );
      })}
      {streaming && <span className="ai-cursor">▌</span>}
    </div>
  );
}
