import React from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import StudentPortal from './pages/StudentPortal';
import AdminPortal from './pages/AdminPortal';
import { Shield, Users, ArrowRight } from 'lucide-react';

function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center'
      }}
    >
      <div style={{ maxWidth: '640px', width: '100%' }}>
        <img
          src="/assets/intellix-logo.png"
          alt="INTELLIX"
          style={{ height: '80px', objectFit: 'contain', marginBottom: '20px' }}
        />

        <h1 style={{ fontSize: '2.4rem', letterSpacing: '2px', marginBottom: '8px' }}>
          THE AURORA PROTOCOL
        </h1>

        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.9rem',
            color: '#ff1e42',
            letterSpacing: '2px',
            marginBottom: '32px'
          }}
        >
          COLLEGE INVESTIGATION EVENT // ACCESS CONTROL &amp; LEADERBOARD
        </p>

        <div className="grid-2" style={{ gap: '20px' }}>
          {/* Student Portal Card */}
          <Link
            to="/student"
            className="glass-panel"
            style={{
              padding: '28px',
              textDecoration: 'none',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              border: '1px solid var(--border-medium)',
              transition: 'all 0.25s ease'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid rgba(0, 240, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Users size={26} color="#00f0ff" />
            </div>
            <h3 style={{ fontSize: '1.25rem' }}>STUDENT PORTAL</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Access team dossier, view active room countdowns, and track the live leaderboard.
            </p>
            <span className="btn btn-secondary" style={{ marginTop: '8px', width: '100%' }}>
              ENTER AS STUDENT <ArrowRight size={14} />
            </span>
          </Link>

          {/* Admin Portal Card */}
          <Link
            to="/admin"
            className="glass-panel"
            style={{
              padding: '28px',
              textDecoration: 'none',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              border: '1px solid rgba(255, 30, 66, 0.3)',
              transition: 'all 0.25s ease'
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: 'rgba(255, 30, 66, 0.12)',
                border: '1px solid rgba(255, 30, 66, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Shield size={26} color="#ff1e42" />
            </div>
            <h3 style={{ fontSize: '1.25rem' }}>COMMAND &amp; SCANNER</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Head Administrator dashboard, Sub Admin door scanners, and event management.
            </p>
            <span className="btn btn-primary" style={{ marginTop: '8px', width: '100%' }}>
              ACCESS TERMINAL <ArrowRight size={14} />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/student" element={<StudentPortal />} />
      <Route path="/admin" element={<AdminPortal />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
