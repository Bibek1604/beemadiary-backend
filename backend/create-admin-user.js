const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * Hash password using BCRYPT (same as auth service uses)
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function createAdmin() {
  try {
    const email = 'admin@beemadiary.com';
    const password = 'Admin@123456';  // STRONG PASSWORD

    // Check if admin already exists
    const existing = await prisma.admin.findUnique({
      where: { email }
    });

    if (existing) {
      console.log('✅ Admin already exists');
      console.log('Email:', email);
      console.log('Password: Admin@123456 (if not changed)');
      return;
    }

    // Hash password using BCRYPT (correct algorithm)
    const passwordHash = await hashPassword(password);

    // Create admin
    const admin = await prisma.admin.create({
      data: {
        username: 'admin',
        email: email,
        phone: '+1234567890',
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      }
    });

    console.log('\n✅ Admin created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    ' + email);
    console.log('🔑 Password: ' + password);
    console.log('👤 Role:     SUPER_ADMIN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
