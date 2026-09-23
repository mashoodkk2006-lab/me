const { Server } = require('socket.io');
const { query } = require('./db');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', async (socket) => {
    // console.log(`[Socket] Client connected: ${socket.id}`);

    // Send initial leaderboard snapshot on connect
    try {
      const teams = await query(`
        SELECT id, team_id, team_name, score, status, current_round
        FROM teams
        ORDER BY score DESC, id ASC
      `);
      socket.emit('leaderboard_update', teams);
    } catch (e) {
      // Ignore initial query error if tables not ready yet
    }

    socket.on('disconnect', () => {
      // console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

// Broadcast updated leaderboard to all connected clients
async function broadcastLeaderboard() {
  if (!io) return;
  try {
    const teams = await query(`
      SELECT id, team_id, team_name, score, status, current_round
      FROM teams
      ORDER BY score DESC, id ASC
    `);
    io.emit('leaderboard_update', teams);
  } catch (err) {
    console.error('[Socket] Failed to broadcast leaderboard:', err.message);
  }
}

// Broadcast room entry event (to monitor rooms in real-time)
function broadcastRoomEntry(data) {
  if (!io) return;
  io.emit('room_entry_update', data);
}

// Broadcast team status change (e.g. elimination / restoration)
function broadcastTeamStatus(data) {
  if (!io) return;
  io.emit('team_status_update', data);
}

// Broadcast round status change
function broadcastRoundUpdate(data) {
  if (!io) return;
  io.emit('round_update', data);
}

// Broadcast event reset
function broadcastEventReset() {
  if (!io) return;
  io.emit('event_reset', { timestamp: Date.now() });
}

module.exports = {
  initSocket,
  getIO,
  broadcastLeaderboard,
  broadcastRoomEntry,
  broadcastTeamStatus,
  broadcastRoundUpdate,
  broadcastEventReset
};
