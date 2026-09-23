const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('./config');

let pool = null;
let useMemoryFallback = false;

// ─── In-Memory Store Fallback (Active only if TiDB Cloud is unreachable locally) ──
const memoryStore = {
  users: [],
  teams: [],
  rounds: [],
  rooms: [],
  room_settings: [],
  room_entries: [],
  score_history: [],
  activity_logs: []
};

function getPool() {
  if (!pool && !useMemoryFallback) {
    pool = mysql.createPool(config.DB_CONFIG);
  }
  return pool;
}

function generateSecureToken(teamId) {
  const hash = crypto.createHash('sha256').update(`${teamId}_${Date.now()}_${Math.random()}`).digest('hex');
  return `aurora_${teamId.toLowerCase()}_${hash.slice(0, 16)}`;
}

// ─── Unified Query Execution ──────────────────────────────────────────────────
async function query(sql, params = []) {
  if (!useMemoryFallback) {
    try {
      const [rows] = await getPool().query(sql, params);
      return rows;
    } catch (err) {
      if (!pool || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        useMemoryFallback = true;
        console.warn('[DB] Falling back to In-Memory mode for local preview.');
        return queryMemory(sql, params);
      }
      throw err;
    }
  }
  return queryMemory(sql, params);
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  if (!useMemoryFallback) {
    try {
      const [result] = await getPool().execute(sql, params);
      return result;
    } catch (err) {
      if (!pool || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        useMemoryFallback = true;
        console.warn('[DB] Falling back to In-Memory mode for local preview.');
        return executeMemory(sql, params);
      }
      throw err;
    }
  }
  return executeMemory(sql, params);
}

// Memory query handler for offline preview
function queryMemory(sql, params = []) {
  const s = sql.trim().toLowerCase();

  if (s.includes('from users')) {
    if (s.includes('where username = ?')) {
      const u = memoryStore.users.find(x => x.username.toLowerCase() === String(params[0]).toLowerCase());
      return u ? [{ ...u }] : [];
    }
    if (s.includes('where id = ?')) {
      const u = memoryStore.users.find(x => x.id === params[0]);
      return u ? [{ ...u }] : [];
    }
    if (s.includes("role = 'sub_admin'")) {
      return memoryStore.users.filter(x => x.role === 'SUB_ADMIN').map(x => ({ ...x }));
    }
    return memoryStore.users.map(x => ({ ...x }));
  }

  if (s.includes('from teams')) {
    if (s.includes('upper(team_id) = upper(?)')) {
      const t = memoryStore.teams.find(x => x.team_id.toUpperCase() === String(params[0]).toUpperCase());
      return t ? [{ ...t }] : [];
    }
    if (s.includes('where qr_token = ?')) {
      const t = memoryStore.teams.find(x => x.qr_token === params[0]);
      return t ? [{ ...t }] : [];
    }
    if (s.includes('where id = ?')) {
      const t = memoryStore.teams.find(x => x.id === params[0]);
      return t ? [{ ...t }] : [];
    }
    if (s.includes('count(*)')) {
      if (s.includes("status = 'active'")) {
        return [{ count: memoryStore.teams.filter(t => t.status === 'ACTIVE').length }];
      }
      if (s.includes("status = 'eliminated'")) {
        return [{ count: memoryStore.teams.filter(t => t.status === 'ELIMINATED').length }];
      }
      return [{ count: memoryStore.teams.length }];
    }
    // All teams sorted by score DESC
    return [...memoryStore.teams].sort((a, b) => b.score - a.score || a.id - b.id);
  }

  if (s.includes('from rooms')) {
    if (s.includes('where room_code = ?')) {
      const r = memoryStore.rooms.find(x => x.room_code === params[0]);
      return r ? [{ ...r }] : [];
    }
    return memoryStore.rooms.map(x => ({ ...x }));
  }

  if (s.includes('from rounds')) {
    if (s.includes("status = 'active'")) {
      const r = memoryStore.rounds.find(x => x.status === 'ACTIVE');
      return r ? [{ ...r }] : [];
    }
    if (s.includes('where id = ?')) {
      const r = memoryStore.rounds.find(x => x.id === params[0]);
      return r ? [{ ...r }] : [];
    }
    if (s.includes('where round_number = ?')) {
      const r = memoryStore.rounds.find(x => x.round_number === params[0]);
      return r ? [{ ...r }] : [];
    }
    return [...memoryStore.rounds].sort((a, b) => a.round_number - b.round_number);
  }

  if (s.includes('from room_settings')) {
    if (s.includes('where round_id = ? and room_id = ?')) {
      const rs = memoryStore.room_settings.find(x => x.round_id === params[0] && x.room_id === params[1]);
      return rs ? [{ ...rs }] : [];
    }
    return memoryStore.room_settings.map(rs => {
      const r = memoryStore.rounds.find(x => x.id === rs.round_id) || {};
      const rm = memoryStore.rooms.find(x => x.id === rs.room_id) || {};
      return { ...rs, round_number: r.round_number, room_code: rm.room_code, room_name: rm.room_name };
    });
  }

  if (s.includes('from room_entries')) {
    const now = Date.now();
    if (s.includes('count(*)')) {
      const count = memoryStore.room_entries.filter(e => e.room_id === params[0] && e.round_id === params[1]).length;
      return [{ count }];
    }
    if (s.includes('where team_id = ? and round_id = ? and room_id = ?')) {
      const e = memoryStore.room_entries.find(x => x.team_id === params[0] && x.round_id === params[1] && x.room_id === params[2]);
      return e ? [{ ...e }] : [];
    }
    if (s.includes('where re.room_id = ?')) {
      const e = memoryStore.room_entries.find(x => x.room_id === params[0] && x.status === 'ACTIVE' && x.expiry_time > now);
      if (e) {
        const t = memoryStore.teams.find(x => x.id === e.team_id) || {};
        return [{ ...e, team_code: t.team_id, team_name: t.team_name }];
      }
      return [];
    }
    if (s.includes('where re.team_id = ?')) {
      const e = memoryStore.room_entries.find(x => x.team_id === params[0] && x.status === 'ACTIVE' && x.expiry_time > now);
      if (e) {
        const rm = memoryStore.rooms.find(x => x.id === e.room_id) || {};
        return [{ ...e, room_name: rm.room_name, room_code: rm.room_code }];
      }
      return [];
    }
    return memoryStore.room_entries.map(x => ({ ...x }));
  }

  if (s.includes('from activity_logs')) {
    return memoryStore.activity_logs.slice(0, 100);
  }

  return [];
}

function executeMemory(sql, params = []) {
  const s = sql.trim().toLowerCase();

  if (s.startsWith('insert into users')) {
    const id = memoryStore.users.length + 1;
    memoryStore.users.push({
      id,
      username: params[0],
      password_hash: params[1],
      name: params[2],
      role: params[3],
      assigned_room: params[4] || null,
      created_at: new Date()
    });
    return { insertId: id };
  }

  if (s.startsWith('insert into teams')) {
    const id = memoryStore.teams.length + 1;
    memoryStore.teams.push({
      id,
      team_id: params[0],
      team_name: params[1],
      password_hash: params[2],
      qr_token: params[3],
      score: params[4] || 0,
      status: params[5] || 'ACTIVE',
      current_round: params[6] || 1,
      created_at: new Date()
    });
    return { insertId: id };
  }

  if (s.startsWith('update teams set score = ? where id = ?')) {
    const t = memoryStore.teams.find(x => x.id === params[1]);
    if (t) t.score = params[0];
    return { affectedRows: 1 };
  }

  if (s.startsWith("update teams set status = 'eliminated'")) {
    const t = memoryStore.teams.find(x => x.id === params[0]);
    if (t) t.status = 'ELIMINATED';
    return { affectedRows: 1 };
  }

  if (s.startsWith("update teams set status = 'active'")) {
    const t = memoryStore.teams.find(x => x.id === params[0]);
    if (t) t.status = 'ACTIVE';
    return { affectedRows: 1 };
  }

  if (s.startsWith('update teams set score = 0, current_round = 1')) {
    memoryStore.teams.forEach(t => {
      t.score = 0;
      t.current_round = 1;
      t.status = 'ACTIVE';
    });
    return { affectedRows: memoryStore.teams.length };
  }

  if (s.startsWith('delete from room_entries')) {
    memoryStore.room_entries = [];
    return { affectedRows: 1 };
  }

  if (s.startsWith('delete from score_history')) {
    memoryStore.score_history = [];
    return { affectedRows: 1 };
  }

  if (s.startsWith('insert into room_entries')) {
    const id = memoryStore.room_entries.length + 1;
    memoryStore.room_entries.push({
      id,
      team_id: params[0],
      round_id: params[1],
      room_id: params[2],
      sub_admin_id: params[3],
      entry_time: params[4],
      expiry_time: params[5],
      status: params[6] || 'ACTIVE',
      created_at: new Date()
    });
    return { insertId: id };
  }

  if (s.startsWith('insert into activity_logs')) {
    const id = memoryStore.activity_logs.length + 1;
    memoryStore.activity_logs.unshift({
      id,
      user_id: params[0],
      username: params[1],
      action: params[2],
      details: params[3],
      timestamp: new Date()
    });
    return { insertId: id };
  }

  if (s.startsWith('insert into score_history')) {
    const id = memoryStore.score_history.length + 1;
    memoryStore.score_history.push({
      id,
      team_id: params[0],
      old_score: params[1],
      new_score: params[2],
      changed_by: params[3],
      reason: params[4],
      changed_at: new Date()
    });
    return { insertId: id };
  }

  if (s.includes('update rounds set status =')) {
    if (s.includes('round_number = 1')) {
      memoryStore.rounds.forEach(r => {
        r.status = r.round_number === 1 ? 'ACTIVE' : 'PENDING';
      });
    } else if (s.includes("status = 'active' where id = ?")) {
      const targetId = params[0];
      memoryStore.rounds.forEach(r => {
        if (r.id === targetId) r.status = 'ACTIVE';
        else if (r.id < targetId) r.status = 'COMPLETED';
        else r.status = 'PENDING';
      });
    }
    return { affectedRows: 1 };
  }

  if (s.includes('insert into room_settings')) {
    const roundId = params[0];
    const roomId = params[1];
    const dur = params[2];
    const existing = memoryStore.room_settings.find(x => x.round_id === roundId && x.room_id === roomId);
    if (existing) {
      existing.duration_minutes = dur;
    } else {
      memoryStore.room_settings.push({
        id: memoryStore.room_settings.length + 1,
        round_id: roundId,
        room_id: roomId,
        duration_minutes: dur
      });
    }
    return { affectedRows: 1 };
  }

  return { affectedRows: 1 };
}

async function logActivity(userId, username, action, details) {
  try {
    await execute(
      'INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)',
      [userId || null, username || 'SYSTEM', action, typeof details === 'object' ? JSON.stringify(details) : String(details || '')]
    );
  } catch (err) {
    console.error('[DB] Activity log error:', err.message);
  }
}

async function initDatabase() {
  try {
    const p = getPool();
    const conn = await p.getConnection();
    console.log('[DB] TiDB Cloud / MySQL pool established successfully.');
    conn.release();

    // Create tables in TiDB
    await execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role ENUM('HEAD_ADMIN', 'SUB_ADMIN') NOT NULL DEFAULT 'SUB_ADMIN',
        assigned_room VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id VARCHAR(50) UNIQUE NOT NULL,
        team_name VARCHAR(150) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        qr_token VARCHAR(100) UNIQUE NOT NULL,
        score INT NOT NULL DEFAULT 0,
        status ENUM('ACTIVE', 'ELIMINATED') NOT NULL DEFAULT 'ACTIVE',
        current_round INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS rounds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        round_number INT UNIQUE NOT NULL,
        status ENUM('PENDING', 'ACTIVE', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_code VARCHAR(50) UNIQUE NOT NULL,
        room_name VARCHAR(150) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS room_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        round_id INT NOT NULL,
        room_id INT NOT NULL,
        duration_minutes INT NOT NULL DEFAULT 5,
        FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        UNIQUE KEY unique_round_room (round_id, room_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS room_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        round_id INT NOT NULL,
        room_id INT NOT NULL,
        sub_admin_id INT NULL,
        entry_time BIGINT NOT NULL,
        expiry_time BIGINT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (sub_admin_id) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY unique_entry (team_id, round_id, room_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS score_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        old_score INT NOT NULL,
        new_score INT NOT NULL,
        changed_by VARCHAR(100) NOT NULL,
        reason VARCHAR(255) NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        username VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
        action VARCHAR(100) NOT NULL,
        details TEXT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

  } catch (err) {
    useMemoryFallback = true;
    console.warn('[DB] TiDB Cloud host not reachable locally without credentials in .env.');
    console.warn('[DB] Activating In-Memory fallback for immediate local testing.');
  }

  await seedInitialData();
}

async function seedInitialData() {
  // 1. Seed Head Admin
  const headAdmin = await getOne('SELECT id FROM users WHERE username = ?', [config.HEAD_ADMIN.username]);
  if (!headAdmin) {
    const hash = await bcrypt.hash(config.HEAD_ADMIN.password, 10);
    await execute(
      'INSERT INTO users (username, password_hash, name, role, assigned_room) VALUES (?, ?, ?, ?, ?)',
      [config.HEAD_ADMIN.username, hash, 'Mashood (Head Admin)', 'HEAD_ADMIN', null]
    );
  }

  // 2. Seed Default Rooms
  for (const r of config.DEFAULT_ROOMS) {
    const existing = await getOne('SELECT id FROM rooms WHERE room_code = ?', [r.code]);
    if (!existing) {
      if (useMemoryFallback) {
        memoryStore.rooms.push({ id: memoryStore.rooms.length + 1, room_code: r.code, room_name: r.name });
      } else {
        await execute('INSERT INTO rooms (room_code, room_name) VALUES (?, ?)', [r.code, r.name]);
      }
    }
  }

  const policeRoom = await getOne('SELECT id FROM rooms WHERE room_code = ?', ['POLICE']);
  const labRoom = await getOne('SELECT id FROM rooms WHERE room_code = ?', ['LAB']);

  // 3. Seed Default Sub Admins
  const subPolice = await getOne('SELECT id FROM users WHERE username = ?', ['POLICE01']);
  if (!subPolice) {
    const hash = await bcrypt.hash('SecurePassword', 10);
    await execute(
      'INSERT INTO users (username, password_hash, name, role, assigned_room) VALUES (?, ?, ?, ?, ?)',
      ['POLICE01', hash, 'Police Room Volunteer', 'SUB_ADMIN', 'POLICE']
    );
  }

  const subLab = await getOne('SELECT id FROM users WHERE username = ?', ['LAB01']);
  if (!subLab) {
    const hash = await bcrypt.hash('SecurePassword', 10);
    await execute(
      'INSERT INTO users (username, password_hash, name, role, assigned_room) VALUES (?, ?, ?, ?, ?)',
      ['LAB01', hash, 'Scientist Lab Volunteer', 'SUB_ADMIN', 'LAB']
    );
  }

  // 4. Seed Rounds
  for (let rNum = 1; rNum <= 3; rNum++) {
    const existingRound = await getOne('SELECT id FROM rounds WHERE round_number = ?', [rNum]);
    if (!existingRound) {
      const status = rNum === 1 ? 'ACTIVE' : 'PENDING';
      if (useMemoryFallback) {
        memoryStore.rounds.push({ id: memoryStore.rounds.length + 1, round_number: rNum, status });
      } else {
        await execute('INSERT INTO rounds (round_number, status) VALUES (?, ?)', [rNum, status]);
      }
    }
  }

  // 5. Seed Room Settings
  const rounds = await query('SELECT * FROM rounds ORDER BY round_number ASC');
  for (const round of rounds) {
    let policeDur = round.round_number === 2 ? 6 : 5;
    let labDur = round.round_number === 2 ? 5 : 7;

    if (policeRoom) {
      const pSetting = await getOne('SELECT id FROM room_settings WHERE round_id = ? AND room_id = ?', [round.id, policeRoom.id]);
      if (!pSetting) {
        await execute('INSERT INTO room_settings (round_id, room_id, duration_minutes) VALUES (?, ?, ?)', [round.id, policeRoom.id, policeDur]);
      }
    }

    if (labRoom) {
      const lSetting = await getOne('SELECT id FROM room_settings WHERE round_id = ? AND room_id = ?', [round.id, labRoom.id]);
      if (!lSetting) {
        await execute('INSERT INTO room_settings (round_id, room_id, duration_minutes) VALUES (?, ?, ?)', [round.id, labRoom.id, labDur]);
      }
    }
  }

  // 6. Seed Demo Teams
  const countRow = await getOne('SELECT COUNT(*) as count FROM teams');
  if (parseInt(countRow?.count || 0, 10) === 0) {
    const demoTeams = [
      { id: 'AURORA001', name: 'TEAM ALPHA',   score: 950 },
      { id: 'AURORA002', name: 'TEAM PHANTOM', score: 910 },
      { id: 'AURORA003', name: 'TEAM SHADOW',  score: 875 },
      { id: 'AURORA004', name: 'TEAM VECTOR',  score: 820 },
      { id: 'AURORA005', name: 'TEAM HUNTER',  score: 780 }
    ];

    for (const t of demoTeams) {
      const passHash = await bcrypt.hash(t.name, 10);
      const token = generateSecureToken(t.id);
      await execute(
        'INSERT INTO teams (team_id, team_name, password_hash, qr_token, score, status, current_round) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [t.id, t.name, passHash, token, t.score, 'ACTIVE', 1]
      );
    }
  }
}

module.exports = {
  getPool,
  query,
  getOne,
  execute,
  logActivity,
  generateSecureToken,
  initDatabase
};
