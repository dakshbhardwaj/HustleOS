'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';

const USER_EMAIL = process.env.ALLOWED_EMAIL!;

async function getUser() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('User not found');
  return user;
}

export async function getOpportunities() {
  const user = await getUser();
  return prisma.opportunity.findMany({
    where: { userId: user.id },
    orderBy: { score: 'desc' },
  });
}

export async function createOpportunity(data: {
  source: string;
  title: string;
  desc?: string;
  tags?: string[];
  reward?: string;
  entries?: number;
  score?: number;
  state?: string;
  dueAt?: Date;
  url?: string;
}) {
  const user = await getUser();
  const opp = await prisma.opportunity.create({ data: { ...data, userId: user.id } });
  revalidatePath('/');
  return opp;
}

export async function updateOpportunityState(id: string, state: string) {
  const opp = await prisma.opportunity.update({ where: { id }, data: { state } });
  revalidatePath('/');
  return opp;
}

export async function updateOpportunity(id: string, data: {
  title?: string;
  desc?: string;
  reward?: string;
  score?: number;
  tags?: string[];
  url?: string;
  dueAt?: Date | null;
}) {
  const opp = await prisma.opportunity.update({ where: { id }, data });
  revalidatePath('/');
  return opp;
}

export async function deleteOpportunity(id: string) {
  await prisma.opportunity.delete({ where: { id } });
  revalidatePath('/');
}
