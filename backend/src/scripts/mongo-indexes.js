/**
 * Create unique indexes on MongoDB collections.
 *
 * In PostgreSQL these were CHECK constraints + unique columns; in MongoDB the
 * uniqueness and partial-value rules are enforced by indexes.
 *
 * Run with:  node src/scripts/mongo-indexes.js
 */
require("dotenv/config");
const { MongoConnectionManager } = require("../config/db");

async function ensureIndexes() {
  console.log("Creating MongoDB indexes...");
  const manager = MongoConnectionManager.getInstance();
  const db = await manager.connect();

  const specs = [
    { col: "admin",  index: { email: 1 },        opts: { unique: true, name: "uniq_admin_email" } },
    { col: "admin",  index: { username: 1 },     opts: { unique: true, name: "uniq_admin_username" } },
    { col: "admin",  index: { phone: 1 },        opts: { unique: true, name: "uniq_admin_phone" } },

    { col: "company", index: { email: 1 },        opts: { unique: true, name: "uniq_company_email" } },
    { col: "company", index: { phone_number: 1 }, opts: { unique: true, name: "uniq_company_phone" } },

    { col: "agent", index: { email: 1 },         opts: { unique: true, name: "uniq_agent_email" } },
    { col: "agent", index: { phone_number: 1 },  opts: { unique: true, name: "uniq_agent_phone" } },
    { col: "agent", index: { agent_code: 1 },    opts: { unique: true, sparse: true, name: "uniq_agent_code" } },
    { col: "agent", index: { lic_agent_code: 1 },opts: { unique: true, sparse: true, name: "uniq_agent_lic_code" } },
    { col: "agent", index: { company_id: 1 },    opts: { name: "idx_agent_company" } },

    { col: "client", index: { email: 1 },        opts: { unique: true, sparse: true, name: "uniq_client_email" } },
    { col: "client", index: { agent_id: 1 },     opts: { name: "idx_client_agent" } },

    { col: "policy", index: { policy_number: 1 },opts: { unique: true, name: "uniq_policy_number" } },
    { col: "policy", index: { client_id: 1 },    opts: { name: "idx_policy_client" } },
    { col: "policy", index: { agent_id: 1 },     opts: { name: "idx_policy_agent" } },
    { col: "policy", index: { company_id: 1 },   opts: { name: "idx_policy_company" } },

    { col: "transaction", index: { policy_id: 1 }, opts: { name: "idx_txn_policy" } },

    { col: "session",      index: { token: 1 },  opts: { unique: true, name: "uniq_session_token" } },
    { col: "refreshToken", index: { token: 1 },  opts: { unique: true, name: "uniq_refresh_token" } },

    { col: "bulkNotification", index: { created_at: -1 }, opts: { name: "idx_notification_created" } },
    { col: "notificationRead", index: { notification_id: 1, agent_id: 1 }, opts: { unique: true, name: "uniq_read_per_agent" } },

    { col: "event", index: { agent_id: 1, start: 1 }, opts: { name: "idx_event_agent_start" } },
    { col: "note",  index: { agent_id: 1 },           opts: { name: "idx_note_agent" } },
  ];

  for (const { col, index, opts } of specs) {
    try {
      const name = await db.collection(col).createIndex(index, opts);
      console.log(`  ✓ ${col}: ${name}`);
    } catch (err) {
      console.warn(`  ! ${col} (${opts.name}): ${err.message}`);
    }
  }

  console.log("Indexes ensured.");
  await manager.disconnect();
}

ensureIndexes().catch((err) => {
  console.error("Failed to create indexes:", err);
  process.exit(1);
});
