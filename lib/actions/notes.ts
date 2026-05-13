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

export async function getWeeklyLearningDigest() {
  const user = await getUser();
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const notes = await prisma.note.findMany({
    where: {
      userId: user.id,
      updatedAt: { gte: since },
      OR: [
        { tags: { has: 'tech-pulse' } },
        { tags: { has: 'reading' } },
        { tags: { has: 'learning' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  const tagCounts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) {
      if (tag === 'tech-pulse' || tag === 'reading' || tag === 'learning') continue;
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([tag, count]) => ({ tag, count }));

  const focus = topTags[0]?.tag
    ? `Go deeper on ${topTags[0].tag}: read one strong article, save notes, then create one applied task.`
    : notes.length > 0
      ? 'Turn one saved reading note into an applied task.'
      : 'Save one technical story this week to start building a learning trail.';

  return {
    since: since.toISOString(),
    notes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      tags: note.tags,
      updatedAt: note.updatedAt,
    })),
    topTags,
    focus,
  };
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

export async function createTechStoryNote(story: {
  title: string;
  url: string;
  hnUrl?: string;
  angle?: string;
  tags?: string[];
}) {
  const tags = Array.from(new Set(['tech-pulse', 'reading', ...(story.tags ?? [])])).slice(0, 8);
  return createNote({
    title: `Reading: ${story.title}`.slice(0, 180),
    content: [
      story.angle ? `Why it matters: ${story.angle}` : 'Why it matters: Read this to sharpen engineering judgment.',
      '',
      `Source: ${story.url}`,
      story.hnUrl && story.hnUrl !== story.url ? `Discussion: ${story.hnUrl}` : null,
      '',
      'Notes:',
      '- ',
    ].filter(Boolean).join('\n'),
    tags,
    links: [story.url, ...(story.hnUrl && story.hnUrl !== story.url ? [story.hnUrl] : [])],
  });
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
