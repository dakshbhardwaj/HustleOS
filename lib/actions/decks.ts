'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

const USER_EMAIL = process.env.ALLOWED_EMAIL!;

async function getUser() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('User not found');
  return user;
}

export async function getDecks() {
  const user = await getUser();
  return prisma.deck.findMany({
    where: { userId: user.id },
    include: { cards: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createDeck(data: { name: string; tag?: string; color?: string }) {
  const user = await getUser();
  const deck = await prisma.deck.create({
    data: {
      userId: user.id,
      name: data.name,
      tag: data.tag ?? 'General',
      color: data.color ?? '#6366f1',
    },
    include: { cards: true },
  });
  revalidatePath('/');
  return deck;
}

export async function createCard(deckId: string, data: { front: string; back: string }) {
  const user = await getUser();
  // Verify deck belongs to user
  await prisma.deck.findFirstOrThrow({ where: { id: deckId, userId: user.id } });
  const card = await prisma.card.create({
    data: { deckId, front: data.front, back: data.back },
  });
  revalidatePath('/');
  return card;
}

// SM-2 spaced repetition algorithm
// quality: 0=again, 1=good, 2=easy
export async function gradeCard(cardId: string, quality: 0 | 1 | 2) {
  const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });

  let { ease, interval, reps } = card;

  if (quality === 0) {
    // Failed — reset
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);

    // Update ease (SM-2 formula)
    ease = Math.max(1.3, ease + (0.1 - (2 - quality) * (0.08 + (2 - quality) * 0.02)));
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + interval);

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { ease, interval, reps, dueAt },
  });
  revalidatePath('/');
  return updated;
}

export async function deleteDeck(id: string) {
  const user = await getUser();
  await prisma.deck.delete({ where: { id, userId: user.id } });
  revalidatePath('/');
}
