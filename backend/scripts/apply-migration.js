#!/usr/bin/env node

/**
 * Apply Prisma migrations for Event and PersonalNote models
 * Usage: node scripts/apply-migration.js
 */

const { exec } = require('child_process');
const path = require('path');

console.log('📝 Applying Prisma migrations...\n');

const commands = [
  'npx prisma generate',
  'npx prisma migrate deploy',
  'npx prisma db push'
];

function runCommand(cmd, index) {
  return new Promise((resolve, reject) => {
    console.log(`[${index + 1}/${commands.length}] Running: ${cmd}`);

    const process = exec(cmd, {
      cwd: path.join(__dirname, '..'),
      timeout: 60000
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        console.error(stderr);
        reject(error);
      } else {
        console.log(stdout);
        resolve();
      }
    });

    process.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Process exited with code ${code}`);
      }
    });
  });
}

async function applyMigrations() {
  try {
    for (let i = 0; i < commands.length; i++) {
      await runCommand(commands[i], i);
    }
    console.log('\n✅ Migrations applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigrations();
