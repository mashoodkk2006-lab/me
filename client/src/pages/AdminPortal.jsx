import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  ShieldAlert, ShieldCheck, QrCode, Users, Clock, Settings,
  AlertTriangle, RefreshCw, Plus, Trash2, LogOut, Camera, CheckCircle2,
  XCircle, Trophy, Volume2, UserPlus, FileText, Download, Play, Eye,
  Bell, X, UserCheck, AlertOctagon, ArrowRight
} from 'lucide-react';
import QRScannerModal from '../components/QRScannerModal';
import Leaderboard from '../components/Leaderboard';
import { playAccessGranted, playAccessDenied, playTimesUp } from '../utils/audio';

export default function AdminPortal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('monitor'); // monitor, teams, volunteers, rounds, leaderboard, scanner

  // Monitor state
  const [monitorData, setMonitorData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [roundsData, setRoundsData] = useState({ rounds: [], rooms: [], settings: [] });

  // Volunteer scanner state & Multi-Team entries inside room
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null); // toast / scan feedback
  const [activeRoomEntries, setActiveRoomEntries] = useState([]); // Array of all teams in this room
  const [timesUpAlert, setTimesUpAlert] = useState(null); // { team_name, team_code, entry_id, room_name }
  const alertedEntriesRef = useRef(new Set());

  // Modals state
  const [qrModalTeam, setQrModalTeam] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showAddVolModal, setShowAddVolModal] = useState(false);
  const [showAddRoundModal, setShowAddRoundModal] = useState(false);
  const [showSetTotalRoundsModal, setShowSetTotalRoundsModal] = useState(false);
  const [newRoundNumber, setNewRoundNumber] = useState('');
  const [newRoundDurations, setNewRoundDurations] = useState({});
  const [totalRoundsInput, setTotalRoundsInput] = useState('');
  const [roundActionError, setRoundActionError] = useState('');
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
      const roomCode = currentUser?.assigned_room || 'POLICE';
      const res = await fetch(`/api/volunteer/room-status?room_code=${roomCode}`);
      if (res.ok) {
        const data = await res.json();
        const now = Date.now();
        const entries = (data.active_entries || []).map(e => ({
          ...e,
          remaining_seconds: Math.max(0, Math.floor((e.expiry_time - now) / 1000)),
          is_expired: now >= e.expiry_time
        }));
        setActiveRoomEntries(entries);
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
      fetchRoomStatus();
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
      setActiveRoomEntries([]);
      alertedEntriesRef.current.clear();
      setTimesUpAlert(null);
    });

    return () => socket.disconnect();
  }, [currentUser]);

  // 4. Multi-Team Scanner Countdown Ticker & Time's Up Alert Detector
  useEffect(() => {
    if (activeRoomEntries.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      let alertItem = null;

      setActiveRoomEntries(prevEntries => {
        return prevEntries.map(entry => {
          const remaining = Math.max(0, Math.floor((entry.expiry_time - now) / 1000));
          const isExpired = remaining <= 0;

          // If entry just hit 0 and hasn't alerted yet
          if (isExpired && !alertedEntriesRef.current.has(entry.id)) {
            alertedEntriesRef.current.add(entry.id);
            alertItem = {
              team_name: entry.team_name,
              team_code: entry.team_code,
              entry_id: entry.id,
              room_name: currentUser?.assigned_room ? `${currentUser.assigned_room} ROOM` : 'ROOM'
            };
          }

          return {
            ...entry,
            remaining_seconds: remaining,
            is_expired: isExpired
          };
        });
      });

      if (alertItem) {
        playTimesUp();
        setTimesUpAlert(alertItem);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeRoomEntries.length, currentUser]);

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

  // Dismiss / Vacate Room Entry
  const handleDismissEntry = async (entryId) => {
    try {
      const res = await fetch(`/api/volunteer/entries/${entryId}/dismiss`, { method: 'POST' });
      if (res.ok) {
        fetchRoomStatus();
        fetchMonitor();
        if (timesUpAlert && timesUpAlert.entry_id === entryId) {
          setTimesUpAlert(null);
        }
      }
    } catch (e) {}
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
          message: `ACCESS GRANTED // ${data.team?.team_name} (${data.team?.team_id})`,
          team: data.team,
          expiry_time: data.expiry_time,
          duration_minutes: data.duration_minutes
        });
        fetchRoomStatus();
        fetchMonitor();
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

  // Delete Team Permanently
  const handleDeleteTeam = async (team) => {
    if (!window.confirm(`⚠️ PERMANENT ACTION:\nAre you sure you want to completely DELETE team "${team.team_name}" (${team.team_id})?\n\nThis will permanently delete all their room logs, scores, and access records.`)) return;
    try {
      const res = await fetch(`/api/admin/teams/${team.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTeams();
        fetchMonitor();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete team.');
      }
    } catch (e) {
      alert('Network error while deleting team.');
    }
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

  // Open Add Round Modal
  const openAddRoundModal = () => {
    const maxNum = roundsData.rounds.length > 0
      ? Math.max(...roundsData.rounds.map(r => r.round_number))
      : 0;
    setNewRoundNumber(maxNum + 1);
    const initialDurations = {};
    roundsData.rooms.forEach(r => {
      initialDurations[r.id] = 5;
    });
    setNewRoundDurations(initialDurations);
    setRoundActionError('');
    setShowAddRoundModal(true);
  };

  // Create New Round
  const handleCreateRound = async (e) => {
    e.preventDefault();
    setRoundActionError('');
    try {
      const res = await fetch('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_number: parseInt(newRoundNumber, 10),
          durations: newRoundDurations
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setRoundActionError(data.error || 'Failed to create round.');
      } else {
        setShowAddRoundModal(false);
        fetchRounds();
        fetchMonitor();
      }
    } catch (err) {
      setRoundActionError('Server connection error.');
    }
  };

  // Configure Total Rounds in Bulk
  const handleSetTotalRounds = async (e) => {
    e.preventDefault();
    setRoundActionError('');
    try {
      const res = await fetch('/api/admin/rounds/set-total', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_rounds: parseInt(totalRoundsInput, 10) })
      });
      const data = await res.json();
      if (!res.ok) {
        setRoundActionError(data.error || 'Failed to configure total rounds.');
      } else {
        setShowSetTotalRoundsModal(false);
        setTotalRoundsInput('');
        fetchRounds();
        fetchMonitor();
      }
    } catch (err) {
      setRoundActionError('Server connection error.');
    }
  };

  // Delete Round
  const handleDeleteRound = async (round) => {
    if (!window.confirm(`⚠️ Are you sure you want to delete ROUND ${round.round_number}? All room configurations for this round will be removed.`)) return;
    try {
      const res = await fetch(`/api/admin/rounds/${round.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRounds();
        fetchMonitor();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete round.');
      }
    } catch (e) {
      alert('Error connecting to server.');
    }
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

        {/* ─── TAB: QR SCANNER / ROOM ACCESS STATION (Volunteer or Head Admin) ─── */}
        {activeTab === 'scanner' && (
          <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Scanner Control Bar */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="tag tag-room">{currentUser?.assigned_room || 'POLICE'} STATION SCANNER</span>
                    <span className="tag tag-active">{activeRoomEntries.length} TEAMS INSIDE</span>
                  </div>
                  <h2 style={{ fontSize: '1.5rem', color: '#fff' }}>DOOR ACCESS &amp; ROOM MANAGEMENT</h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    Scan QR codes to admit teams. Multiple teams can be inside simultaneously with independent timers.
                  </p>
                </div>

                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="btn btn-primary"
                  style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 800, letterSpacing: '1px' }}
                >
                  <Camera size={20} /> 📷 SCAN NEW TEAM ENTRY
                </button>
              </div>

              {/* RECENT SCAN NOTIFICATION TOAST */}
              {scanResult && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: 'var(--radius-md)',
                    marginTop: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    background: scanResult.status === 'GRANTED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: scanResult.status === 'GRANTED' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                    color: scanResult.status === 'GRANTED' ? '#34d399' : '#f87171'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {scanResult.status === 'GRANTED' ? <CheckCircle2 size={24} color="#10b981" /> : <XCircle size={24} color="#ef4444" />}
                    <div>
                      <strong style={{ fontSize: '0.95rem', display: 'block' }}>{scanResult.message}</strong>
                      {scanResult.team && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                          Team: {scanResult.team.team_name} ({scanResult.team.team_id})
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    >
                      SCAN NEXT
                    </button>
                    <button
                      onClick={() => setScanResult(null)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* LIVE ACTIVE TEAMS INSIDE THIS ROOM */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="#00f0ff" /> CURRENTLY OCCUPYING TEAMS ({activeRoomEntries.length})
                </h3>
                <button
                  onClick={fetchRoomStatus}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  <RefreshCw size={13} /> REFRESH
                </button>
              </div>

              {activeRoomEntries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <Clock size={40} style={{ margin: '0 auto 10px auto', opacity: 0.3 }} />
                  <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', fontWeight: 600 }}>ROOM CURRENTLY VACANT</div>
                  <p style={{ fontSize: '0.8rem', fontFamily: "'JetBrains Mono', monospace", marginTop: '4px' }}>
                    No teams are inside right now. Click "SCAN NEW TEAM ENTRY" to admit teams.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {activeRoomEntries.map((entry) => {
                    const isTimeUp = entry.remaining_seconds <= 0 || entry.is_expired;
                    const isCritical = entry.remaining_seconds <= 30 && !isTimeUp;
                    const isWarning = entry.remaining_seconds <= 60 && !isCritical && !isTimeUp;

                    return (
                      <div
                        key={entry.id}
                        className="glass-panel"
                        style={{
                          padding: '20px',
                          border: isTimeUp
                            ? '2px solid #ff1e42'
                            : isCritical
                            ? '1px solid #ef4444'
                            : isWarning
                            ? '1px solid #f59e0b'
                            : '1px solid rgba(16, 185, 129, 0.4)',
                          background: isTimeUp
                            ? 'rgba(255, 30, 66, 0.12)'
                            : isCritical
                            ? 'rgba(239, 68, 68, 0.08)'
                            : 'rgba(0, 0, 0, 0.3)',
                          boxShadow: isTimeUp ? '0 0 25px rgba(255, 30, 66, 0.3)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span className="tag" style={{ background: 'rgba(0, 240, 255, 0.1)', color: '#00f0ff', borderColor: 'rgba(0, 240, 255, 0.3)' }}>
                              {entry.team_code}
                            </span>
                            {isTimeUp ? (
                              <span className="tag tag-eliminated" style={{ animation: 'pulse 1s infinite' }}>
                                🚨 TIME'S UP!
                              </span>
                            ) : (
                              <span className="tag tag-active">ACTIVE IN ROOM</span>
                            )}
                          </div>

                          <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                            {entry.team_name}
                          </h4>
                          <p style={{ fontSize: '0.72rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                            Entry: {new Date(entry.entry_time).toLocaleTimeString()}
                          </p>

                          <div
                            className={`countdown-display ${
                              isTimeUp || isCritical ? 'countdown-critical' : isWarning ? 'countdown-warning' : 'countdown-normal'
                            }`}
                            style={{ fontSize: '2.5rem', margin: '14px 0', textAlign: 'center' }}
                          >
                            {isTimeUp ? '00:00' : formatTime(entry.remaining_seconds)}
                          </div>
                        </div>

                        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleDismissEntry(entry.id)}
                            className={`btn ${isTimeUp ? 'btn-danger' : 'btn-secondary'}`}
                            style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                          >
                            {isTimeUp ? 'VACATE & COMPLETE' : 'END SESSION EARLY'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
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

                            {isHeadAdmin && (
                              <button
                                onClick={() => handleDeleteTeam(t)}
                                className="btn"
                                title="Permanently Delete Team"
                                style={{
                                  padding: '4px 8px',
                                  minHeight: '30px',
                                  fontSize: '0.75rem',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  color: '#f87171'
                                }}
                              >
                                <Trash2 size={14} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '22px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '1.4rem' }}>ROUNDS &amp; ROOM TIME LIMITS</h2>
                  <span className="tag tag-room" style={{ fontSize: '0.78rem' }}>
                    {roundsData.rounds.length} ROUNDS CONFIGURED
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Add rounds, set total rounds for the event, activate rounds, and configure room countdown timers.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setShowSetTotalRoundsModal(true); setRoundActionError(''); }}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                >
                  <Settings size={14} /> CONFIGURE TOTAL ROUNDS
                </button>
                <button
                  onClick={openAddRoundModal}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  <Plus size={16} /> ADD ROUND
                </button>
              </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ fontSize: '1.2rem' }}>ROUND {round.round_number}</h3>
                        <span className={`tag ${isActive ? 'tag-active' : ''}`}>{round.status}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {!isActive && (
                          <button
                            onClick={() => handleSetActiveRound(round.id)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            <Play size={12} /> SET AS ACTIVE ROUND
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteRound(round)}
                          className="btn btn-danger"
                          style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                          title={`Delete Round ${round.round_number}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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

      {/* ─── MODAL: ADD ROUND ────────────────────────────────────────────────── */}
      {showAddRoundModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>ADD TOURNAMENT ROUND</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Create a new round and define default countdown timers per room.
            </p>

            {roundActionError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '0.85rem' }}>
                {roundActionError}
              </div>
            )}

            <form onSubmit={handleCreateRound}>
              <div className="input-group">
                <label className="input-label">ROUND NUMBER</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="99"
                  value={newRoundNumber}
                  onChange={(e) => setNewRoundNumber(e.target.value)}
                  className="input-field"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.1rem' }}
                />
              </div>

              <div style={{ marginTop: '16px', marginBottom: '10px' }}>
                <label className="input-label">ROOM TIME LIMITS (MINUTES)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                  {roundsData.rooms.map((rm) => (
                    <div
                      key={rm.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{rm.room_name} ({rm.room_code})</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={newRoundDurations[rm.id] || 5}
                          onChange={(e) => setNewRoundDurations({ ...newRoundDurations, [rm.id]: e.target.value })}
                          className="input-field"
                          style={{ width: '70px', padding: '6px', textAlign: 'center', fontSize: '0.9rem', fontFamily: "'JetBrains Mono', monospace" }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>mins</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>CREATE ROUND</button>
                <button type="button" onClick={() => setShowAddRoundModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>CANCEL</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: CONFIGURE TOTAL ROUNDS ──────────────────────────────────── */}
      {showSetTotalRoundsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>CONFIGURE TOTAL ROUNDS</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Specify the total number of rounds for the tournament (e.g. 4, 5, 8). Missing rounds will be created automatically.
            </p>

            {roundActionError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '0.85rem' }}>
                {roundActionError}
              </div>
            )}

            <form onSubmit={handleSetTotalRounds}>
              <div className="input-group">
                <label className="input-label">TOTAL NUMBER OF ROUNDS</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="30"
                  placeholder="e.g. 5"
                  value={totalRoundsInput}
                  onChange={(e) => setTotalRoundsInput(e.target.value)}
                  className="input-field"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '1.2rem', textAlign: 'center' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>SET TOTAL ROUNDS</button>
                <button type="button" onClick={() => setShowSetTotalRoundsModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>CANCEL</button>
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

      {/* ─── MODAL: TIME'S UP CRITICAL POP-UP ALERT ──────────────────────────── */}
      {timesUpAlert && (
        <div className="modal-overlay" style={{ background: 'rgba(0, 0, 0, 0.9)', zIndex: 99999 }}>
          <div
            className="modal-content"
            style={{
              padding: '32px',
              border: '2px solid #ff1e42',
              boxShadow: '0 0 50px rgba(255, 30, 66, 0.4)',
              textAlign: 'center',
              maxWidth: '460px',
              background: '#0d070a'
            }}
          >
            <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(255, 30, 66, 0.15)', border: '2px solid #ff1e42', marginBottom: '16px', animation: 'pulse 1s infinite' }}>
              <AlertTriangle size={50} color="#ff1e42" />
            </div>

            <div style={{ color: '#ff1e42', fontWeight: 900, fontSize: '1.8rem', letterSpacing: '2px', marginBottom: '6px' }}>
              🚨 TIME'S UP!
            </div>
            <div style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
              {timesUpAlert.team_name}
            </div>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", color: '#00f0ff', fontSize: '0.9rem', marginBottom: '16px' }}>
              TEAM ID: {timesUpAlert.team_code} // {timesUpAlert.room_name}
            </p>

            <div style={{ background: 'rgba(255, 30, 66, 0.1)', border: '1px solid rgba(255, 30, 66, 0.3)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '24px', textAlign: 'left' }}>
              <p style={{ color: '#fca5a5', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                ⚠️ The allotted investigation window for this team has <strong>completely expired</strong>. Please instruct the team to vacate the room immediately.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => handleDismissEntry(timesUpAlert.entry_id)}
                className="btn btn-danger btn-lg btn-block"
                style={{ padding: '14px', fontSize: '1rem', fontWeight: 800 }}
              >
                VACATE ROOM &amp; COMPLETE ENTRY
              </button>
              <button
                onClick={() => setTimesUpAlert(null)}
                className="btn btn-secondary btn-block"
                style={{ padding: '10px', fontSize: '0.85rem' }}
              >
                DISMISS ALERT (KEEP TIMER VISIBLE)
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
