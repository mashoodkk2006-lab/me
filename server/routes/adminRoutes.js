const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { query, getOne, execute, logActivity, generateSecureToken } = require('../db');
const { requireHeadAdmin, requireAdminOrVolunteer } = require('../auth');
const {
  broadcastLeaderboard,
  broadcastTeamStatus,
  broadcastRoundUpdate,
  broadcastEventReset
} = require('../socket');

// Apply Head Admin authorization by default to all routes in this file
// (Sub admins have volunteerRoutes, but some read-only monitor endpoints allow both)

// ─── DASHBOARD / MONITOR DATA (Head Admin & Sub Admins) ───────────────────────
router.get('/monitor', requireAdminOrVolunteer, async (req, res) => {
  try {
    const now = Date.now();

    // 1. Fetch Active Round
    const activeRound = await getOne(
      "SELECT * FROM rounds WHERE status = 'ACTIVE' ORDER BY round_number ASC LIMIT 1"
    );

    // 2. Fetch Rooms with settings for active round
    const rooms = await query('SELECT * FROM rooms ORDER BY id ASC');
    const roomMonitors = [];

    for (const room of rooms) {
      // Find duration configured for active round
      let durationMinutes = 5;
      if (activeRound) {
        const setting = await getOne(
          'SELECT duration_minutes FROM room_settings WHERE round_id = ? AND room_id = ?',
          [activeRound.id, room.id]
        );
        if (setting) durationMinutes = setting.duration_minutes;
      }

      // Find active entry inside this room
      const activeEntry = await getOne(
        `SELECT re.*, t.team_id as team_code, t.team_name, u.name as volunteer_name
         FROM room_entries re
         JOIN teams t ON re.team_id = t.id
         LEFT JOIN users u ON re.sub_admin_id = u.id
         WHERE re.room_id = ? AND re.status = 'ACTIVE' AND re.expiry_time > ?
         ORDER BY re.entry_time DESC LIMIT 1`,
        [room.id, now]
      );

      // Find total entries in this room for active round
      let totalEntriesInRound = 0;
      if (activeRound) {
        const countRow = await getOne(
          'SELECT COUNT(*) as count FROM room_entries WHERE room_id = ? AND round_id = ?',
          [room.id, activeRound.id]
        );
        totalEntriesInRound = parseInt(countRow.count, 10);
      }

      roomMonitors.push({
        room_id: room.id,
        room_code: room.room_code,
        room_name: room.room_name,
        duration_minutes: durationMinutes,
        total_entries_in_round: totalEntriesInRound,
        active_entry: activeEntry ? {
          entry_id: activeEntry.id,
          team_id: activeEntry.team_id,
          team_code: activeEntry.team_code,
          team_name: activeEntry.team_name,
          volunteer_name: activeEntry.volunteer_name,
          entry_time: activeEntry.entry_time,
          expiry_time: activeEntry.expiry_time,
          remaining_seconds: Math.max(0, Math.floor((activeEntry.expiry_time - now) / 1000))
        } : null
      });
    }

    // 3. Stats summary
    const teamCount = await getOne('SELECT COUNT(*) as count FROM teams');
    const activeTeams = await getOne("SELECT COUNT(*) as count FROM teams WHERE status = 'ACTIVE'");
    const eliminatedTeams = await getOne("SELECT COUNT(*) as count FROM teams WHERE status = 'ELIMINATED'");

    res.json({
      server_time: now,
      active_round: activeRound || null,
      room_monitors: roomMonitors,
      stats: {
        total_teams: parseInt(teamCount.count, 10),
        active_teams: parseInt(activeTeams.count, 10),
        eliminated_teams: parseInt(eliminatedTeams.count, 10)
      }
    });
  } catch (err) {
    console.error('Monitor fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve monitor data.' });
  }
});

// ─── TEAM MANAGEMENT (Head Admin) ─────────────────────────────────────────────

// Get all teams with QR badges data
router.get('/teams', requireHeadAdmin, async (req, res) => {
  try {
    const teams = await query(`
      SELECT id, team_id, team_name, score, status, current_round, qr_token, created_at
      FROM teams
      ORDER BY score DESC, id ASC
    `);
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teams.' });
  }
});

// Create new team
router.post('/teams', requireHeadAdmin, async (req, res) => {
  try {
    const { team_id, team_name, initial_score = 0 } = req.body;
    if (!team_id || !team_name) {
      return res.status(400).json({ error: 'Team ID and Team Name are required.' });
    }

    const cleanId = team_id.trim().toUpperCase();
    const cleanName = team_name.trim();

    // Check unique
    const existing = await getOne('SELECT id FROM teams WHERE UPPER(team_id) = ?', [cleanId]);
    if (existing) {
      return res.status(400).json({ error: `Team ID ${cleanId} already exists.` });
    }

    const passHash = await bcrypt.hash(cleanName, 10);
    const qrToken = generateSecureToken(cleanId);

    const result = await execute(
      'INSERT INTO teams (team_id, team_name, password_hash, qr_token, score, status, current_round) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cleanId, cleanName, passHash, qrToken, parseInt(initial_score, 10) || 0, 'ACTIVE', 1]
    );

    await logActivity(req.user.id, req.user.username, 'CREATE_TEAM', `Created team ${cleanId} (${cleanName})`);
    await broadcastLeaderboard();

    res.json({
      success: true,
      team: {
        id: result.insertId,
        team_id: cleanId,
        team_name: cleanName,
        qr_token: qrToken,
        score: parseInt(initial_score, 10) || 0,
        status: 'ACTIVE'
      }
    });
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Failed to create team.' });
  }
});

// Update team score / marks
router.post('/teams/:id/score', requireHeadAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const { score, delta, reason } = req.body;

    const team = await getOne('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    let newScore = team.score;
    if (typeof delta === 'number') {
      newScore = team.score + delta;
    } else if (typeof score === 'number') {
      newScore = score;
    }

    await execute('UPDATE teams SET score = ? WHERE id = ?', [newScore, teamId]);

    // Record in score history
    await execute(
      'INSERT INTO score_history (team_id, old_score, new_score, changed_by, reason) VALUES (?, ?, ?, ?, ?)',
      [teamId, team.score, newScore, req.user.username, reason || 'Manual Admin adjustment']
    );

    await logActivity(
      req.user.id,
      req.user.username,
      'UPDATE_SCORE',
      `Updated ${team.team_name} score from ${team.score} to ${newScore} (${reason || 'Admin'})`
    );

    await broadcastLeaderboard();

    res.json({ success: true, team_id: teamId, old_score: team.score, new_score: newScore });
  } catch (err) {
    console.error('Score update error:', err);
    res.status(500).json({ error: 'Failed to update score.' });
  }
});

// Eliminate team
router.post('/teams/:id/eliminate', requireHeadAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const team = await getOne('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    await execute("UPDATE teams SET status = 'ELIMINATED' WHERE id = ?", [teamId]);
    
    // Also expire any active room entries for this team
    await execute(
      "UPDATE room_entries SET status = 'EXPIRED' WHERE team_id = ? AND status = 'ACTIVE'",
      [teamId]
    );

    await logActivity(req.user.id, req.user.username, 'ELIMINATE_TEAM', `Eliminated team ${team.team_id} (${team.team_name})`);

    broadcastTeamStatus({ team_id: team.id, status: 'ELIMINATED', team_name: team.team_name });
    await broadcastLeaderboard();

    res.json({ success: true, message: `Team ${team.team_name} has been ELIMINATED.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to eliminate team.' });
  }
});

// Restore team
router.post('/teams/:id/restore', requireHeadAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const team = await getOne('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    await execute("UPDATE teams SET status = 'ACTIVE' WHERE id = ?", [teamId]);

    await logActivity(req.user.id, req.user.username, 'RESTORE_TEAM', `Restored team ${team.team_id} (${team.team_name})`);

    broadcastTeamStatus({ team_id: team.id, status: 'ACTIVE', team_name: team.team_name });
    await broadcastLeaderboard();

    res.json({ success: true, message: `Team ${team.team_name} has been RESTORED.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore team.' });
  }
});

// Delete team permanently
router.delete('/teams/:id', requireHeadAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const team = await getOne('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    // Delete dependent records first if DB foreign keys aren't cascaded
    await execute('DELETE FROM room_entries WHERE team_id = ?', [teamId]);
    await execute('DELETE FROM score_history WHERE team_id = ?', [teamId]);
    await execute('DELETE FROM teams WHERE id = ?', [teamId]);

    await logActivity(req.user.id, req.user.username, 'DELETE_TEAM', `Permanently deleted team ${team.team_id} (${team.team_name})`);

    broadcastTeamStatus({ team_id: teamId, status: 'DELETED', team_name: team.team_name });
    await broadcastLeaderboard();

    res.json({ success: true, message: `Team ${team.team_name} has been deleted permanently.` });
  } catch (err) {
    console.error('Delete team error:', err);
    res.status(500).json({ error: 'Failed to delete team.' });
  }
});

// Generate/View QR code image for a team
router.get('/teams/:id/qr', requireHeadAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const team = await getOne('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    // Payload inside QR: token or JSON containing qr_token and team_id
    const qrData = JSON.stringify({
      t: team.qr_token,
      id: team.team_id,
      name: team.team_name
    });

    const dataUrl = await QRCode.toDataURL(qrData, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    res.json({
      team_id: team.team_id,
      team_name: team.team_name,
      qr_token: team.qr_token,
      qr_code_data_url: dataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code.' });
  }
});

// ─── SUB ADMIN / VOLUNTEER MANAGEMENT (Head Admin) ───────────────────────────
router.get('/volunteers', requireHeadAdmin, async (req, res) => {
  try {
    const volunteers = await query(`
      SELECT id, username, name, role, assigned_room, created_at
      FROM users
      WHERE role = 'SUB_ADMIN'
      ORDER BY id ASC
    `);
    res.json(volunteers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sub-admins.' });
  }
});

router.post('/volunteers', requireHeadAdmin, async (req, res) => {
  try {
    const { username, password, name, assigned_room } = req.body;
    if (!username || !password || !name || !assigned_room) {
      return res.status(400).json({ error: 'Username, password, name, and assigned room are required.' });
    }

    if (!['POLICE', 'LAB'].includes(assigned_room)) {
      return res.status(400).json({ error: 'Assigned room must be either POLICE or LAB.' });
    }

    const cleanUser = username.trim();
    const existing = await getOne('SELECT id FROM users WHERE username = ?', [cleanUser]);
    if (existing) {
      return res.status(400).json({ error: `Username ${cleanUser} is already taken.` });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await execute(
      'INSERT INTO users (username, password_hash, name, role, assigned_room) VALUES (?, ?, ?, ?, ?)',
      [cleanUser, hash, name.trim(), 'SUB_ADMIN', assigned_room]
    );

    await logActivity(req.user.id, req.user.username, 'CREATE_VOLUNTEER', `Created sub-admin ${cleanUser} for room ${assigned_room}`);

    res.json({
      success: true,
      volunteer: {
        id: result.insertId,
        username: cleanUser,
        name: name.trim(),
        role: 'SUB_ADMIN',
        assigned_room
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create sub-admin.' });
  }
});

// ─── ROUNDS & ROOM CONFIGURATION (Head Admin) ─────────────────────────────────
router.get('/rounds', requireHeadAdmin, async (req, res) => {
  try {
    const rounds = await query('SELECT * FROM rounds ORDER BY round_number ASC');
    const rooms = await query('SELECT * FROM rooms ORDER BY id ASC');
    const settings = await query(`
      SELECT rs.*, r.round_number, rm.room_code, rm.room_name
      FROM room_settings rs
      JOIN rounds r ON rs.round_id = r.id
      JOIN rooms rm ON rs.room_id = rm.id
    `);

    res.json({ rounds, rooms, settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rounds and settings.' });
  }
});

// Set active round
router.post('/rounds/:id/set-active', requireHeadAdmin, async (req, res) => {
  try {
    const roundId = parseInt(req.params.id, 10);
    const targetRound = await getOne('SELECT * FROM rounds WHERE id = ?', [roundId]);
    if (!targetRound) return res.status(404).json({ error: 'Round not found.' });

    // Mark all other rounds as completed or pending
    await execute("UPDATE rounds SET status = 'COMPLETED' WHERE id < ?", [roundId]);
    await execute("UPDATE rounds SET status = 'ACTIVE' WHERE id = ?", [roundId]);
    await execute("UPDATE rounds SET status = 'PENDING' WHERE id > ?", [roundId]);

    // Also update current_round on active teams
    await execute("UPDATE teams SET current_round = ? WHERE status = 'ACTIVE'", [targetRound.round_number]);

    await logActivity(req.user.id, req.user.username, 'SET_ROUND', `Set Round ${targetRound.round_number} as ACTIVE`);

    broadcastRoundUpdate({ round_id: targetRound.id, round_number: targetRound.round_number, status: 'ACTIVE' });

    res.json({ success: true, active_round: targetRound });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set active round.' });
  }
});

// Update room duration for a round
router.post('/room-settings', requireHeadAdmin, async (req, res) => {
  try {
    const { round_id, room_id, duration_minutes } = req.body;
    if (!round_id || !room_id || !duration_minutes) {
      return res.status(400).json({ error: 'round_id, room_id, and duration_minutes are required.' });
    }

    const duration = parseInt(duration_minutes, 10);
    if (isNaN(duration) || duration <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive integer.' });
    }

    await execute(`
      INSERT INTO room_settings (round_id, room_id, duration_minutes)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE duration_minutes = VALUES(duration_minutes)
    `, [round_id, room_id, duration]);

    await logActivity(
      req.user.id,
      req.user.username,
      'UPDATE_ROOM_SETTING',
      `Updated duration to ${duration} mins for round ${round_id}, room ${room_id}`
    );

    res.json({ success: true, round_id, room_id, duration_minutes: duration });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update room settings.' });
  }
});

// ─── RESET WHOLE EVENT (Head Admin) ───────────────────────────────────────────
// "Require confirmation.
// Reset:
// - Scores
// - Room entries
// - Timers
// - Round progress
// - Participation data
// - Leaderboard
// Do NOT delete team accounts or admin accounts."
router.post('/reset-event', requireHeadAdmin, async (req, res) => {
  try {
    const { confirmation_code } = req.body;
    if (confirmation_code !== 'RESET_THE_AURORA_PROTOCOL') {
      return res.status(400).json({
        error: "Confirmation code required. Please enter 'RESET_THE_AURORA_PROTOCOL' to confirm."
      });
    }

    // 1. Reset all team scores to 0, current_round to 1, and restore status to ACTIVE
    await execute('UPDATE teams SET score = 0, current_round = 1, status = "ACTIVE"');

    // 2. Clear all room entries (timers and participation data)
    await execute('DELETE FROM room_entries');

    // 3. Clear score history
    await execute('DELETE FROM score_history');

    // 4. Reset rounds: Round 1 ACTIVE, others PENDING
    await execute("UPDATE rounds SET status = 'ACTIVE' WHERE round_number = 1");
    await execute("UPDATE rounds SET status = 'PENDING' WHERE round_number > 1");

    await logActivity(req.user.id, req.user.username, 'RESET_EVENT', 'Full event reset executed. Accounts preserved.');

    broadcastEventReset();
    await broadcastLeaderboard();

    res.json({
      success: true,
      message: 'The Aurora Protocol event has been completely reset. All teams and admins are preserved.'
    });
  } catch (err) {
    console.error('Reset event error:', err);
    res.status(500).json({ error: 'Failed to reset event.' });
  }
});

// ─── ACTIVITY LOGS (Head Admin) ───────────────────────────────────────────────
router.get('/logs', requireHeadAdmin, async (req, res) => {
  try {
    const logs = await query('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity logs.' });
  }
});

module.exports = router;
