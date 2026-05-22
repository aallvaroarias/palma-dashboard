import React from 'react';

export default function LoadingOverlay({ visible }) {
  return (
    <div
      className={`loading-overlay transition-opacity duration-500 ${visible ? '' : 'opacity-0 pointer-events-none'}`}
      style={{ display: visible ? 'flex' : 'none' }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-2">
        <img
          src="/logo-palumar.png"
          alt="Palumar"
          className="w-16 h-16 object-contain"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="font-display font-extrabold text-3xl tracking-widest text-palumar-white">
          PAL<span style={{ color: 'var(--blue-l)' }}>MA</span>
        </div>
        <div className="text-xs text-palumar-muted tracking-wider">
          Distribuciones Palumar S.A.
        </div>
      </div>

      {/* Loading bar */}
      <div
        className="w-48 h-0.5 rounded-full overflow-hidden"
        style={{ background: 'var(--navy-3)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: '40%',
            background: 'linear-gradient(90deg, var(--blue), var(--cyan))',
            animation: 'loading-slide 1.2s ease-in-out infinite',
          }}
        />
      </div>

      <p className="text-xs text-palumar-muted">Cargando datos...</p>
    </div>
  );
}
