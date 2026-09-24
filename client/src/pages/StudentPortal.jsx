import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { ShieldCheck, ShieldAlert, Clock, LogOut, Lock, User, RefreshCw, QrCode, Download, Eye, X } from 'lucide-react';
import Leaderboard from '../components/Leaderboard';
import IntellixLoader from '../components/IntellixLoader';

export default function StudentPortal() {
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash once per session before login
    return !sessionStorage.getItem('aurora_student_splash_seen');
  });

  const [team, setTeam] = useState(null);
  const [activeRound, setActiveRound] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);

  // Login form state
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Live countdown remaining seconds
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // 1. Initial Authentication Check
  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/student/dashboard');
      if (res.ok) {
        const data = await res.json();
        setTeam(data.team);
        setActiveRound(data.active_round);
        setCurrentRoom(data.current_room);
        setLeaderboard(data.leaderboard || []);
        if (data.current_room) {
          setRemainingSeconds(data.current_room.remaining_seconds);
        }
      } else {
        setTeam(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 2. Real-Time Socket.IO Synchronization
  useEffect(() => {
    const socket = io();

    socket.on('leaderboard_update', (updatedTeams) => {
      setLeaderboard(updatedTeams);
      if (team) {
        const self = updatedTeams.find(t => t.id === team.id || t.team_id === team.team_id);
        if (self) {
          setTeam(prev => ({ ...prev, score: self.score, status: self.status, current_round: self.current_round }));
        }
      }
    });

    socket.on('team_status_update', (statusData) => {
      if (team && (team.id === statusData.team_id || team.team_id === statusData.team_id)) {
        setTeam(prev => ({ ...prev, status: statusData.status }));
        if (statusData.status === 'ELIMINATED') {
          setCurrentRoom(null);
        }
      }
    });

    socket.on('round_update', (roundData) => {
      setActiveRound(roundData);
    });

    socket.on('room_entry_update', (entryData) => {
      if (team && (team.id === entryData.team.id || team.team_id === entryData.team.team_id)) {
        setCurrentRoom({
          room_name: entryData.room.room_name,
          room_code: entryData.room.room_code,
          entry_time: entryData.entry_time,
          expiry_time: entryData.expiry_time,
          remaining_seconds: entryData.remaining_seconds
        });
        setRemainingSeconds(entryData.remaining_seconds);
      }
    });

    socket.on('event_reset', () => {
      fetchDashboard();
    });

    return () => {
      socket.disconnect();
    };
  }, [team]);

  // 3. Countdown Ticker
  useEffect(() => {
    if (!currentRoom || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, Math.floor((currentRoom.expiry_time - now) / 1000));
      setRemainingSeconds(left);

      if (left <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentRoom]);

  // Handle Student Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/auth/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: loginId.trim(), password: loginPass.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Login failed. Check your Team ID and Team Name.');
      } else {
        await fetchDashboard();
      }
    } catch (err) {
      setErrorMsg('Network error. Failed to reach protocol server.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setTeam(null);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // If splash active, show 2.5s Intellix animation
  if (showSplash) {
    return (
      <IntellixLoader
        onComplete={() => {
          sessionStorage.setItem('aurora_student_splash_seen', 'true');
          setShowSplash(false);
        }}
      />
    );
  }

  // If not logged in, show student login form
  if (!team && !loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
      >
        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <img
              src="/assets/intellix-logo.png"
              alt="INTELLIX"
              style={{ height: '70px', objectFit: 'contain', marginBottom: '14px' }}
            />
            <h1 style={{ fontSize: '1.4rem', letterSpacing: '2px', color: '#fff' }}>
              STUDENT DOSSIER
            </h1>
            <p style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: '#ff1e42', letterSpacing: '1px' }}>
              THE AURORA PROTOCOL // PORTAL
            </p>
          </div>

          {errorMsg && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                fontSize: '0.85rem'
              }}
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label">TEAM ID</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  placeholder="e.g. AURORA001"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value.toUpperCase())}
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '40px', fontFamily: "'JetBrains Mono', monospace" }}
                />
                <User size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">PASSWORD (TEAM NAME)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  placeholder="e.g. TEAM ALPHA"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '40px' }}
                />
                <Lock size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="btn btn-primary btn-block btn-lg"
              style={{ marginTop: '10px' }}
            >
              {loginLoading ? 'AUTHENTICATING...' : 'ACCESS STUDENT DOSSIER'}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <a
              href="/admin"
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                fontFamily: "'JetBrains Mono', monospace",
                textDecoration: 'none'
              }}
            >
              Head Admin / Volunteer Portal &rarr;
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isEliminated = team?.status === 'ELIMINATED';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header className="header-bar">
        <div className="header-brand">
          <img src="/assets/intellix-logo.png" alt="INTELLIX" className="header-logo" />
          <div>
            <div className="brand-text-title">THE AURORA PROTOCOL</div>
            <div className="brand-text-sub">STUDENT ACCESS TERMINAL</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{ padding: '6px 14px', minHeight: '34px', fontSize: '0.8rem' }}
        >
          <LogOut size={14} /> DISCONNECT
        </button>
      </header>

      <main className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* ELIMINATED BANNER */}
        {isEliminated && (
          <div
            className="status-screen-banner status-screen-denied"
            style={{
              padding: '24px',
              fontSize: '1.4rem',
              fontWeight: 900,
              letterSpacing: '2px',
              color: '#ffffff'
            }}
          >
            <ShieldAlert size={48} color="#ef4444" />
            <div style={{ textTransform: 'uppercase' }}>🚫 TEAM ELIMINATED</div>
            <p style={{ fontSize: '0.85rem', fontFamily: "'JetBrains Mono', monospace", color: '#fca5a5' }}>
              ACCESS REVOKED BY COMMAND. YOU CANNOT ENTER ROOMS FOR THE REMAINDER OF THE PROTOCOL.
            </p>
          </div>
        )}

        {/* TEAM DOSSIER SUMMARY CARD */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '16px',
              marginBottom: '20px'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '1.8rem', color: '#fff', letterSpacing: '1px' }}>
                  {team?.team_name}
                </h1>
                {isEliminated ? (
                  <span className="tag tag-eliminated">
                    <ShieldAlert size={12} /> ELIMINATED
                  </span>
                ) : (
                  <span className="tag tag-active">
                    <ShieldCheck size={12} /> ACTIVE STATUS
                  </span>
                )}
              </div>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.82rem',
                  color: 'var(--text-muted)',
                  marginTop: '4px'
                }}
              >
                IDENTIFIER: <strong style={{ color: '#00f0ff' }}>{team?.team_id}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  ROUND PROGRESS
                </span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ff1e42' }}>
                  ROUND {activeRound ? activeRound.round_number : team?.current_round}
                </div>
              </div>

              <div
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 30, 66, 0.1)',
                  border: '1px solid rgba(255, 30, 66, 0.3)',
                  textAlign: 'center'
                }}
              >
                <span style={{ fontSize: '0.7rem', color: '#ff1e42', textTransform: 'uppercase', fontWeight: 700 }}>
                  TOTAL SCORE
                </span>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>
                  {team?.score}
                </div>
              </div>
            </div>
          </div>

          {/* QR ACCESS BADGE SECTION */}
          <div
            style={{
              marginTop: '20px',
              padding: '20px',
              background: 'rgba(0, 240, 255, 0.03)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              {team?.qr_code_data_url ? (
                <div
                  style={{
                    background: '#ffffff',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: '0 0 25px rgba(0, 240, 255, 0.3)',
                    cursor: 'pointer',
                    display: 'inline-block',
                    textAlign: 'center'
                  }}
                  onClick={() => setShowQRModal(true)}
                  title="Click to Enlarge QR Badge"
                >
                  <img
                    src={team.qr_code_data_url}
                    alt={`${team.team_name} QR Code`}
                    style={{ width: '120px', height: '120px', display: 'block' }}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#000', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                    {team.team_id}
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    width: '120px',
                    height: '120px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed var(--border-subtle)'
                  }}
                >
                  <QrCode size={36} color="var(--text-dim)" />
                </div>
              )}

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <QrCode size={18} color="#00f0ff" />
                  <span style={{ fontSize: '0.8rem', color: '#00f0ff', fontWeight: 800, letterSpacing: '1.5px', fontFamily: "'JetBrains Mono', monospace" }}>
                    OFFICIAL ACCESS QR BADGE
                  </span>
                </div>
                <h3 style={{ fontSize: '1.1rem', color: '#ffffff', marginBottom: '6px' }}>
                  Door Entry &amp; Station Scanner Pass
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '400px', lineHeight: 1.5 }}>
                  Show this QR code to the volunteer scanner at the door of the <strong>Police Investigation Room</strong> or <strong>Scientist Lab</strong> to authenticate entry.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowQRModal(true)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.8rem' }}
              >
                <Eye size={14} /> ENLARGE BADGE
              </button>
              {team?.qr_code_data_url && (
                <a
                  href={team.qr_code_data_url}
                  download={`AURORA_QR_${team.team_id}.png`}
                  className="btn btn-primary"
                  style={{ padding: '8px 14px', fontSize: '0.8rem', textDecoration: 'none' }}
                >
                  <Download size={14} /> SAVE QR PASS
                </a>
              )}
            </div>
          </div>

          {/* ACTIVE ROOM COUNTDOWN SECTION */}
          {currentRoom && remainingSeconds > 0 ? (
            <div
              style={{
                marginTop: '20px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: 'var(--radius-md)',
                padding: '24px',
                textAlign: 'center',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)'
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.8rem',
                  color: '#10b981',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  marginBottom: '6px'
                }}
              >
                ACTIVE ROOM ENTRY // {currentRoom.room_name}
              </div>

              <div
                className={`countdown-display ${
                  remainingSeconds <= 30
                    ? 'countdown-critical'
                    : remainingSeconds <= 60
                    ? 'countdown-warning'
                    : 'countdown-normal'
                }`}
                style={{ margin: '14px 0' }}
              >
                {formatTime(remainingSeconds)}
              </div>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                INVESTIGATION WINDOW COUNTDOWN SYNCHRONIZED WITH COMMAND
              </span>
            </div>
          ) : (
            <div
              style={{
                marginTop: '20px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '18px',
                textAlign: 'center',
                color: 'var(--text-muted)'
              }}
            >
              <Clock size={20} style={{ margin: '0 auto 6px auto', display: 'block', opacity: 0.6 }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                STANDBY // NO ROOM CURRENTLY ACTIVE. PRESENT QR BADGE AT ASSIGNED STATION.
              </span>
            </div>
          )}
        </div>

        {/* LIVE LEADERBOARD COMPONENT */}
        <Leaderboard teams={leaderboard} currentTeamId={team?.id} />
      </main>

      {/* FULLSCREEN QR BADGE MODAL */}
      {showQRModal && team?.qr_code_data_url && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 9999
          }}
          onClick={() => setShowQRModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '380px',
              width: '100%',
              padding: '28px',
              textAlign: 'center',
              position: 'relative',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              boxShadow: '0 0 40px rgba(0, 240, 255, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQRModal(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            <span className="tag tag-room" style={{ marginBottom: '12px' }}>
              THE AURORA PROTOCOL PASS
            </span>

            <h2 style={{ fontSize: '1.4rem', color: '#fff', marginTop: '4px' }}>
              {team.team_name}
            </h2>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.9rem', color: '#00f0ff', marginBottom: '16px' }}>
              ID: {team.team_id}
            </p>

            <div
              style={{
                background: '#ffffff',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                display: 'inline-block',
                margin: '0 auto 16px auto',
                boxShadow: '0 0 25px rgba(255, 255, 255, 0.2)'
              }}
            >
              <img
                src={team.qr_code_data_url}
                alt={`${team.team_name} QR Code`}
                style={{ width: '220px', height: '220px', display: 'block' }}
              />
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: '20px' }}>
              SCAN TO GRANT ENTRY // PROTOCOL SECURITY
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <a
                href={team.qr_code_data_url}
                download={`AURORA_QR_${team.team_id}.png`}
                className="btn btn-primary"
                style={{ flex: 1, textDecoration: 'none', justifyContent: 'center' }}
              >
                <Download size={15} /> DOWNLOAD QR
              </a>
              <button
                onClick={() => setShowQRModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
