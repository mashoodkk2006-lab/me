const express = require('express');
const router = express.Router();
const { query, getOne, execute, logActivity } = require('../db');
const { requireAdminOrVolunteer } = require('../auth');
const { broadcastRoomEntry } = require('../socket');

// ─── GET CURRENT ACTIVE ROOM STATUS ──────────────────────────────────────────
router.get('/room-status', requireAdminOrVolunteer, async (req, res) => {
  try {
    const roomCode = req.query.room_code || req.user.assigned_room;
    if (!roomCode) {
      return res.status(400).json({ error: 'Assigned room code required.' });
    }

    const room = await getOne('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    const activeRound = await getOne("SELECT * FROM rounds WHERE status = 'ACTIVE' ORDER BY round_number ASC LIMIT 1");
    const now = Date.now();

    // Check for an currently running active entry in this room
    const currentEntry = await getOne(
      `SELECT re.*, t.team_id as team_code, t.team_name, t.status as team_status
       FROM room_entries re
       JOIN teams t ON re.team_id = t.id
       WHERE re.room_id = ? AND re.status = 'ACTIVE' AND re.expiry_time > ?
       ORDER BY re.entry_time DESC LIMIT 1`,
      [room.id, now]
    );

    // Duration setting
    let durationMinutes = 5;
    if (activeRound) {
      const setting = await getOne(
        'SELECT duration_minutes FROM room_settings WHERE round_id = ? AND room_id = ?',
        [activeRound.id, room.id]
      );
      if (setting) durationMinutes = setting.duration_minutes;
    }

    res.json({
      room,
      active_round: activeRound || null,
      duration_minutes: durationMinutes,
      server_time: now,
      current_entry: currentEntry ? {
        id: currentEntry.id,
        team_id: currentEntry.team_id,
        team_code: currentEntry.team_code,
        team_name: currentEntry.team_name,
        entry_time: currentEntry.entry_time,
        expiry_time: currentEntry.expiry_time,
        remaining_seconds: Math.max(0, Math.floor((currentEntry.expiry_time - now) / 1000))
      } : null
    });
  } catch (err) {
    console.error('Room status error:', err);
    res.status(500).json({ error: 'Failed to retrieve room status.' });
  }
});

// ─── VALIDATE AND SCAN QR CODE ────────────────────────────────────────────────
router.post('/scan', requireAdminOrVolunteer, async (req, res) => {
  try {
    const { qr_data, room_code } = req.body;
    if (!qr_data) {
      return res.status(400).json({ error: 'QR data is required.' });
    }

    const targetRoomCode = room_code || req.user.assigned_room;
    if (!targetRoomCode) {
      return res.status(400).json({ error: 'No room assigned to this scanner.' });
    }

    const room = await getOne('SELECT * FROM rooms WHERE room_code = ?', [targetRoomCode]);
    if (!room) {
      return res.status(404).json({ error: `Room ${targetRoomCode} not recognized.` });
    }

    // Parse QR payload (can be JSON or plain string)
    let token = qr_data.trim();
    let parsedId = null;

    if (qr_data.startsWith('{')) {
      try {
        const parsed = JSON.parse(qr_data);
        token = parsed.t || token;
        parsedId = parsed.id || null;
      } catch (e) {
        // Fallback to raw string
      }
    }

    // 1. Locate Team
    let team = null;
    if (parsedId) {
      team = await getOne('SELECT * FROM teams WHERE UPPER(team_id) = UPPER(?)', [parsedId]);
    }
    if (!team) {
      team = await getOne('SELECT * FROM teams WHERE qr_token = ?', [token]);
    }
    if (!team) {
      team = await getOne('SELECT * FROM teams WHERE UPPER(team_id) = UPPER(?)', [token]);
    }

    if (!team) {
      return res.status(404).json({
        access_granted: false,
        status: 'DENIED',
        reason: 'ACCESS DENIED — UNRECOGNIZED TEAM QR CODE',
        team: null
      });
    }

    // 2. Check if Team is ELIMINATED
    if (team.status === 'ELIMINATED') {
      await logActivity(
        req.user.id,
        req.user.username,
        'SCAN_DENIED_ELIMINATED',
        `Attempted entry for ELIMINATED team ${team.team_id} (${team.team_name}) in ${room.room_name}`
      );

      return res.json({
        access_granted: false,
        status: 'DENIED_ELIMINATED',
        reason: 'ACCESS DENIED — TEAM ELIMINATED',
        team: {
          team_id: team.team_id,
          team_name: team.team_name,
          status: team.status
        }
      });
    }

    // 3. Check for Active Round
    const activeRound = await getOne("SELECT * FROM rounds WHERE status = 'ACTIVE' ORDER BY round_number ASC LIMIT 1");
    if (!activeRound) {
      return res.status(400).json({
        access_granted: false,
        status: 'DENIED',
        reason: 'ACCESS DENIED — NO ACTIVE ROUND IN PROGRESS',
        team: { team_id: team.team_id, team_name: team.team_name }
      });
    }

    // 4. Check if Team already entered THIS room in THIS round
    const existingEntry = await getOne(
      'SELECT * FROM room_entries WHERE team_id = ? AND round_id = ? AND room_id = ?',
      [team.id, activeRound.id, room.id]
    );

    if (existingEntry) {
      await logActivity(
        req.user.id,
        req.user.username,
        'SCAN_DENIED_ALREADY_ENTERED',
        `Duplicate entry denied for ${team.team_id} (${team.team_name}) in ${room.room_name} (Round ${activeRound.round_number})`
      );

      return res.json({
        access_granted: false,
        status: 'DENIED_ALREADY_ENTERED',
        reason: 'ACCESS DENIED — TEAM ALREADY ENTERED THIS ROOM',
        team: {
          team_id: team.team_id,
          team_name: team.team_name,
          round_number: activeRound.round_number
        },
        previous_entry_time: existingEntry.entry_time
      });
    }

    // 5. Look up room duration for active round
    let durationMinutes = 5;
    const setting = await getOne(
      'SELECT duration_minutes FROM room_settings WHERE round_id = ? AND room_id = ?',
      [activeRound.id, room.id]
    );
    if (setting) {
      durationMinutes = setting.duration_minutes;
    }

    // 6. Record Room Entry (Server authoritative timestamps)
    const now = Date.now();
    const expiryTime = now + (durationMinutes * 60 * 1000);

    const insertResult = await execute(
      'INSERT INTO room_entries (team_id, round_id, room_id, sub_admin_id, entry_time, expiry_time, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [team.id, activeRound.id, room.id, req.user.id, now, expiryTime, 'ACTIVE']
    );

    await logActivity(
      req.user.id,
      req.user.username,
      'SCAN_GRANTED',
      `ACCESS GRANTED for ${team.team_id} (${team.team_name}) in ${room.room_name} (Round ${activeRound.round_number}, ${durationMinutes}m)`
    );

    const responsePayload = {
      access_granted: true,
      status: 'GRANTED',
      message: 'ACCESS GRANTED',
      entry_id: insertResult.insertId,
      team: {
        id: team.id,
        team_id: team.team_id,
        team_name: team.team_name,
        score: team.score
      },
      room: {
        id: room.id,
        room_code: room.room_code,
        room_name: room.room_name
      },
      round_number: activeRound.round_number,
      duration_minutes: durationMinutes,
      entry_time: now,
      expiry_time: expiryTime,
      remaining_seconds: durationMinutes * 60
    };

    // Broadcast room entry to admin monitor & student dashboards in real time
    broadcastRoomEntry(responsePayload);

    return res.json(responsePayload);

  } catch (err) {
    console.error('Scan processing error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.json({
        access_granted: false,
        status: 'DENIED_ALREADY_ENTERED',
        reason: 'ACCESS DENIED — TEAM ALREADY ENTERED THIS ROOM'
      });
    }
    return res.status(500).json({ error: 'Internal error processing scan.' });
  }
});

module.exports = router;
