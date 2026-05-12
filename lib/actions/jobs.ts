'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import type { JobStage } from '@prisma/client';

const USER_EMAIL = process.env.ALLOWED_EMAIL!;

async function getUser() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('User not found');
  return user;
}

export async function getJobs() {
  const user = await getUser();
  return prisma.job.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createJob(data: {
  company: string;
  role: string;
  stage?: JobStage;
  salary?: string;
  location?: string;
  url?: string;
  notes?: string;
  match?: number;
  nextStep?: string;
  appliedAt?: Date;
}) {
  const user = await getUser();
  const job = await prisma.job.create({ data: { ...data, userId: user.id } });
  revalidatePath('/');
  return job;
}

export async function updateJobStage(id: string, stage: JobStage) {
  const job = await prisma.job.update({ where: { id }, data: { stage } });
  revalidatePath('/');
  return job;
}

export async function updateJob(id: string, data: Partial<{
  company: string;
  role: string;
  stage: JobStage;
  salary: string;
  location: string;
  url: string;
  notes: string;
  match: number;
  nextStep: string;
  appliedAt: Date;
}>) {
  const job = await prisma.job.update({ where: { id }, data });
  revalidatePath('/');
  return job;
}

export async function deleteJob(id: string) {
  await prisma.job.delete({ where: { id } });
  revalidatePath('/');
}
