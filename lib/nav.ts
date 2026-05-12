import type { NavItem } from '@/types';

export const NAV: NavItem[] = [
  { key: 'dashboard',     label: 'Dashboard',        hint: 'D', group: 'Workspace' },
  { key: 'brief',         label: 'Daily brief',      hint: 'B', group: 'Workspace' },
  { key: 'tasks',         label: 'Tasks',            hint: 'T', group: 'Workspace' },
  { key: 'focus',         label: 'Focus',            hint: 'F', group: 'Workspace' },
  { key: 'opportunities', label: 'Opportunities',    hint: 'O', group: 'Career'    },
  { key: 'jobs',          label: 'Jobs',             hint: 'J', group: 'Career'    },
  { key: 'resume',        label: 'Resume',           hint: 'R', group: 'Career'    },
  { key: 'interview',     label: 'Interview prep',   hint: 'I', group: 'Career'    },
  { key: 'email',         label: 'Email',            hint: 'E', group: 'Career'    },
  { key: 'learning',      label: 'Learning',         hint: 'L', group: 'Growth'    },
  { key: 'github',        label: 'GitHub',           hint: 'G', group: 'Growth'    },
  { key: 'vault',         label: 'Knowledge vault',  hint: 'V', group: 'Growth'    },
  { key: 'analytics',     label: 'Analytics',        hint: 'A', group: 'Growth'    },
];

export const SCREEN_GROUPS: Array<'Workspace' | 'Career' | 'Growth'> = [
  'Workspace', 'Career', 'Growth',
];
