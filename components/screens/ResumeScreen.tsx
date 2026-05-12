'use client';

import { useState, useRef } from 'react';
import { Upload, Sparkles, FileText, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { ScreenHeader } from '@/components/ui';

interface MatchResult {
  score: number;
  matched: string[];
  missing: string[];
  suggestions: string[];
  summary: string;
}

interface Section {
  id: string;
  title: string;
  content: string;
  expanded: boolean;
}

function readFileSync(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? '');
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function ResumeScreen() {
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await readFileSync(file);
      setResumeText(text);
    } catch {
      setError('Could not read file. Paste your resume text below.');
    }
  };

  const analyze = async () => {
    if (!resumeText.trim()) { setError('Paste your resume text or upload a file first.'); return; }
    if (!jdText.trim()) { setError('Paste the job description you are targeting.'); return; }
    setError('');
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: resumeText, jd: jdText }),
      });
      const data = await res.json() as MatchResult & { error?: string };
      if (data.error) { setError(data.error); return; }
      setResult(data);
      // parse resume into sections for display
      const lines = resumeText.split('\n');
      const parsed: Section[] = [];
      let cur: Section | null = null;
      for (const line of lines) {
        if (line.match(/^[A-Z][A-Z\s]{3,}$/) || line.match(/^#+\s/)) {
          if (cur) parsed.push(cur);
          cur = { id: line.trim(), title: line.replace(/^#+\s/, '').trim(), content: '', expanded: false };
        } else if (cur) {
          cur.content += line + '\n';
        }
      }
      if (cur) parsed.push(cur);
      if (parsed.length === 0) {
        setSections([{ id: 'full', title: 'Resume', content: resumeText, expanded: true }]);
      } else {
        setSections(parsed);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSection = (id: string) =>
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, expanded: !s.expanded } : s));

  const scoreColor = !result ? 'var(--text-faint)'
    : result.score >= 80 ? 'var(--success)'
    : result.score >= 60 ? 'var(--warn)'
    : 'var(--danger)';

  return (
    <div className="screen">
      <ScreenHeader
        title="Resume"
        subtitle="AI-powered resume ↔ job description matcher"
        actions={
          result && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setResult(null); setSections([]); }}>
              Reset
            </button>
          )
        }
      />

      {!result ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Resume input */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} style={{ color: 'var(--accent)' }} /> Your Resume
              </span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={11} /> {fileName || 'Upload .txt / .md'}
              </button>
              <input ref={fileRef} type="file" accept=".txt,.md,.text" style={{ display: 'none' }} onChange={handleFileUpload} />
            </div>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume here, or upload a .txt / .md file above.&#10;&#10;Include your experience, skills, education, and projects."
              style={{
                width: '100%', minHeight: 320, background: 'none', border: 'none', outline: 'none',
                padding: '12px 14px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-mono)',
                resize: 'vertical', lineHeight: 1.6,
              }}
            />
          </div>

          {/* JD input */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} style={{ color: 'var(--warn)' }} /> Job Description
              </span>
            </div>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job description here.&#10;&#10;The more complete the JD, the more accurate the match analysis."
              style={{
                width: '100%', minHeight: 320, background: 'none', border: 'none', outline: 'none',
                padding: '12px 14px', fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-mono)',
                resize: 'vertical', lineHeight: 1.6,
              }}
            />
          </div>

          {error && (
            <div style={{ gridColumn: '1/-1', background: 'color-mix(in oklch, var(--danger) 10%, transparent)', border: '1px solid color-mix(in oklch, var(--danger) 25%, transparent)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={analyze}
              disabled={analyzing || !resumeText.trim() || !jdText.trim()}
              style={{ gap: 8, padding: '9px 24px', fontSize: 13.5 }}
            >
              {analyzing
                ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
                : <><Sparkles size={14} /> Analyze match</>}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* Left — resume sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              {result.summary}
            </div>
            {sections.map((s) => (
              <div key={s.id} style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => toggleSection(s.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{s.title}</span>
                  {s.expanded ? <ChevronUp size={13} style={{ color: 'var(--text-faint)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-faint)' }} />}
                </button>
                {s.expanded && (
                  <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-soft)' }}>
                    <pre style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {s.content.trim()}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right — score + analysis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Score ring */}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', width: 96, height: 96 }}>
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="var(--border-soft)" strokeWidth="8" />
                  <circle
                    cx="48" cy="48" r="40" fill="none"
                    stroke={scoreColor} strokeWidth="8"
                    strokeDasharray={`${(result.score / 100) * 251.2} 251.2`}
                    strokeLinecap="round"
                    transform="rotate(-90 48 48)"
                    style={{ transition: 'stroke-dasharray 0.8s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: scoreColor }}>{result.score}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>/ 100</span>
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Match score</span>
            </div>

            {/* Matched keywords */}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={12} /> Matched ({result.matched.length})
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {result.matched.map((k) => (
                  <span key={k} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'color-mix(in oklch, var(--success) 12%, transparent)', color: 'var(--success)' }}>{k}</span>
                ))}
              </div>
            </div>

            {/* Missing keywords */}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={12} /> Missing ({result.missing.length})
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {result.missing.map((k) => (
                  <span key={k} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'color-mix(in oklch, var(--danger) 12%, transparent)', color: 'var(--danger)' }}>{k}</span>
                ))}
              </div>
            </div>

            {/* Suggestions */}
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={12} /> AI suggestions
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
                {result.suggestions.map((s, i) => (
                  <li key={i} style={{ padding: '6px 12px', borderBottom: i < result.suggestions.length - 1 ? '1px solid var(--border-soft)' : 'none', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <button className="btn btn-ghost btn-sm" onClick={() => { setResult(null); setSections([]); }} style={{ fontSize: 12 }}>
              ← Analyze a different JD
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
