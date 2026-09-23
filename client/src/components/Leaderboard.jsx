import React, { useEffect, useState } from 'react';
import { Trophy, Award, Medal, ShieldAlert, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function Leaderboard({ teams = [], currentTeamId = null, enableCelebration = true }) {
  const [prevTopTeam, setPrevTopTeam] = useState(null);

  // Trigger light particle celebratory confetti if a team takes #1 spot
  useEffect(() => {
    if (teams.length > 0 && enableCelebration) {
      const top = teams[0];
      if (prevTopTeam && prevTopTeam.id !== top.id) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#ff1e42', '#00f0ff', '#ffffff']
        });
      }
      setPrevTopTeam(top);
    }
  }, [teams, enableCelebration, prevTopTeam]);

  const getRankBadge = (index) => {
    if (index === 0) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)',
            color: '#000',
            fontWeight: 800,
            fontSize: '0.85rem',
            boxShadow: '0 0 15px rgba(251, 191, 36, 0.6)'
          }}
        >
          <Trophy size={16} />
        </span>
      );
    }
    if (index === 1) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #e2e8f0 0%, #64748b 100%)',
            color: '#000',
            fontWeight: 800,
            fontSize: '0.85rem',
            boxShadow: '0 0 12px rgba(226, 232, 240, 0.5)'
          }}
        >
          <Award size={16} />
        </span>
      );
    }
    if (index === 2) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d97706 0%, #78350f 100%)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.85rem',
            boxShadow: '0 0 12px rgba(217, 119, 6, 0.4)'
          }}
        >
          <Medal size={16} />
        </span>
      );
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          color: '#94a3b8',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: '0.85rem',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {index + 1}
      </span>
    );
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          paddingBottom: '14px',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} color="#ff1e42" />
          <h2 style={{ fontSize: '1.25rem', letterSpacing: '1px' }}>LIVE LEADERBOARD</h2>
        </div>
        <div className="tag" style={{ background: 'rgba(255, 30, 66, 0.15)', color: '#ff1e42', border: '1px solid rgba(255, 30, 66, 0.4)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff1e42', display: 'inline-block', boxShadow: '0 0 6px #ff1e42' }}></span>
          REAL-TIME SYNC
        </div>
      </div>

      {teams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          No team records found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Header Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 110px',
              padding: '8px 16px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '1.5px',
              textTransform: 'uppercase'
            }}
          >
            <span>RANK</span>
            <span>TEAM</span>
            <span style={{ textAlign: 'right' }}>SCORE</span>
          </div>

          {/* Team Rows */}
          {teams.map((t, idx) => {
            const isCurrentTeam = currentTeamId && (t.team_id === currentTeamId || t.id === currentTeamId);
            const isEliminated = t.status === 'ELIMINATED';

            return (
              <div
                key={t.id || t.team_id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 110px',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: isCurrentTeam
                    ? 'rgba(0, 240, 255, 0.08)'
                    : idx === 0
                    ? 'rgba(251, 191, 36, 0.06)'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: isCurrentTeam
                    ? '1px solid #00f0ff'
                    : idx === 0
                    ? '1px solid rgba(251, 191, 36, 0.3)'
                    : '1px solid var(--border-subtle)',
                  boxShadow: isCurrentTeam ? '0 0 15px rgba(0, 240, 255, 0.2)' : 'none',
                  transition: 'all 0.35s ease',
                  opacity: isEliminated ? 0.6 : 1
                }}
              >
                <div>{getRankBadge(idx)}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        color: isEliminated ? '#ef4444' : '#ffffff',
                        textDecoration: isEliminated ? 'line-through' : 'none'
                      }}
                    >
                      {t.team_name}
                    </span>
                    {isCurrentTeam && (
                      <span className="tag" style={{ background: 'rgba(0, 240, 255, 0.15)', color: '#00f0ff', padding: '2px 6px', fontSize: '0.65rem' }}>
                        YOUR TEAM
                      </span>
                    )}
                    {isEliminated && (
                      <span className="tag tag-eliminated" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                        <ShieldAlert size={10} /> ELIMINATED
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    ID: {t.team_id}
                  </span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      color: idx === 0 ? '#fbbf24' : '#ffffff',
                      textShadow: idx === 0 ? '0 0 10px rgba(251, 191, 36, 0.4)' : 'none'
                    }}
                  >
                    {t.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
