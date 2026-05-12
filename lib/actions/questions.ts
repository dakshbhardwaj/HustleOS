'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

const USER_EMAIL = process.env.ALLOWED_EMAIL!;

async function getUser() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('User not found');
  return user;
}

export async function getQuestions() {
  const user = await getUser();
  return prisma.question.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createQuestion(data: {
  text: string;
  category?: string;
  difficulty?: string;
  company?: string;
  hint?: string;
}) {
  const user = await getUser();
  const q = await prisma.question.create({
    data: {
      userId: user.id,
      text: data.text,
      category: data.category ?? 'System Design',
      difficulty: data.difficulty ?? 'Medium',
      company: data.company ?? undefined,
      hint: data.hint ?? undefined,
    },
  });
  revalidatePath('/');
  return q;
}

export async function updateQuestionState(id: string, state: string) {
  const user = await getUser();
  const q = await prisma.question.update({
    where: { id, userId: user.id },
    data: { state },
  });
  revalidatePath('/');
  return q;
}

export async function deleteQuestion(id: string) {
  const user = await getUser();
  await prisma.question.delete({ where: { id, userId: user.id } });
  revalidatePath('/');
}
