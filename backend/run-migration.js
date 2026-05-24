const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:adminbibek@localhost:5432/TestManagement?schema=public';

async function runMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'src/prisma/migrations/20260524000000_add_notes_table/migration.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Executing migration...');
    await client.query(sql);
    console.log('✓ Migration completed successfully');

    // Record the migration in _prisma_migrations table
    const migrationName = '20260524000000_add_notes_table';
    const checksum = require('crypto').createHash('sha256').update(sql).digest('hex');

    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, execution_time)
       VALUES ($1, $2, NOW(), $3, $4, NULL, NOW(), 0)
       ON CONFLICT DO NOTHING`,
      [migrationName, checksum, migrationName, null]
    );

    console.log('✓ Migration recorded in _prisma_migrations');
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
