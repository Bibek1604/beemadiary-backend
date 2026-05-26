const { prisma } = require('../src/config/db');
const crypto = require('crypto');

(async () => {
  try {
    const email = 'agent@example.com';
    const password = 'Pass1234';
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const password_hash = `${salt}:${hash}`;

    const updated = await prisma.agent.updateMany({
      where: { email },
      data: { password_hash }
    });

    console.log(`Updated ${updated.count} agent(s) with PBKDF2 password hash.`);
  } catch (err) {
    console.error('Error updating password:', err);
    process.exitCode = 1;
  } finally {
    if (prisma.$disconnect) {
      await prisma.$disconnect();
    }
  }
})();
