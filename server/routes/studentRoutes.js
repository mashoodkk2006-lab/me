const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { query, getOne } = require('../db');
const { requireStudent } = require('../auth');

// ─── STUDENT DASHBOARD DATA ──────────────────────────────────────────────────
router.get('/dashboard', requireStudent, async (req, res) => {
  try {
    const teamId = req.user.id;
    const now = Date.now();

    // 1. Fetch Latest Team Data
    const team = await getOne(
      'SELECT id, team_id, team_name, score, status, current_round, qr_token FROM teams WHERE id = ?',
      [teamId]
    );

    if (!team) {
      return res.status(404).json({ error: 'Team record not found.' });
    }

    // Generate QR Code data URL
    const qrData = JSON.stringify({
      t: team.qr_token,
      id: team.team_id,
      name: team.team_name
    });

    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (e) {
      console.error('QR generation error for student:', e);
    }

    // 2. Fetch Active Round
    const activeRound = await getOne(
      "SELECT * FROM rounds WHERE status = 'ACTIVE' ORDER BY round_number ASC LIMIT 1"
    );

    // 3. Check if team is currently inside an active room with running countdown
    const currentEntry = await getOne(
      `SELECT re.*, r.room_name, r.room_code
       FROM room_entries re
       JOIN rooms r ON re.room_id = r.id
       WHERE re.team_id = ? AND re.status = 'ACTIVE' AND re.expiry_time > ?
       ORDER BY re.entry_time DESC LIMIT 1`,
      [teamId, now]
    );

    // 4. Fetch Full Leaderboard
    const leaderboard = await query(`
      SELECT id, team_id, team_name, score, status, current_round
      FROM teams
      ORDER BY score DESC, id ASC
    `);

    // Calculate team rank
    let rank = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      if (leaderboard[i].id === team.id) {
        rank = i + 1;
        break;
      }
    }

    res.json({
      server_time: now,
      team: {
        id: team.id,
        team_id: team.team_id,
        team_name: team.team_name,
        score: team.score,
        status: team.status,
        current_round: team.current_round,
        qr_token: team.qr_token,
        qr_code_data_url: qrCodeDataUrl,
        rank
      },
      active_round: activeRound || null,
      current_room: currentEntry ? {
        room_name: currentEntry.room_name,
        room_code: currentEntry.room_code,
        entry_time: currentEntry.entry_time,
        expiry_time: currentEntry.expiry_time,
        remaining_seconds: Math.max(0, Math.floor((currentEntry.expiry_time - now) / 1000))
      } : null,
      leaderboard
    });

  } catch (err) {
    console.error('Student dashboard error:', err);
    res.status(500).json({ error: 'Failed to retrieve student dashboard.' });
  }
});

// ─── GET STUDENT QR CODE IMAGE ───────────────────────────────────────────────
router.get('/qr', requireStudent, async (req, res) => {
  try {
    const teamId = req.user.id;
    const team = await getOne('SELECT id, team_id, team_name, qr_token FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

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

module.exports = router;

