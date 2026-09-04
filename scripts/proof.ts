import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sandbox = await prisma.project.findUnique({ where: { slug: "rig-sandbox" } });
  console.log(`sandbox project          : ${sandbox ? "STILL PRESENT" : "gone"}`);
  console.log(`tasks titled RS- anywhere: ${await prisma.task.count({ where: { title: { startsWith: "RS-" } } })}`);
  console.log(`non-deleted tasks        : ${await prisma.task.count({ where: { deletedAt: null } })}`);
  console.log(`projects                 : ${await prisma.project.count()}`);
  const rigUsers = await prisma.user.count({
    where: { email: { in: ["screenshot-manager@orbit.local", "screenshot-dev@orbit.local"] } },
  });
  console.log(`rig accounts             : ${rigUsers}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
