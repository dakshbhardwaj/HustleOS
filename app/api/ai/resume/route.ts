import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';

export const maxDuration = 30;

function getAnthropicKey(): string {
  try {
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
    const match = envFile.match(/^ANTHROPIC_API_KEY="?([^"\n]+)"?/m);
    if (match?.[1]) return match[1];
  } catch { /* fall through */ }
  return process.env.ANTHROPIC_API_KEY ?? '';
}

const ResultSchema = z.object({
  score: z.number().min(0).max(100).describe('Overall match score 0-100'),
  matched: z.array(z.string()).describe('Keywords/skills present in both resume and JD'),
  missing: z.array(z.string()).describe('Keywords/skills in JD but absent from resume'),
  suggestions: z.array(z.string()).describe('3-5 concrete edits to improve the match score'),
  summary: z.string().describe('2-3 sentence plain-English assessment of the match'),
});

export async function POST(req: Request) {
  try {
    const { resume, jd } = await req.json() as { resume: string; jd: string };
    if (!resume || !jd) {
      return Response.json({ error: 'Both resume and job description are required.' }, { status: 400 });
    }

    const anthropic = createAnthropic({
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: getAnthropicKey(),
    });

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-5'),
      schema: ResultSchema,
      system: `You are an expert technical recruiter and resume coach. Analyze how well a resume matches a job description.
Be precise about keywords — extract actual technical terms, tools, frameworks, and skills from both documents.
Suggestions must be specific and actionable (e.g. "Add 'Kafka' to your Skills section" not "mention more tools").`,
      prompt: `RESUME:\n${resume.slice(0, 6000)}\n\n---\n\nJOB DESCRIPTION:\n${jd.slice(0, 4000)}`,
    });

    return Response.json(object);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
