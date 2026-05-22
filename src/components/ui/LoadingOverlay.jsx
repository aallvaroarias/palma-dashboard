import React from 'react';

export default function LoadingOverlay({ visible }) {
  return (
    <div
      className={`loading-overlay transition-opacity duration-500 ${visible ? '' : 'opacity-0 pointer-events-none'}`}
      style={{ display: visible ? 'flex' : 'none' }}
    >
      {/* PALMA sobre el logo */}
      <div
        className="font-display font-extrabold tracking-widest text-palumar-white mb-4"
        style={{ fontSize: '28px', letterSpacing: '8px' }}
      >
        PAL<span style={{ color: 'var(--blue-l)' }}>MA</span>
      </div>

      {/* Logo redondo — usa logo-emblema.png (solo el icono, sin texto) */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2.5px solid rgba(200,164,62,0.55)',
          boxShadow: '0 0 0 7px rgba(200,164,62,0.07), 0 0 44px rgba(200,164,62,0.18)',
          background: '#ffffff',
          flexShrink: 0,
        }}
      >
        <img
          src="/logo-emblema.png"
          alt="Palumar"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>

      {/* Nombre y lema */}
      <div className="flex flex-col items-center gap-1 mt-5">
        <div
          className="font-display font-extrabold tracking-widest text-palumar-white"
          style={{ fontSize: '17px', letterSpacing: '2px' }}
        >
          DISTRIBUCIONES PALUMAR S.A.
        </div>
        <div
          className="font-display font-semibold uppercase tracking-widest"
          style={{ fontSize: '10px', letterSpacing: '3.5px', color: 'var(--gold)' }}
        >
          Presencia que construye
        </div>
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
