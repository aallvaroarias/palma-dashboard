import React from 'react';

export default function LoadingOverlay({ visible }) {
  return (
    <div
      className={`loading-overlay transition-opacity duration-500 ${visible ? '' : 'opacity-0 pointer-events-none'}`}
      style={{ display: visible ? 'flex' : 'none' }}
    >
      {/* Logo DISAN */}
      <div
        style={{
          width: 280,
          padding: '14px 22px',
          borderRadius: '14px',
          background: '#ffffff',
          boxShadow: '0 0 0 1px rgba(75,168,200,0.25), 0 0 44px rgba(75,168,200,0.18)',
          flexShrink: 0,
        }}
      >
        <img
          src="/logo-emblema.png"
          alt="DISAN"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      {/* Barra de carga */}
      <div
        className="w-48 rounded-full overflow-hidden mt-6"
        style={{ height: '2px', background: 'var(--navy-3)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: '40%',
            background: 'linear-gradient(90deg, var(--gold), var(--blue-l))',
            animation: 'loading-slide 1.4s ease-in-out infinite',
          }}
        />
      </div>

      <p
        className="text-palumar-muted tracking-widest uppercase mt-3"
        style={{ fontSize: '9px', letterSpacing: '2.5px' }}
      >
        Cargando datos...
      </p>
    </div>
  );
}
