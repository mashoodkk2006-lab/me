const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fs = require('fs');

const config = require('./server/config');
const { initDatabase, query } = require('./server/db');
const { initSocket } = require('./server/socket');

const authRoutes = require('./server/routes/authRoutes');
const adminRoutes = require('./server/routes/adminRoutes');
const volunteerRoutes = require('./server/routes/volunteerRoutes');
const studentRoutes = require('./server/routes/studentRoutes');

const app = express();
const server = http.createServer(app);

// ─── Real-Time Socket.IO ───────────────────────────────────────────────────────
const io = initSocket(server);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static assets from public/ folder (e.g. logos, audio cues)
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Public Endpoints ─────────────────────────────────────────────────────────
// Public Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'THE AURORA PROTOCOL',
    timestamp: new Date().toISOString()
  });
});

// Public Live Leaderboard endpoint
app.get('/api/leaderboard', async (req, res) => {
  try {
    const teams = await query(`
      SELECT id, team_id, team_name, score, status, current_round
      FROM teams
      ORDER BY score DESC, id ASC
    `);
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard.' });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/volunteer', volunteerRoutes);
app.use('/api/student', studentRoutes);

// ─── Serve React Frontend ─────────────────────────────────────────────────────
const clientDistPath = path.join(__dirname, 'client', 'dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  // SPA Fallback for client routing
  app.get('*', (req, res) => {
    // Avoid intercepting API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // If frontend not yet built, serve clean notification landing page
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>The Aurora Protocol</title>
        <style>
          body { background: #0a0b0e; color: #fff; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          h1 { color: #ff1e42; font-size: 2.2rem; letter-spacing: 2px; }
          p { color: #94a3b8; font-size: 1.1rem; }
          .badge { border: 1px solid #ff1e42; padding: 6px 14px; border-radius: 4px; color: #ff1e42; }
        </style>
      </head>
      <body>
        <h1>THE AURORA PROTOCOL</h1>
        <p class="badge">SERVER OPERATIONAL // 0.0.0.0:${config.PORT}</p>
        <p>Frontend assets are building... Please run <code>npm run build</code> or check back momentarily.</p>
      </body>
      </html>
    `);
  });
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ─── Start Server & Database ──────────────────────────────────────────────────
const HOST = '0.0.0.0';
const PORT = config.PORT;

async function start() {
  try {
    console.log('[AURORA] Connecting to TiDB Cloud / MySQL...');
    await initDatabase();
    console.log('[AURORA] Database initialized successfully.');
  } catch (err) {
    console.warn('[AURORA] Database init warning (check .env credentials):', err.message);
  }

  server.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(`🚀 THE AURORA PROTOCOL SERVER STARTED`);
    console.log(`📡 Listening on: http://${HOST}:${PORT}`);
    console.log(`🔒 Head Admin ID: ${config.HEAD_ADMIN.username}`);
    console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=======================================================`);
  });
}

start();
