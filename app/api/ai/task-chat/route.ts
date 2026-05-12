import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { getAnthropicKey, missingKeyResponse, rateLimit } from '@/lib/api-guard';

export const maxDuration = 30;

interface TaskContext {
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  project?: string | null;
  dueAt?: string | null;
  subtasks?: { title: string; done: boolean }[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('task-chat', 30, 60_000);
  if (limited) return limited;

  const { messages, task } = await req.json() as { messages: Message[]; task: TaskContext };

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey: key });

  const subtaskList = task.subtasks?.length
    ? `\nSubtasks:\n${task.subtasks.map((s) => `  - [${s.done ? 'x' : ' '}] ${s.title}`).join('\n')}`
    : '';

  const system = `You are an AI pair-programmer and productivity assistant embedded inside HustleOS, a personal OS for a senior software engineer.

The user is working on this task:
- Title: ${task.title}
- Priority: ${task.priority}
- Status: ${task.status}
- Project: ${task.project ?? 'None'}
- Due: ${task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'No deadline'}
${task.description ? `- Description: ${task.description}` : ''}${subtaskList}

Be concise and actionable. Give direct advice — no fluff. Use bullet points or numbered steps when listing things. If asked to break something down, generate specific subtasks with time estimates. If asked about approach, give an opinionated recommendation.`;

  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    system,
    messages,
  });

  return result.toTextStreamResponse();
}
