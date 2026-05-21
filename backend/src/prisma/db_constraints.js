const { prisma } = require("../config/db");

async function applyConstraints() {
  console.log("Applying database-level check constraints...");
  try {
    // Add CHECK constraints to policies table
    await prisma.$executeRawUnsafe(`
      ALTER TABLE policies 
      DROP CONSTRAINT IF EXISTS policies_coverage_amount_check,
      ADD CONSTRAINT policies_coverage_amount_check CHECK (coverage_amount >= 0);
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE policies 
      DROP CONSTRAINT IF EXISTS policies_premium_amount_check,
      ADD CONSTRAINT policies_premium_amount_check CHECK (premium_amount >= 0);
    `);

    // Add CHECK constraints to transactions table
    await prisma.$executeRawUnsafe(`
      ALTER TABLE transactions 
      DROP CONSTRAINT IF EXISTS transactions_amount_check,
      ADD CONSTRAINT transactions_amount_check CHECK (amount >= 0);
    `);

    console.log("Database-level check constraints applied successfully.");
  } catch (error) {
    console.error("Error applying database-level check constraints:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyConstraints();
