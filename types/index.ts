export type ScreenKey =
  | 'dashboard' | 'brief' | 'tasks' | 'focus'
  | 'opportunities' | 'jobs' | 'resume' | 'interview' | 'email'
  | 'learning' | 'github' | 'vault' | 'analytics';

export type AccentKey = 'amber' | 'green' | 'iris' | 'rose';
export type DensityKey = 'compact' | 'regular' | 'comfy';
export type ThemeKey = 'light' | 'dark';

export type Priority = 'P0' | 'P1' | 'P2';
export type TaskStatus = 'Todo' | 'In Progress' | 'Blocked' | 'Completed';
export type JobStage = 'Wishlist' | 'Applied' | 'OA' | 'Interview' | 'Offer';
export type EmailCategory =
  | 'Interview' | 'Opportunity' | 'Action Required'
  | 'Networking' | 'Rejection' | 'Informational';

export type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';

export interface Task {
  id: string;
  title: string;
  sub?: string;
  priority: Priority;
  project: string;
  due: string;
  status: TaskStatus;
  ai?: boolean;
  today?: boolean;
  done?: boolean;
}

export interface PipelineItem {
  id: string;
  company: string;
  role: string;
  stage: JobStage;
  tone: Tone;
  next?: string;
}

export interface Job {
  id: string;
  company: string;
  role: string;
  stage: JobStage;
  salary: string;
  location: string;
  applied: string;
  next?: string;
  match: number;
}

export interface Opportunity {
  id: string;
  source: string;
  title: string;
  desc: string;
  tags: string[];
  reward: string;
  entries: number;
  posted: string;
  score: number;
  state: string;
}

export interface Email {
  id: string;
  from: string;
  subject: string;
  snippet?: string;
  cat: EmailCategory;
  tone: Tone;
  time: string;
  action?: string;
}

export interface NavItem {
  key: ScreenKey;
  label: string;
  hint: string;
  group: 'Workspace' | 'Career' | 'Growth';
}
