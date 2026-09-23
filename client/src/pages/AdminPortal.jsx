import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
  ShieldAlert, ShieldCheck, QrCode, Users, Clock, Settings,
  AlertTriangle, RefreshCw, Plus, Trash2, LogOut, Camera, CheckCircle2,
  XCircle, Trophy, Volume2, UserPlus, FileText, Download, Play, Eye
} from 'lucide-react';
import QRScannerModal from '../components/QRScannerModal';
import Leaderboard from '../components/Leaderboard';
import { playAccessGranted, playAccessDenied, playTimesUp } from '../utils/audio';

export default function AdminPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('monitor'); // monitor, teams, volunteers, rounds, leaderboard

  // Monitor state
  const [monitorData, setMonitorData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [roundsData, setRoundsData] = useState({ rounds: [], rooms: [], settings: [] });

  // Volunteer scanner state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { status, message, team, duration_minutes, expiry_time, ... }
  const [scanCountdown, setScanCountdown] = useState(0);

  // Modals state
  const [qrModalTeam, setQrModalTeam] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showAddVolModal, setShowAddVolModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [scoreEditTeam, setScoreEditTeam] = useState(null);
  const [newScoreVal, setNewScoreVal] = useState('');
  const [scoreReason, setScoreReason] = useState('');

  // Forms
  const [newTeamId, setNewTeamId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newVolUsername, setNewVolUsername] = useState('');
  const [newVolPassword, setNewVolPassword] = useState('');
  const [newVolName, setNewVolName] = useState('');
  const [newVolRoom, setNewVolRoom] = useState('POLICE');

  // Login form
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // 1. Initial Session Check
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        if (data.user.role === 'SUB_ADMIN') {
          setActiveTab('scanner');
        }
      } else {
        setCurrentUser(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch Monitor, Teams, Volunteers, Rounds
  useEffect(() => {
    if (!currentUser) return;
    refreshAllData();
  }, [currentUser]);

  const refreshAllData = async () => {
    fetchMonitor();
    if (currentUser?.role === 'HEAD_ADMIN') {
      fetchTeams();
      fetchVolunteers();
      fetchRounds();
    } else if (currentUser?.role === 'SUB_ADMIN') {
      fetchRoomStatus();
    }
  };

  const fetchMonitor = async () => {
    try {
      const res = await fetch('/api/admin/monitor');
      if (res.ok) {
        const data = await res.json();
        setMonitorData(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/admin/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch (e) {}
  };

  const fetchVolunteers = async () => {
    try {
      const res = await fetch('/api/admin/volunteers');
      if (res.ok) {
        const data = await res.json();
        setVolunteers(data);
      }
    } catch (e) {}
  };

  const fetchRounds = async () => {
    try {
      const res = await fetch('/api/admin/rounds');
      if (res.ok) {
        const data = await res.json();
        setRoundsData(data);
      }
    } catch (e) {}
  };

  const fetchRoomStatus = async () => {
    try {
      const res = await fetch(`/api/volunteer/room-status?room_code=${currentUser.assigned_room}`);
      if (res.ok) {
        const data = await res.json();
        if (data.current_entry) {
          setScanResult({
            status: 'GRANTED',
            message: 'ACCESS GRANTED',
            team: {
              team_id: data.current_entry.team_code,
              team_name: data.current_entry.team_name
            },
            expiry_time: data.current_entry.expiry_time
          });
          setScanCountdown(data.current_entry.remaining_seconds);
        }
      }
    } catch (e) {}
  };

  // 3. Real-Time Socket Updates
  useEffect(() => {
    const socket = io();

    socket.on('leaderboard_update', (updatedTeams) => {
      setTeams(updatedTeams);
    });

    socket.on('room_entry_update', () => {
      fetchMonitor();
    });

    socket.on('team_status_update', () => {
      fetchTeams();
      fetchMonitor();
    });

    socket.on('round_update', () => {
      fetchRounds();
      fetchMonitor();
    });

    socket.on('event_reset', () => {
      refreshAllData();
      setScanResult(null);
    });

    return () => socket.disconnect();
  }, [currentUser]);

  // 4. Scanner Countdown Ticker
  useEffect(() => {
    if (!scanResult || scanResult.status !== 'GRANTED' || !scanResult.expiry_time) return;

    const timer = setInterval(() => {
      const left = Math.max(0, Math.floor((scanResult.expiry_time - Date.now()) / 1000));
      setScanCountdown(left);

      if (left === 0) {
        clearInterval(timer);
        playTimesUp();
        setScanResult(prev => ({
          ...prev,
          status: 'TIMES_UP',
          message: `TIME'S UP — ${prev.team?.team_name || 'TEAM'}`
        }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [scanResult]);

  // ─── HANDLERS ─────────────────────────────────────────────────────────────

  // Admin Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser.trim(), password: loginPass.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login failed.');
      } else {
        setCurrentUser(data.user);
        if (data.user.role === 'SUB_ADMIN') {
          setActiveTab('scanner');
        } else {
          setActiveTab('monitor');
        }
      }
    } catch (err) {
      setLoginError('Server connection error.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
  };

  // QR Scan Handling (Volunteer or Head Admin)
  const handleScanSuccess = async (qrData) => {
    setIsScannerOpen(false);
    const assignedRoom = currentUser.role === 'SUB_ADMIN' ? currentUser.assigned_room : 'POLICE';

    try {
      const res = await fetch('/api/volunteer/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_data: qrData, room_code: assignedRoom })
      });
      const data = await res.json();

      if (data.access_granted) {
        playAccessGranted();
        setScanResult({
          status: 'GRANTED',
          message: 'ACCESS GRANTED',
          team: data.team,
          expiry_time: data.expiry_time,
          duration_minutes: data.duration_minutes
        });
        setScanCountdown(data.remaining_seconds);
      } else {
        playAccessDenied();
        setScanResult({
          status: data.status,
          message: data.reason || 'ACCESS DENIED',
          team: data.team
        });
      }
    } catch (err) {
      playAccessDenied();
      setScanResult({
        status: 'DENIED',
        message: 'SCAN PROCESSING ERROR',
        team: null
      });
    }
  };

  // View QR Code for a team
  const viewTeamQR = async (team) => {
    setQrModalTeam(team);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}/qr`);
      const data = await res.json();
      setQrDataUrl(data.qr_code_data_url);
    } catch (e) {}
  };

  // Create Team
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: newTeamId, team_name: newTeamName })
      });
      if (res.ok) {
        setShowAddTeamModal(false);
        setNewTeamId('');
        setNewTeamName('');
        fetchTeams();
      }
    } catch (e) {}
  };

  // Update Score
  const handleUpdateScore = async (teamId, delta, explicitScore) => {
    try {
      const body = explicitScore !== undefined
        ? { score: parseInt(explicitScore, 10), reason: scoreReason }
        : { delta, reason: delta > 0 ? `+${delta} pts` : `${delta} pts` };

      const res = await fetch(`/api/admin/teams/${teamId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        fetchTeams();
        setScoreEditTeam(null);
        setScoreReason('');
      }
    } catch (e) {}
  };

  // Eliminate Team
  const handleEliminateTeam = async (team) => {
    if (!window.confirm(`Are you sure you want to ELIMINATE ${team.team_name} (${team.team_id})? They will be locked out of all rooms.`)) return;
    try {
      const res = await fetch(`/api/admin/teams/${team.id}/eliminate`, { method: 'POST' });
      if (res.ok) {
        fetchTeams();
        fetchMonitor();
      }
    } catch (e) {}
  };

  // Restore Team
  const handleRestoreTeam = async (team) => {
    try {
      const res = await fetch(`/api/admin/teams/${team.id}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchTeams();
        fetchMonitor();
      }
    } catch (e) {}
  };

  // Create Volunteer
  const handleCreateVolunteer = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newVolUsername,
          password: newVolPassword,
          name: newVolName,
          assigned_room: newVolRoom
        })
      });
      if (res.ok) {
        setShowAddVolModal(false);
        setNewVolUsername('');
        setNewVolPassword('');
        setNewVolName('');
        fetchVolunteers();
      }
    } catch (e) {}
  };

  // Set Active Round
  const handleSetActiveRound = async (roundId) => {
    try {
      const res = await fetch(`/api/admin/rounds/${roundId}/set-active`, { method: 'POST' });
      if (res.ok) {
        fetchRounds();
        fetchMonitor();
      }
    } catch (e) {}
  };

  // Update Room Duration
  const handleUpdateDuration = async (roundId, roomId, duration) => {
    try {
      await fetch('/api/admin/room-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_id: roundId, room_id: roomId, duration_minutes: duration })
      });
      fetchRounds();
    } catch (e) {}
  };

  // Reset Whole Event
  const handleResetEvent = async () => {
    if (resetConfirmInput !== 'RESET_THE_AURORA_PROTOCOL') {
      alert("Please type 'RESET_THE_AURORA_PROTOCOL' precisely to confirm reset.");
      return;
    }

    try {
      const res = await fetch('/api/admin/reset-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation_code: resetConfirmInput })
      });
      const data = await res.json();
      if (res.ok) {
        setShowResetModal(false);
        setResetConfirmInput('');
        alert('Event successfully reset!');
        refreshAllData();
      } else {
        alert(data.error || 'Failed to reset event.');
      }
    } catch (e) {
      alert('Error connecting to server.');
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // If not logged in, render Admin Login screen
  if (!currentUser && !loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <img src="/assets/intellix-logo.png" alt="INTELLIX" style={{ height: '70px', objectFit: 'contain', marginBottom: '14px' }} />
            <h1 style={{ fontSize: '1.4rem', letterSpacing: '2px', color: '#fff' }}>COMMAND TERMINAL</h1>
            <p style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: '#ff1e42', letterSpacing: '1px' }}>
              HEAD ADMIN & VOLUNTEER AUTHENTICATION
            </p>
          </div>

          {loginError && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '0.85rem' }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label">USERNAME</label>
              <input
                type="text"
                required
                placeholder="e.g. MASHOOD or POLICE01"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="input-group">
              <label className="input-label">PASSWORD</label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="input-field"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" style={{ marginTop: '10px' }}>
              SIGN IN TO PROTOCOL
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <a href="/student" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", textDecoration: 'none' }}>
              &larr; Switch to Student Portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isHeadAdmin = currentUser?.role === 'HEAD_ADMIN';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header className="header-bar">
        <div className="header-brand">
          <img src="/assets/intellix-logo.png" alt="INTELLIX" className="header-logo" />
          <div>
            <div className="brand-text-title">THE AURORA PROTOCOL</div>
            <div className="brand-text-sub">
              {isHeadAdmin ? 'HEAD COMMAND TERMINAL' : `ROOM VOLUNTEER // ${currentUser?.assigned_room}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            {currentUser?.name}
          </span>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '6px 12px', minHeight: '34px', fontSize: '0.8rem' }}>
            <LogOut size={14} /> LOGOUT
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div style={{ background: 'rgba(13, 15, 20, 0.95)', borderBottom: '1px solid var(--border-subtle)', padding: '0 16px' }}>
        <div className="container" style={{ padding: '8px 0', display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {isHeadAdmin && (
            <>
              <button
                onClick={() => setActiveTab('monitor')}
                className={`btn ${activeTab === 'monitor' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', minHeight: '36px', fontSize: '0.85rem' }}
              >
                <Clock size={16} /> ROOM MONITOR
              </button>
              <button
                onClick={() => setActiveTab('teams')}
                className={`btn ${activeTab === 'teams' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', minHeight: '36px', fontSize: '0.85rem' }}
              >
                <Users size={16} /> TEAMS &amp; MARKS
              </button>
              <button
                onClick={() => setActiveTab('volunteers')}
                className={`btn ${activeTab === 'volunteers' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', minHeight: '36px', fontSize: '0.85rem' }}
              >
                <UserPlus size={16} /> SUB ADMINS
              </button>
              <button
                onClick={() => setActiveTab('rounds')}
                className={`btn ${activeTab === 'rounds' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '8px 16px', minHeight: '36px', fontSize: '0.85rem' }}
              >
                <Settings size={16} /> ROUNDS &amp; LIMITS
              </button>
            </>
          )}

          <button
            onClick={() => setActiveTab('scanner')}
            className={`btn ${activeTab === 'scanner' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', minHeight: '36px', fontSize: '0.85rem' }}
          >
            <Camera size={16} /> QR SCANNER
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`btn ${activeTab === 'leaderboard' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', minHeight: '36px', fontSize: '0.85rem' }}
          >
            <Trophy size={16} /> LEADERBOARD
          </button>

          {isHeadAdmin && (
            <button
              onClick={() => setShowResetModal(true)}
              className="btn btn-danger"
              style={{ marginLeft: 'auto', padding: '8px 16px', minHeight: '36px', fontSize: '0.85rem' }}
            >
              <AlertTriangle size={16} /> RESET EVENT
            </button>
          )}
        </div>
      </div>

      <main className="container" style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* ─── TAB: ROOM MONITOR (Head Admin) ───────────────────────────────── */}
        {activeTab === 'monitor' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem' }}>DUAL ROOM RADAR MONITOR</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  CURRENT ACTIVE ROUND: <strong style={{ color: '#ff1e42' }}>ROUND {monitorData?.active_round?.round_number || 'NONE'}</strong>
                </p>
              </div>
              <button onClick={fetchMonitor} className="btn btn-secondary" style={{ padding: '6px 12px' }}>
                <RefreshCw size={14} /> REFRESH RADAR
              </button>
            </div>

            <div className="grid-2">
              {monitorData?.room_monitors?.map((room) => {
                const isOccupied = !!room.active_entry;
                return (
                  <div
                    key={room.room_id}
                    className="glass-panel"
                    style={{
                      padding: '24px',
                      border: isOccupied ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid var(--border-subtle)',
                      boxShadow: isOccupied ? '0 0 25px rgba(16, 185, 129, 0.15)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <span className="tag tag-room">{room.room_code} ROOM</span>
                      <span className={`tag ${isOccupied ? 'tag-active' : ''}`}>
                        {isOccupied ? 'OCCUPIED' : 'VACANT'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{room.room_name}</h3>
                    <p style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                      Configured Limit: {room.duration_minutes} Minutes | Completed Entries: {room.total_entries_in_round}
                    </p>

                    {isOccupied ? (
                      <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontFamily: "'JetBrains Mono', monospace" }}>
                          CURRENT TEAM INSIDE
                        </span>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
                          {room.active_entry.team_name}
                        </div>
                        <div style={{ fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                          ID: {room.active_entry.team_code} | Entry: {new Date(room.active_entry.entry_time).toLocaleTimeString()}
                        </div>

                        <div className="countdown-display countdown-normal" style={{ fontSize: '2.5rem', marginTop: '12px' }}>
                          {formatTime(room.active_entry.remaining_seconds)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: '30px', textAlign: 'center', color: 'var(--text-dim)', padding: '24px 0' }}>
                        <Clock size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>
                          ROOM CURRENTLY VACANT
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── TAB: QR SCANNER (Volunteer or Head Admin) ─────────────────────── */}
        {activeTab === 'scanner' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span className="tag tag-room" style={{ marginBottom: '8px' }}>
                  {currentUser?.assigned_room || 'POLICE'} STATION SCANNER
                </span>
                <h2 style={{ fontSize: '1.5rem', marginTop: '6px' }}>DOOR ACCESS SCANNER</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  VALIDATION RULE: TEAM + ROUND + ROOM (SINGLE ENTRY)
                </p>
              </div>

              {/* MASSIVE STATUS RESULT SCREEN */}
              {scanResult ? (
                <div style={{ marginBottom: '24px' }}>
                  {scanResult.status === 'GRANTED' && (
                    <div className="status-screen-banner status-screen-granted">
                      <CheckCircle2 size={54} color="#10b981" />
                      <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ffffff', letterSpacing: '1px' }}>
                        ACCESS GRANTED
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>
                        {scanResult.team?.team_name} ({scanResult.team?.team_id})
                      </div>

                      <div className="countdown-display countdown-normal" style={{ margin: '12px 0' }}>
                        {formatTime(scanCountdown)}
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        COUNTDOWN IN PROGRESS ({scanResult.duration_minutes} MIN)
                      </span>
                    </div>
                  )}

                  {scanResult.status === 'TIMES_UP' && (
                    <div className="status-screen-banner status-screen-timesup">
                      <AlertTriangle size={54} color="#ff1e42" />
                      <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ffffff', letterSpacing: '2px' }}>
                        {scanResult.message}
                      </div>
                      <p style={{ fontSize: '0.9rem', color: '#fca5a5' }}>
                        SESSION EXPIRED. PLEASE VACATE THE ROOM IMMEDIATELY.
                      </p>
                    </div>
                  )}

                  {(scanResult.status.startsWith('DENIED')) && (
                    <div className="status-screen-banner status-screen-denied">
                      <XCircle size={54} color="#ef4444" />
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff' }}>
                        {scanResult.message}
                      </div>
                      {scanResult.team && (
                        <div style={{ fontSize: '1rem', color: '#fca5a5' }}>
                          TEAM: {scanResult.team.team_name} ({scanResult.team.team_id})
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => { setScanResult(null); setIsScannerOpen(true); }}
                    className="btn btn-primary btn-block btn-lg"
                    style={{ marginTop: '20px' }}
                  >
                    SCAN NEXT TEAM
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <button
                    onClick={() => setIsScannerOpen(true)}
                    className="btn btn-primary btn-lg btn-block"
                    style={{ padding: '20px', fontSize: '1.2rem' }}
                  >
                    <Camera size={26} /> LAUNCH QR CAMERA
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB: TEAMS & MARKS (Head Admin) ───────────────────────────────── */}
        {activeTab === 'teams' && isHeadAdmin && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem' }}>TEAM ROSTER &amp; MARKS</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Total Teams: {teams.length} | Real-time score updates with audit trail
                </p>
              </div>
              <button onClick={() => setShowAddTeamModal(true)} className="btn btn-primary">
                <Plus size={16} /> ADD TEAM
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-medium)', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}>
                    <th style={{ padding: '12px' }}>TEAM ID</th>
                    <th style={{ padding: '12px' }}>TEAM NAME</th>
                    <th style={{ padding: '12px' }}>STATUS</th>
                    <th style={{ padding: '12px' }}>SCORE</th>
                    <th style={{ padding: '12px' }}>QUICK MARKS</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    const isEliminated = t.status === 'ELIMINATED';
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#00f0ff' }}>
                          {t.team_id}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{t.team_name}</td>
                        <td style={{ padding: '12px' }}>
                          {isEliminated ? (
                            <span className="tag tag-eliminated">ELIMINATED</span>
                          ) : (
                            <span className="tag tag-active">ACTIVE</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '1.2rem', fontWeight: 800 }}>
                          {t.score}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleUpdateScore(t.id, 10)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', minHeight: '28px', fontSize: '0.75rem', color: '#34d399' }}
                            >
                              +10
                            </button>
                            <button
                              onClick={() => handleUpdateScore(t.id, 50)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', minHeight: '28px', fontSize: '0.75rem', color: '#34d399' }}
                            >
                              +50
                            </button>
                            <button
                              onClick={() => handleUpdateScore(t.id, -10)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', minHeight: '28px', fontSize: '0.75rem', color: '#f87171' }}
                            >
                              -10
                            </button>
                            <button
                              onClick={() => { setScoreEditTeam(t); setNewScoreVal(t.score); }}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', minHeight: '28px', fontSize: '0.75rem' }}
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              onClick={() => viewTeamQR(t)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', minHeight: '30px', fontSize: '0.75rem' }}
                            >
                              <QrCode size={13} /> QR BADGE
                            </button>

                            {isEliminated ? (
                              <button
                                onClick={() => handleRestoreTeam(t)}
                                className="btn btn-success"
                                style={{ padding: '4px 10px', minHeight: '30px', fontSize: '0.75rem' }}
                              >
                                RESTORE
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEliminateTeam(t)}
                                className="btn btn-danger"
                                style={{ padding: '4px 10px', minHeight: '30px', fontSize: '0.75rem' }}
                              >
                                ELIMINATE
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TAB: SUB ADMINS (Head Admin) ──────────────────────────────────── */}
        {activeTab === 'volunteers' && isHeadAdmin && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem' }}>SUB ADMINS &amp; ROOM VOLUNTEERS</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Volunteers manage room door scanners for Police Investigation Room and Scientist Lab
                </p>
              </div>
              <button onClick={() => setShowAddVolModal(true)} className="btn btn-primary">
                <Plus size={16} /> CREATE SUB ADMIN
              </button>
            </div>

            <div className="grid-2">
              {volunteers.map((vol) => (
                <div key={vol.id} className="glass-panel" style={{ padding: '18px', background: 'rgba(255, 255, 255, 0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="tag tag-room">{vol.assigned_room} ROOM VOLUNTEER</span>
                    <span style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)' }}>
                      ID: #{vol.id}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.15rem' }}>{vol.name}</h3>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Username: <strong style={{ color: '#fff' }}>{vol.username}</strong>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB: ROUNDS & LIMITS (Head Admin) ─────────────────────────────── */}
        {activeTab === 'rounds' && isHeadAdmin && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.4rem' }}>ROUNDS &amp; ROOM TIME LIMITS</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Set active round and configure countdown minutes per room & round
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {roundsData.rounds.map((round) => {
                const isActive = round.status === 'ACTIVE';
                return (
                  <div
                    key={round.id}
                    className="glass-panel"
                    style={{
                      padding: '20px',
                      border: isActive ? '1px solid #ff1e42' : '1px solid var(--border-subtle)',
                      background: isActive ? 'rgba(255, 30, 66, 0.04)' : 'rgba(255, 255, 255, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ fontSize: '1.2rem' }}>ROUND {round.round_number}</h3>
                        <span className={`tag ${isActive ? 'tag-active' : ''}`}>{round.status}</span>
                      </div>
                      {!isActive && (
                        <button
                          onClick={() => handleSetActiveRound(round.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                        >
                          <Play size={12} /> SET AS ACTIVE ROUND
                        </button>
                      )}
                    </div>

                    <div className="grid-2">
                      {roundsData.rooms.map((room) => {
                        const setting = roundsData.settings.find(
                          (s) => s.round_id === round.id && s.room_id === room.id
                        );
                        const dur = setting ? setting.duration_minutes : 5;

                        return (
                          <div
                            key={room.id}
                            style={{
                              padding: '12px 16px',
                              borderRadius: 'var(--radius-md)',
                              background: 'rgba(0, 0, 0, 0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{room.room_name}</div>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Room Code: {room.room_code}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="number"
                                min="1"
                                max="120"
                                defaultValue={dur}
                                onBlur={(e) => handleUpdateDuration(round.id, room.id, e.target.value)}
                                style={{
                                  width: '65px',
                                  padding: '6px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: '#07080a',
                                  border: '1px solid var(--border-medium)',
                                  color: '#fff',
                                  fontFamily: "'JetBrains Mono', monospace",
                                  textAlign: 'center',
                                  fontSize: '0.9rem'
                                }}
                              />
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>mins</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── TAB: LIVE LEADERBOARD ─────────────────────────────────────────── */}
        {activeTab === 'leaderboard' && (
          <Leaderboard teams={teams} />
        )}
      </main>

      {/* ─── MODAL: QR CODE BADGE ────────────────────────────────────────────── */}
      {qrModalTeam && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center', padding: '24px', maxWidth: '380px' }}>
            <span className="tag tag-room" style={{ marginBottom: '8px' }}>OFFICIAL EVENT BADGE</span>
            <h3 style={{ fontSize: '1.3rem', marginTop: '6px' }}>{qrModalTeam.team_name}</h3>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: '#00f0ff', marginBottom: '16px' }}>
              TEAM ID: {qrModalTeam.team_id}
            </p>

            {qrDataUrl && (
              <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', display: 'inline-block', boxShadow: '0 0 20px rgba(255, 255, 255, 0.2)' }}>
                <img src={qrDataUrl} alt="QR Code" style={{ width: '220px', height: '220px', display: 'block' }} />
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <a
                href={qrDataUrl}
                download={`${qrModalTeam.team_id}_QR.png`}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                <Download size={14} /> DOWNLOAD
              </a>
              <button onClick={() => setQrModalTeam(null)} className="btn btn-secondary" style={{ flex: 1 }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD TEAM ─────────────────────────────────────────────────── */}
      {showAddTeamModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>REGISTER NEW INVESTIGATION TEAM</h3>
            <form onSubmit={handleCreateTeam}>
              <div className="input-group">
                <label className="input-label">TEAM ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AURORA006"
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value.toUpperCase())}
                  className="input-field"
                  style={{ textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <div className="input-group">
                <label className="input-label">TEAM NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TEAM CIPHER"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>CREATE TEAM</button>
                <button type="button" onClick={() => setShowAddTeamModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>CANCEL</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: EDIT SCORE ──────────────────────────────────────────────── */}
      {scoreEditTeam && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '6px' }}>UPDATE SCORE</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {scoreEditTeam.team_name} ({scoreEditTeam.team_id})
            </p>
            <form onSubmit={(e) => { e.preventDefault(); handleUpdateScore(scoreEditTeam.id, undefined, newScoreVal); }}>
              <div className="input-group">
                <label className="input-label">EXACT SCORE</label>
                <input
                  type="number"
                  required
                  value={newScoreVal}
                  onChange={(e) => setNewScoreVal(e.target.value)}
                  className="input-field"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.2rem' }}
                />
              </div>
              <div className="input-group">
                <label className="input-label">REASON / AUDIT NOTE</label>
                <input
                  type="text"
                  placeholder="e.g. Completed Forensic Clue Bonus"
                  value={scoreReason}
                  onChange={(e) => setScoreReason(e.target.value)}
                  className="input-field"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>SAVE SCORE</button>
                <button type="button" onClick={() => setScoreEditTeam(null)} className="btn btn-secondary" style={{ flex: 1 }}>CANCEL</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD VOLUNTEER ────────────────────────────────────────────── */}
      {showAddVolModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>CREATE SUB ADMIN / VOLUNTEER</h3>
            <form onSubmit={handleCreateVolunteer}>
              <div className="input-group">
                <label className="input-label">FULL NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Officer"
                  value={newVolName}
                  onChange={(e) => setNewVolName(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="input-group">
                <label className="input-label">USERNAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. POLICE02"
                  value={newVolUsername}
                  onChange={(e) => setNewVolUsername(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="input-group">
                <label className="input-label">PASSWORD</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={newVolPassword}
                  onChange={(e) => setNewVolPassword(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="input-group">
                <label className="input-label">ASSIGNED ROOM</label>
                <select
                  value={newVolRoom}
                  onChange={(e) => setNewVolRoom(e.target.value)}
                  className="input-field"
                  style={{ background: '#0a0d12' }}
                >
                  <option value="POLICE">Police Investigation Room (POLICE)</option>
                  <option value="LAB">Scientist Lab (LAB)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>CREATE</button>
                <button type="button" onClick={() => setShowAddVolModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>CANCEL</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: RESET WHOLE EVENT ────────────────────────────────────────── */}
      {showResetModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '24px', border: '1px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', marginBottom: '14px' }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: '1.3rem' }}>RESET WHOLE EVENT</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '14px' }}>
              This action will reset all team scores to 0, wipe all room entries, reset timers, and return the event to Round 1.
              <br /><br />
              <strong style={{ color: '#34d399' }}>Team and Admin user accounts will NOT be deleted.</strong>
            </p>
            <p style={{ fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace", color: '#f87171', marginBottom: '8px' }}>
              Type <strong>RESET_THE_AURORA_PROTOCOL</strong> below to authorize:
            </p>
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="RESET_THE_AURORA_PROTOCOL"
              className="input-field"
              style={{ width: '100%', fontFamily: "'JetBrains Mono', monospace", marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleResetEvent} className="btn btn-danger" style={{ flex: 1 }}>
                CONFIRM FULL RESET
              </button>
              <button onClick={() => { setShowResetModal(false); setResetConfirmInput(''); }} className="btn btn-secondary" style={{ flex: 1 }}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Camera Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
