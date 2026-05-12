'use client';

import { useState, useCallback, useRef } from 'react';
import { Mail, RefreshCw, Sparkles, Loader2, ExternalLink, CheckSquare, X, ChevronDown, ChevronUp, Calendar, ArrowRight, MessageSquare } from 'lucide-react';
import { ScreenHeader, Pill } from '@/components/ui';
import { useAppStore, EMAIL_CACHE_TTL_MS } from '@/lib/store';
import type { Tone } from '@/types';

type Category = 'Interview' | 'Offer' | 'Rejection' | 'Action Required' | 'Opportunity' | 'Networking' | 'Informational' | 'Spam';
const CATS: Array<'all' | 'followups' | Category> = ['all', 'followups', 'Interview', 'Action Required', 'Opportunity', 'Offer', 'Rejection', 'Networking', 'Informational'];
const FOLLOWUP_CATS: Category[] = ['Interview', 'Action Required', 'Offer', 'Networking'];
const FOLLOWUP_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body?: string;
  date?: string;
  cat: Category;
  tone: Tone;
  action?: string;
  priority?: string;
  summary?: string;
  taskCreated?: boolean;
}

interface AiTask {
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
  dueDays: number | null;
  actionItems: string[];
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const DEMO_EMAILS: Email[] = [
  { id: 'e1', from: 'Sara at Stripe', subject: 'Onsite confirmation — Tuesday', snippet: "Looking forward to seeing you. Here's the schedule and your panel…", date: daysAgo(1), cat: 'Interview', tone: 'accent', action: 'Block 4:30–6:30pm Tue · prep packet ready', priority: 'high', summary: 'Stripe onsite confirmed for Tuesday 4:30pm — panel interview with 4 engineers. Bring laptop. Dress code: casual.' },
  { id: 'e2', from: 'jobs@linear.app', subject: 'Take-home assignment', snippet: 'Please complete by EOD Wednesday. Estimated time: 4 hours…', date: daysAgo(5), cat: 'Action Required', tone: 'warn', action: 'Created task: "Linear take-home" due Wed', priority: 'high', summary: 'Linear take-home due Wednesday EOD — design a data model for a collaborative task system. 4h estimate.' },
  { id: 'e3', from: 'Railway Bounties', subject: 'New bounty: OAuth proxy template', snippet: '$500 for a generic OAuth proxy template. 2 submissions so far.', date: daysAgo(2), cat: 'Opportunity', tone: 'success', action: 'Saved to Opportunity radar (score 94)', priority: 'normal', summary: '$500 Railway bounty — build a generic OAuth proxy template. 2 competitors so far, deadline in 5 days.' },
  { id: 'e4', from: 'Vercel HR', subject: 'We went with another candidate', snippet: 'We appreciate the time you took to interview with us…', date: daysAgo(8), cat: 'Rejection', tone: 'danger', action: 'Marked Vercel as Rejected · removed from pipeline', priority: 'normal', summary: 'Vercel rejection after final round. No specific feedback given.' },
  { id: 'e5', from: 'Maya Lin', subject: 'Coffee chat next week?', snippet: 'Loved your post on websockets. Free Thursday or Friday?', date: daysAgo(10), cat: 'Networking', tone: 'neutral', priority: 'low', summary: 'Maya (eng @ Cloudflare) wants to connect over websockets post. Could be a good networking contact.' },
  { id: 'e6', from: 'GitHub Notifications', subject: 'Issue #4821 has activity', snippet: 'A maintainer commented on the issue you bookmarked.', date: daysAgo(3), cat: 'Opportunity', tone: 'success', action: 'Bumped to top of opportunity radar', priority: 'normal', summary: 'Vite maintainer replied to issue #4821 you bookmarked. Good chance to contribute.' },
  { id: 'e7', from: 'Notion Careers', subject: 'Quick intro?', snippet: 'Hi — saw your portfolio. Would love a 15-min chat…', date: daysAgo(12), cat: 'Networking', tone: 'neutral', action: 'Suggested response drafted', priority: 'low', summary: 'Notion recruiter outreach — early stage. Role not specified yet.' },
  { id: 'e8', from: 'AWS Billing', subject: 'Your monthly invoice — $12.40', snippet: '$12.40 for usage in October.', date: daysAgo(6), cat: 'Informational', tone: 'neutral', priority: 'low', summary: 'AWS bill $12.40 for October. No action needed.' },
  { id: 'e9', from: 'David at Acme', subject: 'Offer letter attached', snippet: 'Attached the offer letter. Happy to discuss any questions…', date: daysAgo(4), cat: 'Offer', tone: 'success', action: 'Negotiation prompts drafted · decide by Mon', priority: 'high', summary: 'Acme offer letter attached. Base $180k + equity. Respond by Monday. Negotiation window open.' },
];

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

function priorityDot(priority?: string) {
  if (!priority || priority === 'low') return null;
  return <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: priority === 'high' ? 'var(--danger)' : 'var(--warn)' }} />;
}

const SMART_ACTIONS: Partial<Record<Category, string[]>> = {
  'Interview':       ['Create task', 'Block calendar', 'Generate prep plan'],
  'Action Required': ['Create task', 'Set reminder', 'Draft reply'],
  'Offer':           ['Create task', 'Draft negotiation reply', 'Compare offers'],
  'Networking':      ['Draft reply', 'Create task', 'Add to contacts'],
  'Opportunity':     ['Create task', 'Add to opportunities'],
  'Rejection':       ['Log rejection', 'Request feedback'],
};

function initFromCache(): { emails: Email[]; connected: boolean; needsFetch: boolean } {
  const cache = useAppStore.getState().emailCache;
  if (cache && Date.now() - cache.cachedAt < EMAIL_CACHE_TTL_MS) {
    return { emails: cache.emails as Email[], connected: cache.connected, needsFetch: false };
  }
  return { emails: DEMO_EMAILS, connected: false, needsFetch: true };
}

interface EmailRowProps {
  email: Email;
  isExpanded: boolean;
  onToggle: () => void;
  onCreateTask: (email: Email) => void;
  processingId: string | null;
  creatingTaskId: string | null;
  aiTask: AiTask | null;
}

function EmailRow({ email: e, isExpanded, onToggle, onCreateTask, processingId, creatingTaskId, aiTask }: EmailRowProps) {
  const actions = SMART_ACTIONS[e.cat] ?? [];

  return (
    <li style={{ borderBottom: '1px solid var(--border-soft)' }}>
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{ padding: '11px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', transition: 'background 120ms' }}
        onMouseEnter={(el) => { el.currentTarget.style.background = 'color-mix(in oklch, var(--accent) 4%, transparent)'; }}
        onMouseLeave={(el) => { el.currentTarget.style.background = 'transparent'; }}
      >
        {priorityDot(e.priority)}
        <div style={{ paddingTop: 1, flexShrink: 0 }}>
          <Pill tone={e.tone as Tone}>{e.cat}</Pill>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: 130, flexShrink: 0, paddingTop: 2 }}>
          {e.from.replace(/<.*>/, '').trim()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{e.subject}</span>
            {!isExpanded && e.snippet && (
              <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>
                — {e.snippet.slice(0, 70)}{e.snippet.length > 70 ? '…' : ''}
              </span>
            )}
          </div>
          {!isExpanded && e.action && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <span style={{ color: 'var(--accent)', fontSize: 11 }}>✦</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{e.action}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
            {e.date ? timeAgo(e.date) : 'Today'}
          </span>
          {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--text-faint)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-faint)' }} />}
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '0 16px 14px 16px', borderTop: '1px solid var(--border-soft)', background: 'color-mix(in oklch, var(--accent) 3%, transparent)' }}>

          {/* AI Summary */}
          {e.summary && (
            <div style={{ padding: '12px 0 10px', display: 'flex', gap: 8 }}>
              <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>AI Summary</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>{e.summary}</p>
              </div>
            </div>
          )}

          {/* AI-extracted task preview */}
          {aiTask && (
            <div style={{ margin: '8px 0', padding: '10px 12px', background: 'color-mix(in oklch, var(--accent) 8%, transparent)', border: '1px solid color-mix(in oklch, var(--accent) 22%, transparent)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>✦ Suggested task</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{aiTask.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6, lineHeight: 1.5 }}>{aiTask.description}</div>
              {aiTask.actionItems.length > 0 && (
                <ul style={{ margin: '0 0 6px', padding: '0 0 0 14px', fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                  {aiTask.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Pill tone={aiTask.priority === 'P0' ? 'danger' : aiTask.priority === 'P1' ? 'warn' : 'neutral'}>{aiTask.priority}</Pill>
                {aiTask.dueDays !== null && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                    Due in {aiTask.dueDays}d
                  </span>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  style={{ marginLeft: 'auto', gap: 5, fontSize: 11.5 }}
                  onClick={(ev) => { ev.stopPropagation(); onCreateTask(e); }}
                  disabled={processingId === e.id || e.taskCreated}
                >
                  {processingId === e.id
                    ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                    : <CheckSquare size={10} />}
                  {e.taskCreated ? 'Created ✓' : 'Add to tasks'}
                </button>
              </div>
            </div>
          )}

          {/* Smart action buttons */}
          {actions.length > 0 && !aiTask && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 10 }}>
              {actions.map((act) => (
                <button
                  key={act}
                  className="btn btn-ghost btn-sm"
                  style={{ gap: 5, fontSize: 11.5 }}
                  disabled={processingId === e.id || creatingTaskId === e.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (act === 'Create task') onCreateTask(e);
                  }}
                >
                  {act === 'Create task' && (
                    processingId === e.id || creatingTaskId === e.id
                      ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                      : <CheckSquare size={10} />
                  )}
                  {act === 'Block calendar' && <Calendar size={10} />}
                  {act === 'Draft reply' && <MessageSquare size={10} />}
                  {act === 'Draft negotiation reply' && <MessageSquare size={10} />}
                  {act === 'Generate prep plan' && <Sparkles size={10} style={{ color: 'var(--accent)' }} />}
                  {act === 'Add to opportunities' && <ArrowRight size={10} />}
                  {act}
                  {act === 'Create task' && e.taskCreated && ' ✓'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function EmailScreen() {
  const [cat, setCat] = useState<'all' | 'followups' | Category>('all');
  const initial = useRef(initFromCache());
  const [emails, setEmails] = useState<Email[]>(initial.current.emails);
  const [connected, setConnected] = useState(initial.current.connected);
  const [loading, setLoading] = useState(initial.current.needsFetch);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);
  const [aiTasks, setAiTasks] = useState<Record<string, AiTask>>({});

  const addNotification = useAppStore((s) => s.addNotification);
  const setEmailCache = useAppStore((s) => s.setEmailCache);

  const load = useCallback(async (force = false) => {
    const cache = useAppStore.getState().emailCache;
    if (!force && cache && Date.now() - cache.cachedAt < EMAIL_CACHE_TTL_MS) {
      setEmails(cache.emails as Email[]);
      setConnected(cache.connected);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/gmail');
      const data = await res.json() as { error?: string; message?: string; emails?: Email[]; connected?: boolean };
      if (data.error) {
        setError({ type: data.error, message: data.message ?? '' });
        setConnected(false);
      } else if (data.emails) {
        setEmails(data.emails);
        setConnected(true);
        setError(null);
        setEmailCache({ emails: data.emails, connected: true, cachedAt: Date.now() });
        const actionItems = data.emails.filter((e) => e.cat === 'Action Required' || e.cat === 'Interview' || e.cat === 'Offer');
        for (const e of actionItems.slice(0, 2)) {
          addNotification({ type: e.cat === 'Interview' ? 'interview' : 'task_due', title: e.cat, body: e.subject, screen: 'email' });
        }
      }
    } catch {
      setError({ type: 'fetch_error', message: 'Failed to load emails' });
    } finally {
      setLoading(false);
    }
  }, [addNotification, setEmailCache]);

  const didFetch = useRef(false);
  if (!didFetch.current) {
    didFetch.current = true;
    if (initial.current.needsFetch) {
      Promise.resolve().then(() => load(true));
    }
  }

  const handleToggleExpand = async (email: Email) => {
    if (expandedId === email.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(email.id);
    // Fetch AI task suggestion if not already done and category warrants it
    const shouldFetchAiTask = ['Interview', 'Action Required', 'Offer', 'Opportunity', 'Networking'].includes(email.cat);
    if (shouldFetchAiTask && !aiTasks[email.id]) {
      try {
        const res = await fetch('/api/ai/email-task', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subject: email.subject, body: email.body ?? email.snippet, category: email.cat }),
        });
        if (res.ok) {
          const task = await res.json() as AiTask;
          setAiTasks((prev) => ({ ...prev, [email.id]: task }));
        }
      } catch { /* silent — AI enhancement, not critical */ }
    }
  };

  const createTask = async (email: Email) => {
    const aiTask = aiTasks[email.id];
    setProcessingId(email.id);
    try {
      await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          emailId: email.id,
          action: 'create_task',
          subject: aiTask?.title ?? email.subject,
          description: aiTask?.description,
          priority: aiTask?.priority,
          dueDays: aiTask?.dueDays,
        }),
      });
      setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, taskCreated: true } : e));
      addNotification({ type: 'ai', title: 'Task created from email', body: aiTask?.title ?? email.subject, screen: 'tasks' });
    } catch { /* silent */ } finally {
      setProcessingId(null);
    }
  };

  const followUpEmails = emails.filter((e) => {
    if (!FOLLOWUP_CATS.includes(e.cat)) return false;
    if (e.taskCreated) return false;
    // For demo emails with no real date, treat priority:high as awaiting follow-up
    if (!e.date) return e.priority === 'high' || e.priority === 'normal';
    return Date.now() - new Date(e.date).getTime() > FOLLOWUP_THRESHOLD_MS;
  });

  const list = cat === 'all' ? emails : cat === 'followups' ? followUpEmails : emails.filter((e) => e.cat === cat);
  const count = (c: 'all' | 'followups' | Category) => {
    if (c === 'all') return emails.length;
    if (c === 'followups') return followUpEmails.length;
    return emails.filter((e) => e.cat === c).length;
  };
  const actionCount = emails.filter((e) => e.cat === 'Action Required' || e.cat === 'Interview' || e.cat === 'Offer').length;

  return (
    <div className="screen">
      <ScreenHeader
        title="Inbox intelligence"
        subtitle={
          connected
            ? `${emails.length} synced · ${emails.filter((e) => e.cat === 'Action Required').length} action required · ${emails.filter((e) => e.cat === 'Interview').length} interview`
            : `${emails.length} demo emails · connect Gmail for real data`
        }
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {connected ? (
              <button className="btn btn-ghost" style={{ gap: 6, fontSize: 12 }} onClick={() => load(true)}>
                <RefreshCw size={12} /> Sync now
              </button>
            ) : (
              <a href="/api/auth/signin/google?callbackUrl=/" className="btn btn-ghost" style={{ gap: 6, fontSize: 12, textDecoration: 'none' }}>
                <Mail size={12} /> Connect Gmail
              </a>
            )}
          </div>
        }
      />

      {error && !dismissed && (
        <div style={{
          background: ['not_connected', 'not_configured', 'setup'].includes(error.type)
            ? 'color-mix(in oklch, var(--accent) 7%, transparent)'
            : 'color-mix(in oklch, var(--danger) 8%, transparent)',
          border: `1px solid color-mix(in oklch, ${['not_connected', 'not_configured', 'setup'].includes(error.type) ? 'var(--accent)' : 'var(--danger)'} 22%, transparent)`,
          borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Sparkles size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {error.type === 'not_configured' ? 'Gmail setup required' : error.type === 'not_connected' ? 'Gmail not connected' : 'Gmail error'}
            </div>
            {(error.type === 'not_configured' || error.type === 'setup') ? (
              <ol style={{ margin: '6px 0 0', padding: '0 0 0 18px', fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.8 }}>
                <li>Google Cloud Console → Enable Gmail API → Create OAuth 2.0 credentials (Web app)</li>
                <li>Add redirect URI: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>http://localhost:3001/api/auth/callback/google</code></li>
                <li>Add <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>GOOGLE_CLIENT_ID</code> and <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>GOOGLE_CLIENT_SECRET</code> to <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>.env.local</code></li>
                <li>Restart dev server → sign in with Google</li>
              </ol>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {error.message}{' '}
                {error.type === 'not_connected' && (
                  <a href="/api/auth/signin/google" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in with Google →</a>
                )}
              </div>
            )}
          </div>
          <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2, lineHeight: 1 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {!dismissed && actionCount > 0 && (
        <div style={{ background: 'color-mix(in oklch, var(--accent) 7%, transparent)', border: '1px solid color-mix(in oklch, var(--accent) 22%, transparent)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Sparkles size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
            <strong>{actionCount} emails need attention</strong>
            <span style={{ color: 'var(--text-dim)' }}> — </span>
            <span style={{ color: 'var(--text-faint)' }}>
              {emails.filter((e) => e.cat === 'Interview').length > 0 && `${emails.filter((e) => e.cat === 'Interview').length} interview · `}
              {emails.filter((e) => e.cat === 'Offer').length > 0 && `${emails.filter((e) => e.cat === 'Offer').length} offer · `}
              {emails.filter((e) => e.cat === 'Action Required').length > 0 && `${emails.filter((e) => e.cat === 'Action Required').length} action required`}
            </span>
          </div>
          {!connected && <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 4 }}>Demo data</span>}
        </div>
      )}

      <div className="tabs" style={{ overflowX: 'auto' }}>
        {CATS.map((c) => (
          <button
            key={c}
            className={`tab ${cat === c ? 'on' : ''}`}
            onClick={() => setCat(c)}
            style={c === 'followups' && followUpEmails.length > 0 ? { color: 'var(--warn)' } : undefined}
          >
            {c === 'followups' ? '⏰ Follow-ups' : c === 'all' ? 'All' : c}
            <span className="tab-count">{count(c)}</span>
          </button>
        ))}
      </div>

      {cat === 'followups' && followUpEmails.length > 0 && (
        <div style={{ background: 'color-mix(in oklch, var(--warn) 7%, transparent)', border: '1px solid color-mix(in oklch, var(--warn) 22%, transparent)', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--warn)', fontWeight: 600 }}>⏰ {followUpEmails.length} email{followUpEmails.length !== 1 ? 's' : ''} need a follow-up</span>
          <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>— these are in your action categories but haven't been tasked or replied to yet.</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <section className="panel panel-flush">
          {list.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12.5 }}>
              No emails in this category
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {list.map((e) => (
                <EmailRow
                  key={e.id}
                  email={e}
                  isExpanded={expandedId === e.id}
                  onToggle={() => handleToggleExpand(e)}
                  onCreateTask={createTask}
                  processingId={processingId}
                  creatingTaskId={creatingTaskId}
                  aiTask={aiTasks[e.id] ?? null}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-faint)', paddingLeft: 4 }}>
        Click an email to expand · AI summarises and suggests tasks automatically
      </div>
    </div>
  );
}
