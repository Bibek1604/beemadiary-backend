const crypto = require('crypto');
const { prisma } = require('./src/config/db');

function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const email = process.env.EMAIL || 'agent@test.com';
  const password = process.env.PASSWORD || 'password123';

  const password_hash = hashPassword(password);

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { email }, data: { password_hash, is_active: true } });
      console.log('Updated existing user password for', email);
    } else {
      const user = await prisma.user.create({
        data: {
          email,
          password_hash,
          first_name: 'Seed',
          last_name: 'User',
          role: 'AGENT',
          type: 'AGENT',
          is_active: true,
        }
      });
      console.log('Created user', user.email);
    }
  } catch (err) {
    console.error('Error creating/updating user:', err.message);
  } finally {
    if (prisma.$disconnect) {
      await prisma.$disconnect();
    }
  }
}

main();
