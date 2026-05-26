const { prisma } = require('./src/config/db');
const bcrypt = require('bcryptjs');

/**
 * Hash password using BCRYPT (same as auth service uses)
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function createAgent() {
  try {
    const email = 'agent@test.com';
    const password = 'Agent@123456';  // STRONG PASSWORD

    // Check if agent already exists
    const existing = await prisma.agent.findUnique({
      where: { email }
    });

    if (existing) {
      console.log('✅ Agent already exists');
      console.log('Email:', email);
      console.log('Password: Agent@123456 (if not changed)');
      return;
    }

    // Hash password using BCRYPT (correct algorithm)
    const passwordHash = await hashPassword(password);

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        full_name: 'Test Agent',
        email: email,
        phone_number: '9876543210',
        password_hash: passwordHash,
        status: 'ACTIVE',
      }
    });

    console.log('\n✅ Agent created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    ' + email);
    console.log('🔑 Password: ' + password);
    console.log('👤 Name:     Test Agent');
    console.log('🆔 ID:       ' + agent.id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (prisma.$disconnect) {
      await prisma.$disconnect();
    }
  }
}

createAgent();
