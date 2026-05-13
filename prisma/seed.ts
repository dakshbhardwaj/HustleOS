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

  for (const p of projectDefs) {
    await prisma.project.upsert({
      where: { id: `seed-${p.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}` },
      update: { name: p.name, color: p.color },
      create: {
        id: `seed-${p.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        name: p.name,
        color: p.color,
        userId: user.id,
      },
    });
  }
  console.log(`  ✓ ${projectDefs.length} projects`);

  console.log("  ✓ no starter tasks inserted");
  console.log("🎉 Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
