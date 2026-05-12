'use client';

import { useState, useMemo, useEffect, useTransition } from 'react';
import { Plus, Search, Link2, Loader2, Trash2, Save, X, ExternalLink, ArrowRight } from 'lucide-react';
import { getNotes, createNote, updateNote, deleteNote } from '@/lib/actions/notes';
import type { Note } from '@prisma/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// ── Wiki-link helpers ──────────────────────────────────────────────────────

/** Convert [[note title]] → [title](hustle://wiki/NOTE_ID) for ReactMarkdown */
function parseWikiLinks(content: string, notes: Note[]): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, title: string) => {
    const target = notes.find(
      (n) => n.title.toLowerCase() === title.trim().toLowerCase()
    );
    if (!target) return `\`[[${title}]]\``; // broken link → code span
    return `[${title}](hustle://wiki/${target.id})`;
  });
}

/** Extract all [[...]] references from raw markdown content */
function extractWikiRefs(content: string): string[] {
  const matches = [...content.matchAll(/\[\[([^\]]+)\]\]/g)];
  return [...new Set(matches.map((m) => m[1].trim()))];
}

// ── Component ──────────────────────────────────────────────────────────────

export function VaultScreen() {
  const [notes, setNotes]     = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery]     = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle]   = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags]     = useState('');
  const [saving, startSave]   = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    getNotes().then((data) => {
      setNotes(data);
      if (data.length > 0) setActiveId(data[0].id);
    }).finally(() => setLoading(false));
  }, []);

  const allTags = useMemo(() =>
    Array.from(new Set(notes.flatMap((n) => n.tags))).sort(),
    [notes]
  );

  const filtered = useMemo(() =>
    notes.filter((n) => {
      const q = query.toLowerCase();
      const matchQ = !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
      const matchTag = !tagFilter || n.tags.includes(tagFilter);
      return matchQ && matchTag;
    }),
    [notes, query, tagFilter]
  );

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  /** Notes that reference this note — by explicit links[] or [[title]] in content */
  const backlinks = useMemo(() => {
    if (!activeNote) return [];
    return notes.filter((n) => {
      if (n.id === activeNote.id) return false;
      if (n.links.includes(activeNote.id)) return true;
      const refs = extractWikiRefs(n.content);
      return refs.some((r) => r.toLowerCase() === activeNote.title.toLowerCase());
    });
  }, [notes, activeNote]);

  /** [[...]] links referenced in the active note (outgoing) */
  const outlinks = useMemo(() => {
    if (!activeNote) return [];
    return extractWikiRefs(activeNote.content).map((ref) => ({
      ref,
      target: notes.find((n) => n.title.toLowerCase() === ref.toLowerCase()) ?? null,
    }));
  }, [notes, activeNote]);

  /** ReactMarkdown components — intercept hustle://wiki/ links */
  const markdownComponents = useMemo((): Components => ({
    a: ({ href, children }) => {
      if (href?.startsWith('hustle://wiki/')) {
        const id = decodeURIComponent(href.replace('hustle://wiki/', ''));
        const exists = notes.some((n) => n.id === id);
        return (
          <button
            onClick={() => { if (exists) { setActiveId(id); setEditing(false); } }}
            style={{
              background: exists ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'color-mix(in oklch, var(--text-faint) 10%, transparent)',
              border: `1px solid ${exists ? 'color-mix(in oklch, var(--accent) 30%, transparent)' : 'var(--border-soft)'}`,
              borderRadius: 4,
              padding: '0px 5px',
              cursor: exists ? 'pointer' : 'default',
              color: exists ? 'var(--accent)' : 'var(--text-faint)',
              font: 'inherit',
              fontSize: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            {children}
            {!exists && <span style={{ fontSize: 9, opacity: 0.6 }}>?</span>}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {children}<ExternalLink size={10} style={{ opacity: 0.6 }} />
        </a>
      );
    },
  }), [notes]);

  /** Content with [[title]] converted to markdown links */
  const processedContent = useMemo(() => {
    if (!activeNote) return '';
    return parseWikiLinks(activeNote.content, notes);
  }, [activeNote, notes]);

  const startEdit = (note: Note) => {
    setEditing(true);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditTags(note.tags.join(', '));
  };

  const saveEdit = () => {
    if (!activeNote) return;
    const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
    startSave(async () => {
      const updated = await updateNote(activeNote.id, { title: editTitle, content: editContent, tags });
      setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
      setEditing(false);
    });
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    startSave(async () => {
      const note = await createNote({ title: newTitle.trim(), content: '' });
      setNotes((prev) => [note, ...prev]);
      setActiveId(note.id);
      setNewTitle('');
      setShowNew(false);
      setEditing(true);
      setEditTitle(note.title);
      setEditContent('');
      setEditTags('');
    });
  };

  const handleDelete = (id: string) => {
    startSave(async () => {
      await deleteNote(id);
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        if (activeId === id) setActiveId(next[0]?.id ?? null);
        return next;
      });
      if (editing && activeId === id) setEditing(false);
    });
  };

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="screen" style={{ padding: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: 'calc(100vh - 44px)', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{ borderRight: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '5px 8px' }}>
              <Search size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <input
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', fontFamily: 'inherit' }}
                placeholder="Search notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ padding: '5px 7px', flexShrink: 0 }}
              onClick={() => setShowNew(true)}
            >
              <Plus size={12} />
            </button>
          </div>

          {/* New note inline */}
          {showNew && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', display: 'flex', gap: 6 }}>
              <input
                autoFocus
                placeholder="Note title…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setShowNew(false); setNewTitle(''); }
                }}
                style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 5, padding: '5px 8px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
              />
              <button className="btn btn-primary btn-sm" style={{ padding: '4px 8px' }} onClick={handleCreate} disabled={!newTitle.trim() || saving}>
                <Save size={11} />
              </button>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => { setShowNew(false); setNewTitle(''); }}>
                <X size={11} />
              </button>
            </div>
          )}

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div style={{ padding: '6px 10px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--border-soft)' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 10.5, padding: '2px 7px', ...(tagFilter === null ? { color: 'var(--accent)' } : {}) }}
                onClick={() => setTagFilter(null)}
              >All</button>
              {allTags.map((t) => (
                <button
                  key={t}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 10.5, padding: '2px 7px', ...(tagFilter === t ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}) }}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Note list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
                {notes.length === 0 ? 'No notes yet' : 'No matches'}
              </div>
            ) : (
              filtered.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { setActiveId(n.id); setEditing(false); }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: activeId === n.id ? 'color-mix(in oklch, var(--accent) 8%, transparent)' : 'transparent',
                    borderLeft: activeId === n.id ? '2px solid var(--accent)' : '2px solid transparent',
                    border: 'none', borderRight: 'none', borderTop: 'none', borderBottom: '1px solid var(--border-soft)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>{n.title}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {n.tags.slice(0, 3).map((t) => (
                      <span key={t} style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>#{t}</span>
                    ))}
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto' }}>
                      {new Date(n.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Wiki-link hint */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-soft)', fontSize: 10.5, color: 'var(--text-faint)' }}>
            Use <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '0 3px', borderRadius: 3 }}>[[note title]]</code> to link notes
          </div>
        </div>

        {/* ── Editor / Viewer ── */}
        {activeNote ? (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ padding: '10px 20px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {editing ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'inherit', width: '100%' }}
                  />
                ) : activeNote.title}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {editing ? (
                  <>
                    <input
                      placeholder="tags, comma separated"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      style={{ fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 4, padding: '3px 7px', color: 'var(--text-dim)', outline: 'none', width: 160 }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                      <Save size={11} /> Save
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                      <X size={11} />
                    </button>
                  </>
                ) : (
                  <>
                    {activeNote.tags.map((t) => (
                      <span key={t} style={{ fontSize: 10.5, color: 'var(--text-faint)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 4 }}>#{t}</span>
                    ))}
                    <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(activeNote.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => startEdit(activeNote)}>Edit</button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)', padding: '3px 6px' }}
                      onClick={() => handleDelete(activeNote.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {editing ? (
                <>
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder={`Write in Markdown…\n\nTip: use [[note title]] to link to other notes`}
                    style={{
                      width: '100%', minHeight: '60vh', background: 'none', border: 'none', outline: 'none',
                      fontSize: 13.5, color: 'var(--text)', fontFamily: 'var(--font-mono)', lineHeight: 1.7,
                      resize: 'none',
                    }}
                  />
                  {/* Live preview of wiki links while editing */}
                  {extractWikiRefs(editContent).length > 0 && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--surface)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-dim)' }}>
                      <span style={{ color: 'var(--text-faint)', marginRight: 6 }}>Links detected:</span>
                      {extractWikiRefs(editContent).map((ref) => {
                        const found = notes.find((n) => n.title.toLowerCase() === ref.toLowerCase());
                        return (
                          <span key={ref} style={{ marginRight: 8, color: found ? 'var(--accent)' : 'var(--text-faint)' }}>
                            [[{ref}]]{!found && ' ⚠ not found'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : activeNote.content ? (
                <div className="vault-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {processedContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <div style={{ color: 'var(--text-faint)', fontSize: 13, paddingTop: 8 }}>
                  Empty note — <button
                    onClick={() => startEdit(activeNote)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0 }}
                  >click to edit</button>
                </div>
              )}

              {/* ── Graph panel: outlinks + backlinks ── */}
              {!editing && (outlinks.length > 0 || backlinks.length > 0) && (
                <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border-soft)', display: 'grid', gridTemplateColumns: outlinks.length > 0 && backlinks.length > 0 ? '1fr 1fr' : '1fr', gap: 20 }}>
                  {/* Outgoing links */}
                  {outlinks.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowRight size={11} /> {outlinks.length} link{outlinks.length !== 1 ? 's' : ''} out
                      </div>
                      {outlinks.map(({ ref, target }) => (
                        <button
                          key={ref}
                          onClick={() => { if (target) { setActiveId(target.id); setEditing(false); } }}
                          disabled={!target}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: target ? 'pointer' : 'default',
                            fontSize: 12.5, color: target ? 'var(--accent)' : 'var(--text-faint)',
                            display: 'block', marginBottom: 4, textAlign: 'left',
                            opacity: target ? 1 : 0.5,
                          }}
                        >
                          → {ref}{!target && ' (not found)'}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Backlinks */}
                  {backlinks.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Link2 size={11} /> {backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''}
                      </div>
                      {backlinks.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { setActiveId(n.id); setEditing(false); }}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, color: 'var(--accent)', display: 'block', marginBottom: 4, textAlign: 'left' }}
                        >
                          ← {n.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            {notes.length === 0
              ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
                  Your knowledge vault is empty.
                  <br />
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowNew(true)}>
                    <Plus size={12} /> Create first note
                  </button>
                  <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-faint)', maxWidth: 280 }}>
                    Tip: use <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '0 3px', borderRadius: 3 }}>[[note title]]</code> in any note to link to another
                  </div>
                </div>
              )
              : 'Select a note'}
          </div>
        )}
      </div>
    </div>
  );
}
