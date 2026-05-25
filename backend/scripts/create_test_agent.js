const { prisma } = require('../src/config/db');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    const password = 'Pass1234';
    const password_hash = bcrypt.hashSync(password, 8);
    const agent = await prisma.agent.create({
      data: {
        agent_code: 'AG1',
        full_name: 'Local Agent',
        email: 'agent@example.com',
        phone_number: '9999999999',
        password_hash,
      },
    });
    console.log('Created agent id:', agent.id);
    console.log('Login with email: agent@example.com and password:', password);
  } catch (err) {
    console.error('Error creating agent:', err);
    process.exitCode = 1;
  } finally {
    if (prisma.$disconnect) {
      await prisma.$disconnect();
    }
  }
})();
