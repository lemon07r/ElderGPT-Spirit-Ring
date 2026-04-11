import React from 'react';

export function LoadingAnimation() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px' }}>
      <style>{`
        @keyframes eldergpt-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes eldergpt-glow { 0%, 100% { box-shadow: 0 0 4px rgba(197,160,89,0.3); } 50% { box-shadow: 0 0 14px rgba(197,160,89,0.6); } }
        @keyframes eldergpt-float { 0%, 100% { transform: translateY(0); opacity: 0.7; } 50% { transform: translateY(-3px); opacity: 1; } }
        @keyframes eldergpt-dots { 0% { opacity: 0.2; } 50% { opacity: 1; } 100% { opacity: 0.2; } }
      `}</style>
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: '2px solid rgba(197, 160, 89, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'eldergpt-glow 2s ease-in-out infinite',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: '16px',
          animation: 'eldergpt-spin 4s linear infinite',
          display: 'inline-block',
          color: '#C5A059',
        }}>☯</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', flexWrap: 'wrap' }}>
        {['Contemplating', 'the', 'Dao'].map((word, i) => (
          <span key={word} style={{
            color: '#C5A059',
            fontStyle: 'italic',
            fontSize: '13px',
            animation: `eldergpt-float 2s ease-in-out ${i * 0.3}s infinite`,
            display: 'inline-block',
          }}>{word}</span>
        ))}
        <span style={{ display: 'inline-flex', gap: '2px', marginLeft: '2px' }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              backgroundColor: '#C5A059',
              display: 'inline-block',
              animation: `eldergpt-dots 1.5s ease-in-out ${i * 0.3}s infinite`,
            }} />
          ))}
        </span>
      </div>
    </div>
  );
}
