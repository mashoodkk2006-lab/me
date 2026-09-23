const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getOne, logActivity } = require('../db');
const { generateToken, authenticate } = require('../auth');

// ─── ADMIN LOGIN (Head Admin or Sub Admin) ────────────────────────────────────
router.post('/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await getOne('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const payload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      assigned_room: user.assigned_room
    };

    const token = generateToken(payload);

    res.cookie('aurora_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000
    });

    await logActivity(user.id, user.username, 'ADMIN_LOGIN', `Logged in with role ${user.role}`);

    return res.json({
      success: true,
      token,
      user: payload
    });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// ─── STUDENT LOGIN (Team ID + Team Name) ──────────────────────────────────────
router.post('/student-login', async (req, res) => {
  try {
    const { teamId, password } = req.body; // password is the Team Name
    if (!teamId || !password) {
      return res.status(400).json({ error: 'Team ID and Team Name are required.' });
    }

    const team = await getOne(
      'SELECT * FROM teams WHERE UPPER(team_id) = UPPER(?)',
      [teamId.trim()]
    );

    if (!team) {
      return res.status(401).json({ error: 'Team ID not found. Verify your credentials.' });
    }

    // Compare provided password with team_name or password_hash
    const normalizedPass = password.trim().toUpperCase();
    const normalizedName = team.team_name.trim().toUpperCase();
    
    let isMatch = false;
    if (normalizedPass === normalizedName) {
      isMatch = true;
    } else {
      isMatch = await bcrypt.compare(password.trim(), team.password_hash);
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid Team Name for this Team ID.' });
    }

    const payload = {
      id: team.id,
      team_id: team.team_id,
      team_name: team.team_name,
      role: 'STUDENT',
      status: team.status
    };

    const token = generateToken(payload);

    res.cookie('aurora_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      token,
      team: {
        id: team.id,
        team_id: team.team_id,
        team_name: team.team_name,
        score: team.score,
        status: team.status,
        current_round: team.current_round
      }
    });
  } catch (err) {
    console.error('Student login error:', err);
    return res.status(500).json({ error: 'Internal server error during student login.' });
  }
});

// ─── GET CURRENT USER / VERIFY SESSION ────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'STUDENT') {
      const team = await getOne(
        'SELECT id, team_id, team_name, score, status, current_round, qr_token FROM teams WHERE id = ?',
        [req.user.id]
      );
      if (!team) return res.status(404).json({ error: 'Team record not found.' });
      return res.json({ user: { ...req.user, ...team } });
    } else {
      const user = await getOne(
        'SELECT id, username, name, role, assigned_room FROM users WHERE id = ?',
        [req.user.id]
      );
      if (!user) return res.status(404).json({ error: 'User record not found.' });
      return res.json({ user });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify session.' });
  }
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('aurora_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;
