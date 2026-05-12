export type CapturePriority = 'P0' | 'P1' | 'P2';

export interface ParsedTaskCapture {
  title: string;
  priority?: CapturePriority;
  dueAt?: Date;
}

const PRIORITY_RE = /\b(?:p([012])|priority\s*([012]))\b/i;

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function nextWeekday(target: number) {
  const d = new Date();
  const current = d.getDay();
  const delta = (target + 7 - current) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return endOfDay(d);
}

function parseDueAt(input: string): Date | undefined {
  const lower = input.toLowerCase();
  const today = new Date();

  if (/\btoday\b/.test(lower)) return endOfDay(today);
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return endOfDay(d);
  }

  const inDays = lower.match(/\bin\s+(\d+)\s+d(?:ays?)?\b/);
  if (inDays) {
    const d = new Date(today);
    d.setDate(d.getDate() + Number(inDays[1]));
    return endOfDay(d);
  }

  const weekdays: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };
  const weekday = lower.match(/\b(?:next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday|day)?|wed(?:nesday)?|thu(?:rs|rsday|day)?|fri(?:day)?|sat(?:urday)?)\b/);
  if (weekday) return nextWeekday(weekdays[weekday[1]]);

  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return endOfDay(new Date(`${iso[1]}T00:00:00`));

  return undefined;
}

function cleanTitle(input: string) {
  return input
    .replace(PRIORITY_RE, '')
    .replace(/\b(?:due\s+)?today\b/gi, '')
    .replace(/\b(?:due\s+)?tomorrow\b/gi, '')
    .replace(/\b(?:due\s+)?in\s+\d+\s+d(?:ays?)?\b/gi, '')
    .replace(/\b(?:due\s+)?(?:next\s+)?(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday|day)?|wed(?:nesday)?|thu(?:rs|rsday|day)?|fri(?:day)?|sat(?:urday)?)\b/gi, '')
    .replace(/\b(?:due\s+)?\d{4}-\d{2}-\d{2}\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

export function parseTaskCapture(input: string): ParsedTaskCapture {
  const priorityMatch = input.match(PRIORITY_RE);
  const priority = priorityMatch ? (`P${priorityMatch[1] ?? priorityMatch[2]}` as CapturePriority) : undefined;
  const dueAt = parseDueAt(input);
  const title = cleanTitle(input);
  return { title, priority, dueAt };
}

export function formatTaskDueLabel(dueAt?: Date | null) {
  if (!dueAt) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const due = new Date(dueAt);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - start.getTime()) / 86400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff > 1 && diff < 7) return `in ${diff}d`;
  return new Date(dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

