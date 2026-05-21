const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Hash the password 'admin123'
  const adminEmail = "admin@beemadiary.com";
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {
      password_hash: passwordHash,
    },
    create: {
      username: "admin",
      email: adminEmail,
      phone: "+10000000000",
      password_hash: passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Seeded admin user:", admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
