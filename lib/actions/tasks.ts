'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { parseTaskCapture } from '@/lib/task-capture';
import type { Priority, TaskStatus } from '@prisma/client';

const USER_EMAIL = process.env.ALLOWED_EMAIL!;

async function getUser() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('User not found');
  return user;
}

const TASK_INCLUDE = { project: true, subtasks: { orderBy: { createdAt: 'asc' as const } } };

export async function getTasks() {
  const user = await getUser();
  return prisma.task.findMany({
    where: { userId: user.id, parentId: null },
    include: TASK_INCLUDE,
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getTasksWithStats() {
  const user = await getUser();
  const tasks = await prisma.task.findMany({
    where: { userId: user.id, parentId: null },
    include: TASK_INCLUDE,
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayTasks  = tasks.filter((t) => t.dueAt && t.dueAt <= today && t.dueAt >= todayStart);
  const inProgress  = tasks.filter((t) => t.status === 'InProgress');
  const blocked     = tasks.filter((t) => t.status === 'Blocked');
  const aiSuggested = tasks.filter((t) => t.aiSuggested);

  return { tasks, todayTasks, inProgress, blocked, aiSuggested };
}

export async function getTaskDetail(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      project: true,
      subtasks: { orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function toggleTask(id: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;
  await prisma.task.update({
    where: { id },
    data: {
      done:   !task.done,
      status: !task.done ? 'Completed' : 'Todo',
    },
  });
  revalidatePath('/');
}

export async function createTask(data: {
  title: string;
  subtitle?: string;
  description?: string;
  priority: Priority;
  projectId?: string;
  dueAt?: Date;
  aiSuggested?: boolean;
}) {
  const user = await getUser();
  const title = data.title.trim();
  if (!title) throw new Error('Task title is required');
  const task = await prisma.task.create({
    data: { ...data, title, userId: user.id },
    include: TASK_INCLUDE,
  });
  revalidatePath('/');
  return task;
}

export async function createTaskFromCapture(input: string, options?: {
  projectId?: string;
  fallbackPriority?: Priority;
  source?: string;
}) {
  const parsed = parseTaskCapture(input);
  if (!parsed.title) throw new Error('Task title is required');
  return createTask({
    title: parsed.title,
    subtitle: options?.source,
    priority: parsed.priority ?? options?.fallbackPriority ?? 'P1',
    dueAt: parsed.dueAt,
    projectId: options?.projectId,
  });
}

export async function createTaskFromJobNextStep(jobId: string) {
  const user = await getUser();
  const job = await prisma.job.findFirst({ where: { id: jobId, userId: user.id } });
  if (!job) throw new Error('Job not found');
  const title = job.nextStep?.trim() || `Follow up on ${job.company} ${job.role}`;
  return createTask({
    title,
    subtitle: `${job.company} · ${job.role}`,
    priority: job.stage === 'Interview' || job.stage === 'Offer' ? 'P0' : 'P1',
    dueAt: undefined,
  });
}

export async function createTaskFromOpportunity(opportunityId: string) {
  const user = await getUser();
  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, userId: user.id } });
  if (!opportunity) throw new Error('Opportunity not found');
  return createTask({
    title: `Work on ${opportunity.title}`,
    subtitle: `${opportunity.source}${opportunity.reward ? ` · ${opportunity.reward}` : ''}`,
    description: opportunity.desc ?? undefined,
    priority: opportunity.score >= 85 ? 'P0' : opportunity.score >= 70 ? 'P1' : 'P2',
    dueAt: opportunity.dueAt ?? undefined,
  });
}

export async function createTaskFromTechStory(story: {
  title: string;
  url: string;
  angle?: string;
}) {
  return createTask({
    title: `Read: ${story.title}`.slice(0, 160),
    subtitle: 'Tech Pulse',
    description: [story.angle, story.url].filter(Boolean).join('\n\n'),
    priority: 'P2',
    aiSuggested: true,
  });
}

export async function createSubtask(parentId: string, data: {
  title: string;
  priority?: Priority;
  description?: string;
}) {
  const parent = await prisma.task.findUnique({ where: { id: parentId } });
  if (!parent) throw new Error('Parent task not found');
  const subtask = await prisma.task.create({
    data: {
      title: data.title,
      priority: data.priority ?? parent.priority,
      description: data.description,
      parentId,
      userId: parent.userId,
      projectId: parent.projectId,
    },
    include: { project: true, subtasks: { orderBy: { createdAt: 'asc' } } },
  });
  revalidatePath('/');
  return subtask;
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  await prisma.task.update({ where: { id }, data: { status } });
  revalidatePath('/');
}

export async function updateTask(id: string, data: Partial<{
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  dueAt: Date | null;
  projectId: string | null;
}>) {
  await prisma.task.update({ where: { id }, data });
  revalidatePath('/');
}

export async function deleteTask(id: string) {
  await prisma.task.delete({ where: { id } });
  revalidatePath('/');
}

export async function getProjects() {
  const user = await getUser();
  return prisma.project.findMany({ where: { userId: user.id }, orderBy: { name: 'asc' } });
}

export async function createProject(data: { name: string; color?: string }) {
  const user = await getUser();
  const project = await prisma.project.create({
    data: { userId: user.id, name: data.name.trim(), color: data.color ?? '#888' },
  });
  revalidatePath('/');
  return project;
}

export async function getDashboardData() {
  const user = await getUser();

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);

  const [todayTasks, totalTasks] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, parentId: null, dueAt: { gte: todayStart, lte: todayEnd } },
      include: TASK_INCLUDE,
      orderBy: { priority: 'asc' },
      take: 4,
    }),
    prisma.task.count({ where: { userId: user.id, parentId: null, done: false } }),
  ]);

  return { todayTasks, totalTasks };
}

export async function getAnalyticsData() {
  const user = await getUser();

  const allTasks = await prisma.task.findMany({
    where: { userId: user.id, parentId: null },
    include: TASK_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });

  const done  = allTasks.filter((t) => t.done);
  const open  = allTasks.filter((t) => !t.done);

  const byPriority = {
    P0: allTasks.filter((t) => t.priority === 'P0').length,
    P1: allTasks.filter((t) => t.priority === 'P1').length,
    P2: allTasks.filter((t) => t.priority === 'P2').length,
  };

  const days: { day: string; done: number; added: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    const doneThat = done.filter((t) => t.updatedAt >= d && t.updatedAt <= end).length;
    const addedThat = allTasks.filter((t) => t.createdAt >= d && t.createdAt <= end).length;
    days.push({ day: dayLabel, done: doneThat, added: addedThat });
  }

  const projectMap = new Map<string, { done: number; open: number }>();
  for (const t of allTasks) {
    const key = t.project?.name ?? 'No project';
    const cur = projectMap.get(key) ?? { done: 0, open: 0 };
    if (t.done) cur.done++; else cur.open++;
    projectMap.set(key, cur);
  }
  const byProject = Array.from(projectMap.entries())
    .map(([name, counts]) => ({ name, ...counts, total: counts.done + counts.open }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return {
    totalTasks: allTasks.length,
    doneTasks: done.length,
    openTasks: open.length,
    byPriority,
    byProject,
    dailyActivity: days,
  };
}
