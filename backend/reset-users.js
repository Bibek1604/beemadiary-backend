const { prisma } = require('./src/config/db');
const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function resetUsers() {
  try {
    // Delete existing users
    console.log('🗑️  Deleting old users...');
    await prisma.agent.deleteMany({
      where: { email: 'agent@test.com' }
    });
    await prisma.admin.deleteMany({
      where: { email: 'admin@beemadiary.com' }
    });
    console.log('✅ Old users deleted\n');

    // Create new agent with BCRYPT
    console.log('🔄 Creating new agent user...');
    const agentPasswordHash = await hashPassword('Agent@123456');
    const agent = await prisma.agent.create({
      data: {
        full_name: 'Test Agent',
        email: 'agent@test.com',
        phone_number: '9876543210',
        password_hash: agentPasswordHash,
        status: 'ACTIVE',
      }
    });
    console.log('\n✅ Agent created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    agent@test.com');
    console.log('🔑 Password: Agent@123456');
    console.log('👤 Name:     Test Agent');
    console.log('🆔 ID:       ' + agent.id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Create new admin with BCRYPT
    console.log('🔄 Creating new admin user...');
    const adminPasswordHash = await hashPassword('Admin@123456');
    const admin = await prisma.admin.create({
      data: {
        username: 'admin',
        email: 'admin@beemadiary.com',
        phone: '+1234567890',
        password_hash: adminPasswordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      }
    });
    console.log('\n✅ Admin created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    admin@beemadiary.com');
    console.log('🔑 Password: Admin@123456');
    console.log('👤 Role:     SUPER_ADMIN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ All done! You can now login with:\n');
    console.log('Agent:');
    console.log('  Email:    agent@test.com');
    console.log('  Password: Agent@123456\n');
    console.log('Admin:');
    console.log('  Email:    admin@beemadiary.com');
    console.log('  Password: Admin@123456');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (prisma.$disconnect) {
      await prisma.$disconnect();
    }
  }
}

resetUsers();
