'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

const USER_EMAIL = process.env.ALLOWED_EMAIL!;

async function getUser() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('User not found');
  return user;
}

export async function getNotes() {
  const user = await getUser();
  return prisma.note.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createNote(data: { title: string; content?: string; tags?: string[]; links?: string[] }) {
  const user = await getUser();
  const note = await prisma.note.create({
    data: {
      userId: user.id,
      title: data.title,
      content: data.content ?? '',
      tags: data.tags ?? [],
      links: data.links ?? [],
    },
  });
  revalidatePath('/');
  return note;
}

export async function updateNote(id: string, data: { title?: string; content?: string; tags?: string[]; links?: string[] }) {
  const user = await getUser();
  const note = await prisma.note.update({
    where: { id, userId: user.id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.links !== undefined && { links: data.links }),
    },
  });
  revalidatePath('/');
  return note;
}

export async function deleteNote(id: string) {
  const user = await getUser();
  await prisma.note.delete({ where: { id, userId: user.id } });
  revalidatePath('/');
}

/** Notes that have taskId in their links[] array — used for "Learnings" in TaskDetailPanel */
export async function getNotesForTask(taskId: string) {
  const user = await getUser();
  return prisma.note.findMany({
    where: { userId: user.id, links: { has: taskId } },
    orderBy: { createdAt: 'desc' },
  });
}
