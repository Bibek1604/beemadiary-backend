const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAdmin() {
  try {
    const admin = await prisma.admin.create({
      data: {
        username: 'admin',
        email: 'admin@beemadiary.com',
        phone: '+919876543210',
        password_hash: '$2b$10$1CXv0M4EnuikSO2i6xo81.XXnRiyofJnaQn4flQYMhn208Xs5C69',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    console.log('✅ Admin created successfully!');
    console.log('Email: admin@beemadiary.com');
    console.log('Password: Admin@123');
    process.exit(0);
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('⚠️ Admin already exists with that email');
    } else {
      console.log('❌ Error:', error.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
