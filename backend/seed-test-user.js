const { prisma } = require('./src/config/db');
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('🌱 Creating test user...');

  try {
    // Check if user already exists
    const existingUser = await prisma.agent.findUnique({
      where: { email: 'agent@test.com' }
    });

    const password = 'password123';
    const password_hash = hashPassword(password);

    if (existingUser) {
      // Update password_hash to PBKDF2 format so login works with server
      await prisma.agent.update({ where: { email: 'agent@test.com' }, data: { password_hash } });
      console.log('✅ Test user already exists; password updated:', existingUser.email);
      return;
    }

    // Create test user
    const testUser = await prismaagent.create({
      data: {
        email: 'agent@test.com',
        full_name: 'Test Agent',
        phone_number: '+919876543210',
        password_hash: password_hash,
        agent_code: 'TEST001',
        status: 'ACTIVE',
        is_active: true,
      }
    });

    console.log(' Test user created successfully!');
    console.log('\n Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email: ${testUser.email}`);
    console.log(`Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error(' Error creating test user:', error.message);
  } finally {
    if (prisma.$disconnect) {
      await prisma.$disconnect();
    }
  }
}

main();
