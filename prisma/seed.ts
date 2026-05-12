import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL ?? "dakshbhardwaj2@gmail.com";

async function main() {
  console.log("🌱 Seeding HustleOS...");

  // Upsert the single user
  const user = await prisma.user.upsert({
    where: { email: ALLOWED_EMAIL },
    update: {},
    create: {
      email: ALLOWED_EMAIL,
      name: "Daksh Bhardwaj",
      preferences: {
        theme: "dark",
        accent: "amber",
        density: "regular",
        showAI: true,
      },
    },
  });

  console.log(`  ✓ User: ${user.email}`);

  // Projects — intentionally minimal; users create their own projects in-app
  const projectDefs = [
    { name: "Job Search",  color: "oklch(72% 0.16 60)"  },
    { name: "Side Project",color: "oklch(72% 0.16 280)" },
    { name: "Learning",    color: "oklch(72% 0.14 150)" },
  ];

  const projects: Record<string, string> = {};
  for (const p of projectDefs) {
    const proj = await prisma.project.upsert({
      where: { id: `seed-${p.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}` },
      update: { name: p.name, color: p.color },
      create: {
        id: `seed-${p.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        name: p.name,
        color: p.color,
        userId: user.id,
      },
    });
    projects[p.name] = proj.id;
  }
  console.log(`  ✓ ${projectDefs.length} projects`);

  // Helper to map project name to id — fuzzy match
  const pid = (name: string) => {
    const key = Object.keys(projects).find((k) => k === name || k.startsWith(name));
    return key ? projects[key] : undefined;
  };

  // Tasks — a small representative set; users build their own task list
  const taskDefs = [
    { id: "seed-t1",  title: "Prep system-design notes for next interview",  subtitle: "Rate limiting, queueing, idempotency", priority: "P0" as const, project: "Job Search",    due: new Date(Date.now() + 6 * 3600_000),   status: "InProgress" as const, aiSuggested: true  },
    { id: "seed-t2",  title: "Ship onboarding flow",                          subtitle: "Auth + nav + first-run experience",    priority: "P1" as const, project: "Side Project",  due: new Date(Date.now() + 3 * 86400_000),  status: "Blocked" as const,    aiSuggested: true },
    { id: "seed-t3",  title: "Finish DSA: top-K frequent elements",           priority: "P2" as const, project: "Learning",     due: new Date(Date.now() + 2 * 86400_000),  status: "Todo" as const,       aiSuggested: true },
    { id: "seed-t4",  title: "Update resume with recent project impact",       priority: "P1" as const, project: "Job Search",   due: new Date(Date.now() + 86400_000),      status: "Todo" as const },
  ];

  for (const t of taskDefs) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: { title: t.title, subtitle: t.subtitle, priority: t.priority, status: t.status, dueAt: t.due, aiSuggested: t.aiSuggested ?? false },
      create: {
        id: t.id,
        title: t.title,
        subtitle: t.subtitle,
        priority: t.priority,
        status: t.status,
        projectId: pid(t.project),
        userId: user.id,
        dueAt: t.due,
        aiSuggested: t.aiSuggested ?? false,
      },
    });
  }
  console.log(`  ✓ ${taskDefs.length} tasks`);
  console.log("🎉 Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
