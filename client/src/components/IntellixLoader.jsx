import React, { useEffect, useState } from 'react';

export default function IntellixLoader({ onComplete, duration = 2600 }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start fading out slightly before completion
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, duration - 400);

    const completeTimer = setTimeout(() => {
      if (onComplete) onComplete();
    }, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#07080a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        transition: 'opacity 0.4s ease-out',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'auto',
        overflow: 'hidden'
      }}
    >
      {/* Laser Scanning Line Animation */}
      <div className="laser-scanner-line" />

      {/* Pulsing Ambient Background Glow */}
      <div
        style={{
          position: 'absolute',
          width: '320px',
          height: '320px',
          background: 'radial-gradient(circle, rgba(255, 30, 66, 0.22) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(30px)',
          animation: 'pulseIn 2s infinite alternate ease-in-out'
        }}
      />

      {/* Main Logo Container */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          textAlign: 'center',
          padding: '0 20px'
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: '16px',
            borderRadius: '24px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 30, 66, 0.3)',
            boxShadow: '0 0 35px rgba(255, 30, 66, 0.25)'
          }}
        >
          <img
            src="/assets/intellix-logo.png"
            alt="INTELLIX LOGO"
            style={{
              height: '110px',
              maxWidth: '90vw',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 16px rgba(0, 240, 255, 0.4))'
            }}
          />
        </div>

        <div>
          <h2
            style={{
              fontSize: '2rem',
              letterSpacing: '6px',
              fontWeight: 900,
              color: '#ffffff',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.8)',
              marginBottom: '6px'
            }}
          >
            INTELLIX
          </h2>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 18px',
              borderRadius: '999px',
              border: '1px solid #ff1e42',
              backgroundColor: 'rgba(255, 30, 66, 0.12)',
              color: '#ff1e42',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              boxShadow: '0 0 18px rgba(255, 30, 66, 0.35)'
            }}
          >
            THE AURORA PROTOCOL
          </div>
        </div>

        {/* Loading Progress Bar */}
        <div
          style={{
            width: '200px',
            height: '3px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            marginTop: '16px',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#ff1e42',
              boxShadow: '0 0 10px #ff1e42',
              animation: 'loadProgress 2.2s ease-in-out forwards'
            }}
          />
        </div>

        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.72rem',
            color: '#94a3b8',
            letterSpacing: '2px'
          }}
        >
          INITIALIZING SECURE DOSSIER...
        </p>
      </div>

      <style>{`
        @keyframes loadProgress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(0%); }
        }
      `}</style>
    </div>
  );
}
