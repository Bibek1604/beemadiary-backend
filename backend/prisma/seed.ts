import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestAgent() {
  try {
    // Check if agent already exists
    const existing = await prisma.agent.findUnique({
      where: { email: 'agent@test.com' },
    });

    if (existing) {
      console.log('✓ Agent already exists');
      console.log('Email: agent@test.com');
      console.log('Password: agent@123456');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('agent@123456', 10);

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        full_name: 'Test Agent',
        email: 'agent@test.com',
        phone_number: '9876543210',
        password_hash: hashedPassword,
        status: 'ACTIVE',
      },
    });

    console.log('✓ Agent created successfully');
    console.log('Email:', agent.email);
    console.log('Password: agent@123456');
    console.log('ID:', agent.id);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestAgent();
