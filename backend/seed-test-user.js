const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creating test user...');

  try {
    // Check if user already exists
    const existingUser = await prisma.agent.findUnique({
      where: { email: 'agent@test.com' }
    });

    if (existingUser) {
      console.log('✅ Test user already exists:', existingUser.email);
      return;
    }

    // Hash password
    const password = 'password123';
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create test user
    const testUser = await prisma.agent.create({
      data: {
        email: 'agent@test.com',
        full_name: 'Test Agent',
        phone_number: '+919876543210',
        password_hash: password_hash,
        agent_code: 'TEST001',
        status: 'ACTIVE',
      }
    });

    console.log('✅ Test user created successfully!');
    console.log('\n📝 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email: ${testUser.email}`);
    console.log(`Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
