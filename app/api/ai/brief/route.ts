import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { getTasksWithStats } from '@/lib/actions/tasks';
import { getJobs } from '@/lib/actions/jobs';
import { getOpportunities } from '@/lib/actions/opportunities';
import { getAnthropicKey, missingKeyResponse, rateLimit } from '@/lib/api-guard';

export const maxDuration = 30;

export async function POST() {
  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('brief', 5, 60_000);
  if (limited) return limited;

  try {
    const anthropic = createAnthropic({
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: key,
    });

    const contextLines: string[] = [];
    try {
      const [taskData, jobs, opps] = await Promise.all([
        getTasksWithStats().catch(() => null),
        getJobs().catch(() => []),
        getOpportunities().catch(() => []),
      ]);

      const open = taskData?.tasks.filter((t) => !t.done) ?? [];
      const today = taskData?.todayTasks.filter((t) => !t.done) ?? [];
      const blocked = taskData?.blocked ?? [];
      const p0 = open.filter((t) => t.priority === 'P0');
      const activeJobs = jobs.filter((j) => j.stage !== 'Wishlist');
      const hotOpps = opps.filter((o) => o.state === 'New' || o.state === 'Interested').sort((a, b) => b.score - a.score);

      if (today.length > 0) contextLines.push(`Today's ${today.length} tasks: ${today.map((t) => t.title).join(', ')}.`);
      if (p0.length > 0) contextLines.push(`P0 priority tasks: ${p0.map((t) => t.title).join(', ')}.`);
      if (blocked.length > 0) contextLines.push(`Blocked: ${blocked.map((t) => t.title).join(', ')}.`);
      if (activeJobs.length > 0) contextLines.push(`Active job applications: ${activeJobs.map((j) => `${j.company} (${j.stage})`).join(', ')}.`);
      if (hotOpps.length > 0) contextLines.push(`Top opportunities: ${hotOpps.slice(0, 3).map((o) => `${o.title} at ${o.source}${o.reward ? ' · ' + o.reward : ''}${o.score > 0 ? ' (fit: ' + o.score + ')' : ''}`).join('; ')}.`);
    } catch { /* DB may not be reachable */ }

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      system: `You are HustleOS, a concise AI chief-of-staff for a senior software engineer.
Generate a punchy 2-3 sentence morning brief. Be direct, not fluffy. No bullet points — flowing prose.
Focus on: what needs immediate attention, any patterns worth noting, and one motivating observation.
Only mention specifics from the context provided — never invent details.`,
      prompt: `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.
${contextLines.length > 0 ? contextLines.join('\n') : 'No data available — the DB may be empty or loading.'}`,
    });

    return Response.json({ summary: text });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
