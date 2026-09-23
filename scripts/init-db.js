require('dotenv').config();
const { initDatabase } = require('../server/db');

async function run() {
  console.log('[INIT-DB] Initializing database and verifying tables...');
  try {
    await initDatabase();
    console.log('[INIT-DB] SUCCESS: TiDB Cloud / MySQL tables and seed data are ready!');
    process.exit(0);
  } catch (err) {
    console.error('[INIT-DB] ERROR initializing database:', err);
    process.exit(1);
  }
}

run();
