const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Hash password using BCRYPT (same as auth service uses)
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function createAdmin() {
  try {
    // Read admin credentials from environment only. Do not ship defaults.
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required in the environment');
    }

    // Build MongoDB connection URI using same env vars as the app
    const dbName = process.env.MONGODB_DATABASE || process.env.DB_NAME;
    const host = process.env.MONGODB_HOST;
    const port = process.env.MONGODB_PORT;
    const username = process.env.MONGODB_USERNAME || process.env.DB_USER || '';
    const passwordEnv = process.env.MONGODB_PASSWORD || process.env.DB_PASSWORD || '';
    const authSource = process.env.MONGODB_AUTH_SOURCE || 'admin';

    if (!dbName || !host || !port) {
      throw new Error('MONGODB_DATABASE, MONGODB_HOST, and MONGODB_PORT are required in the environment');
    }

    const credentials = username ? `${encodeURIComponent(username)}:${encodeURIComponent(passwordEnv)}@` : '';
    const uri = process.env.MONGODB_URI || `mongodb://${credentials}${host}:${port}/${dbName}${username ? `?authSource=${authSource}` : ''}`;

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    const admins = db.collection('admin');

    // Hash password using BCRYPT (correct algorithm)
    const passwordHash = await hashPassword(password);

    const now = new Date();
    const adminDoc = {
      id: crypto.randomUUID(),
      username: 'admin',
      email: email,
      phone: '+1234567890',
      password_hash: passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    };

    // Check if admin already exists and reset it to the .env password if it does.
    const existing = await admins.findOne({ email });
    if (existing) {
      await admins.updateOne(
        { email },
        {
          $set: {
            username: adminDoc.username,
            phone: adminDoc.phone,
            password_hash: passwordHash,
            role: adminDoc.role,
            status: adminDoc.status,
            updated_at: now,
          },
        }
      );

      console.log('\n✅ Admin password reset successfully!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:    ' + email);
      console.log('👤 Role:     SUPER_ADMIN');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      await admins.insertOne(adminDoc);

      console.log('\n✅ Admin created successfully!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:    ' + email);
      console.log('👤 Role:     SUPER_ADMIN');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

  } catch (error) {
    console.error('❌ Error:', error && error.message ? error.message : error);
  }
}

createAdmin();
