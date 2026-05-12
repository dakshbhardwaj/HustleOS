'use client';

import { useState, useEffect, useTransition } from 'react';
import { Plus, ChevronLeft, RotateCcw, Check, X, Loader2, Trash2, Save } from 'lucide-react';
import { ScreenHeader, Pill } from '@/components/ui';
import { getDecks, createDeck, createCard, gradeCard, deleteDeck } from '@/lib/actions/decks';
import type { Deck, Card } from '@prisma/client';

type DeckWithCards = Deck & { cards: Card[] };

type ReviewPhase = 'front' | 'back';

function dueCards(deck: DeckWithCards): Card[] {
  const now = new Date();
  return deck.cards.filter((c) => new Date(c.dueAt) <= now);
}

function deckColor(deck: DeckWithCards): string {
  // Use stored color but fall back gracefully
  return deck.color || 'var(--accent)';
}

export function LearningScreen() {
  const [decks, setDecks] = useState<DeckWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, startSave] = useTransition();

  // Review state
  const [reviewDeck, setReviewDeck] = useState<DeckWithCards | null>(null);
  const [reviewQueue, setReviewQueue] = useState<Card[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [phase, setPhase] = useState<ReviewPhase>('front');
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  // Add deck modal
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckTag, setNewDeckTag] = useState('');

  // Add card modal
  const [addCardDeckId, setAddCardDeckId] = useState<string | null>(null);
  const [cardFront, setCardFront] = useState('');
  const [cardBack, setCardBack] = useState('');

  useEffect(() => {
    getDecks().then(setDecks).finally(() => setLoading(false));
  }, []);

  const totalDue = decks.reduce((sum, d) => sum + dueCards(d).length, 0);
  const totalCards = decks.reduce((sum, d) => sum + d.cards.length, 0);

  const startReview = (deck: DeckWithCards) => {
    const due = dueCards(deck);
    if (due.length === 0) return;
    setReviewDeck(deck);
    setReviewQueue(due);
    setQueueIdx(0);
    setPhase('front');
    setReviewDone(false);
    setReviewed(0);
  };

  const grade = (quality: 0 | 1 | 2) => {
    const card = reviewQueue[queueIdx];
    startSave(async () => {
      const updated = await gradeCard(card.id, quality);
      // Update card in local state
      setDecks((prev) => prev.map((d) => ({
        ...d,
        cards: d.cards.map((c) => c.id === updated.id ? updated : c),
      })));
    });
    setReviewed((r) => r + 1);
    if (queueIdx + 1 >= reviewQueue.length) {
      setReviewDone(true);
    } else {
      setQueueIdx((i) => i + 1);
      setPhase('front');
    }
  };

  const exitReview = () => {
    // Refresh decks after review to reflect updated due dates
    getDecks().then(setDecks);
    setReviewDeck(null);
    setReviewDone(false);
  };

  const handleCreateDeck = () => {
    if (!newDeckName.trim()) return;
    startSave(async () => {
      const deck = await createDeck({ name: newDeckName.trim(), tag: newDeckTag.trim() || 'General' });
      setDecks((prev) => [...prev, deck]);
      setNewDeckName('');
      setNewDeckTag('');
      setShowNewDeck(false);
    });
  };

  const handleCreateCard = () => {
    if (!cardFront.trim() || !cardBack.trim() || !addCardDeckId) return;
    startSave(async () => {
      const card = await createCard(addCardDeckId, { front: cardFront.trim(), back: cardBack.trim() });
      setDecks((prev) => prev.map((d) => d.id === addCardDeckId ? { ...d, cards: [...d.cards, card] } : d));
      setCardFront('');
      setCardBack('');
      setAddCardDeckId(null);
    });
  };

  const handleDeleteDeck = (id: string) => {
    startSave(async () => {
      await deleteDeck(id);
      setDecks((prev) => prev.filter((d) => d.id !== id));
    });
  };

  // — Review mode —
  if (reviewDeck && !reviewDone) {
    const card = reviewQueue[queueIdx];
    return (
      <div className="screen">
        <ScreenHeader
          title={reviewDeck.name}
          subtitle={`${queueIdx + 1} / ${reviewQueue.length} · ${reviewQueue.length - queueIdx - 1} remaining`}
          actions={<button className="btn btn-ghost" onClick={exitReview}><ChevronLeft size={13} /> Exit</button>}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 16 }}>
          <div style={{ width: '100%', height: 4, background: 'var(--border-soft)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${(queueIdx / reviewQueue.length) * 100}%`, background: deckColor(reviewDeck), borderRadius: 2, transition: 'width 300ms' }} />
          </div>

          <div
            style={{
              width: '100%', minHeight: 240,
              background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 12,
              padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 16, cursor: phase === 'front' ? 'pointer' : 'default', textAlign: 'center',
            }}
            onClick={() => { if (phase === 'front') setPhase('back'); }}
          >
            {phase === 'front' ? (
              <>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: 2, textTransform: 'uppercase' }}>Question</span>
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, maxWidth: 560 }}>{card.front}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Tap to reveal answer</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: 2, textTransform: 'uppercase' }}>Answer</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{card.front}</span>
                <div style={{ width: '100%', height: 1, background: 'var(--border-soft)' }} />
                <span style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: 560 }}>{card.back}</span>
              </>
            )}
          </div>

          {phase === 'back' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-sm" style={{ background: 'color-mix(in oklch, var(--danger) 15%, transparent)', color: 'var(--danger)', border: '1px solid var(--danger)', gap: 6, minWidth: 90 }} onClick={() => grade(0)}>
                <X size={13} /> Again
              </button>
              <button className="btn btn-sm" style={{ background: 'color-mix(in oklch, var(--warn) 15%, transparent)', color: 'var(--warn)', border: '1px solid var(--warn)', gap: 6, minWidth: 90 }} onClick={() => grade(1)}>
                <RotateCcw size={13} /> Good
              </button>
              <button className="btn btn-sm" style={{ background: 'color-mix(in oklch, var(--success) 15%, transparent)', color: 'var(--success)', border: '1px solid var(--success)', gap: 6, minWidth: 90 }} onClick={() => grade(2)}>
                <Check size={13} /> Easy
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (reviewDeck && reviewDone) {
    return (
      <div className="screen">
        <ScreenHeader title={reviewDeck.name} subtitle="Session complete" actions={<button className="btn btn-ghost" onClick={exitReview}><ChevronLeft size={13} /> Back</button>} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16, background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 12 }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Session done!</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Reviewed {reviewed} card{reviewed !== 1 ? 's' : ''}</div>
          <button className="btn btn-primary" onClick={exitReview}>Back to decks</button>
        </div>
      </div>
    );
  }

  // — Deck list view —
  return (
    <div className="screen">
      <ScreenHeader
        title="Learning"
        subtitle={loading ? 'Loading…' : `${totalDue} card${totalDue !== 1 ? 's' : ''} due · ${totalCards} total across ${decks.length} deck${decks.length !== 1 ? 's' : ''}`}
        actions={<button className="btn btn-primary" onClick={() => setShowNewDeck(true)}><Plus size={13} /> New deck</button>}
      />

      {/* New deck modal */}
      {showNewDeck && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNewDeck(false)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>New deck</div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Deck name</label>
              <input autoFocus value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="e.g. System Design"
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Tag (optional)</label>
              <input value={newDeckTag} onChange={(e) => setNewDeckTag(e.target.value)} placeholder="e.g. Interview, Skills"
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewDeck(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreateDeck} disabled={saving || !newDeckName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Add card modal */}
      {addCardDeckId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAddCardDeckId(null)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 400, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Add card</div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Front (question)</label>
              <textarea autoFocus value={cardFront} onChange={(e) => setCardFront(e.target.value)} rows={3} placeholder="What is…?"
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Back (answer)</label>
              <textarea value={cardBack} onChange={(e) => setCardBack(e.target.value)} rows={4} placeholder="The answer is…"
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddCardDeckId(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreateCard} disabled={saving || !cardFront.trim() || !cardBack.trim()}>
                <Save size={11} /> Add card
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : decks.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16, background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 12 }}>
          <div style={{ fontSize: 36 }}>🃏</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>No decks yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Create a deck and add flashcards to start reviewing.</div>
          <button className="btn btn-primary" onClick={() => setShowNewDeck(true)}><Plus size={13} /> Create first deck</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {decks.map((deck) => {
            const due = dueCards(deck);
            return (
              <div key={deck.id} style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{deck.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{deck.cards.length} card{deck.cards.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Pill tone="neutral">{deck.tag}</Pill>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2, display: 'flex' }}
                      onClick={() => handleDeleteDeck(deck.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {deck.cards.length > 0 && (
                  <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${((deck.cards.length - due.length) / deck.cards.length) * 100}%`, background: deckColor(deck), borderRadius: 2, transition: 'width 300ms' }} />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, color: due.length > 0 ? 'var(--warn)' : 'var(--success)' }}>
                    {deck.cards.length === 0 ? 'No cards yet' : due.length > 0 ? `${due.length} due` : 'All caught up ✓'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11 }}
                      onClick={() => setAddCardDeckId(deck.id)}
                    >
                      <Plus size={11} /> Card
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={due.length === 0}
                      onClick={() => startReview(deck)}
                    >
                      Review
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
