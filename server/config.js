require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'aurora_protocol_classified_sec_token_2026',
  
  // TiDB Cloud / MySQL config
  DB_CONFIG: {
    host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '4000', 10),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'aurora_protocol',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // TiDB Cloud requires SSL/TLS. Set rejectUnauthorized to false to allow cloud certs
    ssl: process.env.DB_NO_SSL === 'true' ? undefined : {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false
    }
  },

  HEAD_ADMIN: {
    username: 'MASHOOD',
    password: 'THEAURORAPROTOCOL',
    role: 'HEAD_ADMIN'
  },

  DEFAULT_ROOMS: [
    { code: 'POLICE', name: 'Police Investigation Room' },
    { code: 'LAB', name: 'Scientist Lab' }
  ]
};
