import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getTasksWithStats } from '@/lib/actions/tasks';
import { getAnthropicKey, missingKeyResponse, rateLimit } from '@/lib/api-guard';
import { getJobs } from '@/lib/actions/jobs';
import { getOpportunities } from '@/lib/actions/opportunities';
import { getNotes } from '@/lib/actions/notes';
import { getQuestions } from '@/lib/actions/questions';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userEmail = session.user.email;

  async function getUser() {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) throw new Error('User not found');
    return user;
  }

  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('chat', 30, 60_000);
  if (limited) return limited;

  const { messages, screen } = await req.json() as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    screen: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages array is required.' }, { status: 422 });
  }

  // ── Gather rich context from DB ─────────────────────────────────────────
  let context = '';
  try {
    const [taskData, jobs, opps, notes, questions] = await Promise.all([
      getTasksWithStats().catch(() => null),
      getJobs().catch(() => []),
      getOpportunities().catch(() => []),
      getNotes().catch(() => []),
      getQuestions().catch(() => []),
    ]);

    const openTasks = taskData?.tasks.filter((t) => !t.done) ?? [];
    const todayTasks = taskData?.todayTasks.filter((t) => !t.done) ?? [];
    const blockedTasks = taskData?.blocked ?? [];
    const activeJobs = jobs.filter((j) => j.stage !== 'Wishlist' && j.stage !== 'Rejected');
    const interviewJobs = jobs.filter((j) => j.stage === 'Interview' || j.stage === 'Offer');
    const activeOpps = opps.filter((o) => o.state === 'New' || o.state === 'Interested');
    const unseenQs = questions.filter((q) => q.state === 'unseen').length;

    const lines: string[] = [];

    if (todayTasks.length > 0) {
      lines.push(`TODAY'S TASKS (${todayTasks.length}):`);
      todayTasks.forEach((t) => lines.push(`  - [${t.priority}] ${t.title}${t.project ? ` (${t.project.name})` : ''}${t.dueAt ? ` · due ${t.dueAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`));
    }

    if (blockedTasks.length > 0) {
      lines.push(`BLOCKED TASKS (${blockedTasks.length}):`);
      blockedTasks.forEach((t) => lines.push(`  - ${t.title}`));
    }

    if (openTasks.length > 0) {
      lines.push(`ALL OPEN TASKS: ${openTasks.length} total (${openTasks.filter((t) => t.priority === 'P0').length} P0, ${openTasks.filter((t) => t.priority === 'P1').length} P1)`);
    }

    if (activeJobs.length > 0) {
      lines.push(`JOB PIPELINE (${activeJobs.length} active):`);
      activeJobs.forEach((j) => lines.push(`  - ${j.company} / ${j.role} · Stage: ${j.stage}${j.nextStep ? ` · Next: ${j.nextStep}` : ''}`));
    }

    if (interviewJobs.length > 0) {
      lines.push(`ACTIVE INTERVIEWS/OFFERS: ${interviewJobs.map((j) => `${j.company} (${j.stage})`).join(', ')}`);
    }

    if (activeOpps.length > 0) {
      lines.push(`TRACKED OPPORTUNITIES (${activeOpps.length}):`);
      activeOpps.slice(0, 5).forEach((o) => lines.push(`  - [score ${o.score}] ${o.title} via ${o.source}${o.reward ? ` · ${o.reward}` : ''}`));
    }

    if (notes.length > 0) {
      lines.push(`KNOWLEDGE VAULT: ${notes.length} notes. Recent: ${notes.slice(0, 3).map((n) => n.title).join(', ')}`);
    }

    if (unseenQs > 0) {
      lines.push(`INTERVIEW PREP: ${unseenQs} unseen questions in queue.`);
    }

    context = lines.join('\n');
  } catch { /* proceed without context */ }

  const SCREEN_CONTEXT: Record<string, string> = {
    dashboard:     'User is on Dashboard. Give high-leverage daily guidance.',
    tasks:         'User is managing tasks. Can create, prioritize, or break down tasks.',
    opportunities: 'User is browsing bounties/freelance opportunities.',
    jobs:          'User is tracking job applications in kanban pipeline.',
    resume:        'User is working on resume optimization.',
    interview:     'User is in interview prep mode.',
    focus:         'User is in a Pomodoro focus session.',
    github:        'User is viewing GitHub contribution activity.',
    learning:      'User is managing spaced-repetition flashcard decks.',
    vault:         'User is browsing their personal knowledge vault (markdown notes with [[wiki-links]]). They can search notes by asking you. Notes support [[note title]] wiki-link syntax.',
    brief:         'User is viewing daily brief / morning overview.',
    email:         'User is on inbox intelligence screen.',
    analytics:     'User is viewing career analytics and productivity charts.',
  };

  const anthropic = createAnthropic({
    baseURL: 'https://api.anthropic.com/v1',
    apiKey: key,
  });

  // ── Tool definitions (AI SDK v6: inputSchema, not parameters) ─────────────
  const tools = {
    createTask: tool({
      description: 'Create a new task in the system. Use when the user says "create", "add", "remind me to", "schedule", or implies a to-do.',
      inputSchema: z.object({
        title: z.string().describe('Clear, actionable task title'),
        priority: z.enum(['P0', 'P1', 'P2']).describe('P0=urgent/critical, P1=important, P2=nice-to-have'),
        dueInDays: z.number().optional().describe('Days from today until due. 0=today, 1=tomorrow, etc.'),
        projectName: z.string().optional().describe('Optional project or context name'),
      }),
      execute: async ({ title, priority, dueInDays, projectName }) => {
        try {
          const user = await getUser();
          let projectId: string | undefined;

          if (projectName) {
            const existing = await prisma.project.findFirst({ where: { userId: user.id, name: { contains: projectName, mode: 'insensitive' } } });
            if (existing) projectId = existing.id;
            else {
              const created = await prisma.project.create({ data: { userId: user.id, name: projectName, color: '#888' } });
              projectId = created.id;
            }
          }

          let dueAt: Date | undefined;
          if (dueInDays !== undefined) {
            dueAt = new Date();
            dueAt.setDate(dueAt.getDate() + dueInDays);
            dueAt.setHours(23, 59, 0, 0);
          }

          await prisma.task.create({
            data: { title, priority, userId: user.id, ...(projectId && { projectId }), ...(dueAt && { dueAt }), aiSuggested: true },
          });

          return { success: true, title, priority, dueInDays };
        } catch {
          return { success: false, error: 'Failed to create task' };
        }
      },
    }),

    navigateTo: tool({
      description: 'Navigate the user to a specific screen. Use when they say "go to", "open", "show me", "take me to", or ask to switch screens.',
      inputSchema: z.object({
        screen: z.enum(['dashboard', 'brief', 'tasks', 'focus', 'opportunities', 'jobs', 'resume', 'interview', 'email', 'learning', 'github', 'vault', 'analytics']),
        reason: z.string().describe('Why navigating there (shown to user)'),
      }),
      execute: async ({ screen, reason }) => {
        return { navigateTo: screen, reason };
      },
    }),

    getFullContext: tool({
      description: 'Get a detailed snapshot of all current data — tasks, jobs, opportunities, notes. Use when the user asks for a summary, wants to know what is pending, or asks about their overall situation.',
      inputSchema: z.object({
        focus: z.enum(['all', 'tasks', 'jobs', 'opportunities', 'notes']).default('all'),
      }),
      execute: async ({ focus }) => {
        const [taskData, jobs, opps, notes] = await Promise.all([
          (focus === 'all' || focus === 'tasks') ? getTasksWithStats().catch(() => null) : Promise.resolve(null),
          (focus === 'all' || focus === 'jobs') ? getJobs().catch(() => []) : Promise.resolve([]),
          (focus === 'all' || focus === 'opportunities') ? getOpportunities().catch(() => []) : Promise.resolve([]),
          (focus === 'all' || focus === 'notes') ? getNotes().catch(() => []) : Promise.resolve([]),
        ]);

        return {
          tasks: {
            total: taskData?.tasks.length ?? 0,
            open: taskData?.tasks.filter((t) => !t.done).length ?? 0,
            today: taskData?.todayTasks.map((t) => ({ title: t.title, priority: t.priority, done: t.done })) ?? [],
            blocked: taskData?.blocked.map((t) => t.title) ?? [],
          },
          jobs: jobs.map((j) => ({ company: j.company, role: j.role, stage: j.stage, nextStep: j.nextStep })),
          opportunities: opps.filter((o) => o.state !== 'Passed').map((o) => ({ title: o.title, score: o.score, state: o.state, reward: o.reward })),
          notes: notes.slice(0, 5).map((n) => ({ title: n.title, tags: n.tags })),
        };
      },
    }),

    updateTaskStatus: tool({
      description: 'Mark a task as done, in-progress, or blocked. Use when user says "mark as done", "complete", "I finished", "block", or "I\'m stuck on".',
      inputSchema: z.object({
        taskTitle: z.string().describe('Partial or full task title to match'),
        status: z.enum(['done', 'inprogress', 'blocked']),
      }),
      execute: async ({ taskTitle, status }) => {
        try {
          const user = await getUser();
          const tasks = await prisma.task.findMany({ where: { userId: user.id, done: false } });
          const match = tasks.find((t) => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
          if (!match) return { success: false, error: `No task matching "${taskTitle}" found` };

          await prisma.task.update({
            where: { id: match.id },
            data: {
              ...(status === 'done' && { done: true, status: 'Completed' }),
              ...(status === 'inprogress' && { status: 'InProgress' }),
              ...(status === 'blocked' && { status: 'Blocked' }),
            },
          });

          return { success: true, taskTitle: match.title, status };
        } catch {
          return { success: false, error: 'Failed to update task' };
        }
      },
    }),

    suggestFocus: tool({
      description: 'Analyze current tasks and suggest the single most important thing to work on right now. Use when user asks "what should I do?", "what should I focus on?", "help me prioritize".',
      inputSchema: z.object({}),
      execute: async () => {
        const taskData = await getTasksWithStats().catch(() => null);
        const jobs = await getJobs().catch(() => []);

        const p0 = taskData?.tasks.filter((t) => !t.done && t.priority === 'P0') ?? [];
        const blocked = taskData?.blocked ?? [];
        const interviews = jobs.filter((j) => j.stage === 'Interview');
        const offers = jobs.filter((j) => j.stage === 'Offer');

        return {
          p0Tasks: p0.map((t) => t.title),
          blockedTasks: blocked.map((t) => t.title),
          activeInterviews: interviews.map((j) => j.company),
          pendingOffers: offers.map((j) => j.company),
        };
      },
    }),

    createInterviewPrepTask: tool({
      description: 'Create a structured interview preparation task for a specific company. Use when user says "prepare me for [company] interview", "help me prep for [role]".',
      inputSchema: z.object({
        company: z.string(),
        role: z.string().optional(),
        daysUntilInterview: z.number().default(1),
      }),
      execute: async ({ company, role, daysUntilInterview }) => {
        const user = await getUser();
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + daysUntilInterview);

        const tasks = [
          `Research ${company} — product, culture, recent news`,
          `Review system design questions for ${company} ${role ?? 'role'}`,
          `Prepare 3 behavioral stories (STAR format) for ${company}`,
          `Review ${company} engineering blog and tech stack`,
          `Prepare questions to ask ${company} interviewers`,
        ];

        const created: string[] = [];
        for (const title of tasks) {
          await prisma.task.create({
            data: { title, priority: 'P0', userId: user.id, dueAt, aiSuggested: true },
          });
          created.push(title);
        }

        return { success: true, company, tasksCreated: created };
      },
    }),

    searchNotes: tool({
      description: 'Search the knowledge vault for notes matching a query. Use when user asks "find notes about X", "search my vault for", "what do I have on", "do I have anything about", or asks a question that might be answered in their notes.',
      inputSchema: z.object({
        query: z.string().describe('Search term — matches note titles and content'),
        tag: z.string().optional().describe('Optional: filter by this tag'),
      }),
      execute: async ({ query, tag }) => {
        const notes = await getNotes().catch(() => []);
        const q = query.toLowerCase();
        const results = notes.filter((n) => {
          const matchQ = !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
          const matchTag = !tag || n.tags.includes(tag);
          return matchQ && matchTag;
        });

        // Extract a relevant excerpt centered on the query hit
        const withExcerpt = results.slice(0, 6).map((n) => {
          let excerpt = n.content.slice(0, 300);
          const idx = n.content.toLowerCase().indexOf(q);
          if (idx > 0) {
            const start = Math.max(0, idx - 80);
            excerpt = (start > 0 ? '…' : '') + n.content.slice(start, idx + 200).trim();
          }
          return {
            id: n.id,
            title: n.title,
            tags: n.tags,
            excerpt: excerpt.slice(0, 300),
            updatedAt: n.updatedAt,
          };
        });

        return { query, total: results.length, notes: withExcerpt };
      },
    }),

    // ── NEW: Add Job ────────────────────────────────────────────────────────
    addJob: tool({
      description: 'Add a job application to the pipeline. Use when user says "I applied to X", "add [company] to my pipeline", "I just applied", "track my application at [company]".',
      inputSchema: z.object({
        company:   z.string().describe('Company name'),
        role:      z.string().describe('Role / job title'),
        stage:     z.enum(['Wishlist', 'Applied', 'OA', 'Interview', 'Offer']).default('Applied'),
        url:       z.string().optional().describe('Job posting URL'),
        notes:     z.string().optional().describe('Any notes about the role'),
        nextStep:  z.string().optional().describe('What to do next, e.g. "Await OA email"'),
      }),
      execute: async ({ company, role, stage, url, notes, nextStep }) => {
        try {
          const user = await getUser();
          await prisma.job.create({
            data: {
              userId: user.id,
              company,
              role,
              stage,
              url:      url ?? null,
              notes:    notes ?? null,
              nextStep: nextStep ?? null,
              match:    0,
              ...(stage === 'Applied' && { appliedAt: new Date() }),
            },
          });
          return { success: true, company, role, stage };
        } catch {
          return { success: false, error: 'Failed to add job' };
        }
      },
    }),

    // ── NEW: Create Flashcard ───────────────────────────────────────────────
    createFlashcard: tool({
      description: 'Create a spaced-repetition flashcard. Use when user says "add a flashcard", "create a card for X", "I want to remember X", "flashcard: Q → A".',
      inputSchema: z.object({
        front:    z.string().describe('Question or term on the front of the card'),
        back:     z.string().describe('Answer or definition on the back'),
        deckName: z.string().optional().describe('Deck to add to. Creates one if not found. Default: first deck or "General".'),
      }),
      execute: async ({ front, back, deckName }) => {
        try {
          const user = await getUser();

          // Find or create target deck
          let deck = deckName
            ? await prisma.deck.findFirst({ where: { userId: user.id, name: { contains: deckName, mode: 'insensitive' } } })
            : await prisma.deck.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });

          if (!deck) {
            deck = await prisma.deck.create({
              data: { userId: user.id, name: deckName ?? 'General', tag: 'General', color: '#6366f1' },
            });
          }

          await prisma.card.create({
            data: { deckId: deck.id, front, back, interval: 1, ease: 2.5, reps: 0, dueAt: new Date() },
          });

          return { success: true, front, back, deckName: deck.name };
        } catch {
          return { success: false, error: 'Failed to create flashcard' };
        }
      },
    }),

    // ── NEW: Plan Day ───────────────────────────────────────────────────────
    planDay: tool({
      description: 'Generate a structured daily plan with time blocks based on tasks, interviews, and priorities. Use when user asks "plan my day", "help me structure today", "what should I work on today and when?".',
      inputSchema: z.object({
        startHour:    z.number().default(9).describe('Start hour (24h), e.g. 9 for 9 AM'),
        endHour:      z.number().default(18).describe('End hour (24h), e.g. 18 for 6 PM'),
        includeBreaks: z.boolean().default(true),
      }),
      execute: async ({ startHour, endHour, includeBreaks }) => {
        const [taskData, jobs] = await Promise.all([
          getTasksWithStats().catch(() => null),
          getJobs().catch(() => []),
        ]);

        const p0Tasks      = (taskData?.tasks ?? []).filter((t) => !t.done && t.priority === 'P0');
        const p1Tasks      = (taskData?.tasks ?? []).filter((t) => !t.done && t.priority === 'P1');
        const blockedTasks = taskData?.blocked ?? [];
        const interviews   = jobs.filter((j) => j.stage === 'Interview');
        const offers       = jobs.filter((j) => j.stage === 'Offer');
        const todayTasks   = taskData?.todayTasks.filter((t) => !t.done) ?? [];

        return {
          availableHours: endHour - startHour,
          startHour,
          endHour,
          includeBreaks,
          p0Tasks:      p0Tasks.slice(0, 5).map((t) => ({ title: t.title, project: (t as { project?: { name: string } | null }).project?.name })),
          p1Tasks:      p1Tasks.slice(0, 5).map((t) => t.title),
          todayDue:     todayTasks.slice(0, 5).map((t) => t.title),
          blockedTasks: blockedTasks.slice(0, 3).map((t) => t.title),
          activeInterviews: interviews.map((j) => `${j.company} (${j.role})`),
          pendingOffers:    offers.map((j) => j.company),
        };
      },
    }),
  };

  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    system: `You are HustleOS — an AI Chief of Staff and Executive Assistant for Daksh, a senior software engineer actively job hunting and building side projects.

Your persona: Direct, sharp, tactical. Think Jarvis from Iron Man — you know everything about Daksh's current situation and you act, not just talk.

Current screen: ${SCREEN_CONTEXT[screen] ?? 'Unknown screen.'}

REAL-TIME DATA (from database, right now):
${context || 'No data available — DB might be loading.'}

CAPABILITIES — you can TAKE ACTIONS, not just answer:
- createTask: Create tasks (use freely whenever user mentions something to do)
- navigateTo: Navigate to any screen instantly
- updateTaskStatus: Mark tasks done / blocked / in-progress
- getFullContext: Pull a deeper data snapshot
- suggestFocus: Analyze and recommend the highest-leverage action
- createInterviewPrepTask: Generate a structured interview prep plan with 5 tasks
- searchNotes: Search the knowledge vault for notes
- addJob: Add a job application to the pipeline (ALWAYS use when user says "I applied to X")
- createFlashcard: Create a spaced-repetition flashcard in a deck
- planDay: Generate a structured daily time-block plan

BEHAVIOR RULES:
1. createTask → use IMMEDIATELY whenever user mentions something to do. Don't narrate, just do it.
2. navigateTo → use when user says "go to", "show me", "open", "take me to"
3. updateTaskStatus → use when user says "done", "finished", "blocked", "stuck on"
4. addJob → use IMMEDIATELY when user says "I applied to X", "just applied", "add [company]". Never skip this.
5. createInterviewPrepTask → use when user says "prepare me for [company]"
6. planDay → use when user asks to plan or structure their day; then narrate the time blocks clearly
7. createFlashcard → use when user mentions memorizing or creating a card
8. searchNotes → use when user asks about their notes or wants to find something they wrote
9. Always use REAL data from the context above. Never fabricate numbers or names.
10. Be brutally concise. Lead with the action or the answer. No preamble.
11. After a tool call: confirm in 1 sentence what you did, then offer a logical next step.
12. For morning briefings: lead with the single most critical item, then give 3 sharp bullets.`,
    messages,
    tools,
    stopWhen: stepCountIs(4), // Allow multi-step tool chains
  });

  return result.toTextStreamResponse();
}
