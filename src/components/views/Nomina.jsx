import React, { useState } from 'react';

export default function Nomina() {
  const [cedula, setCedula]   = useState('');
  const [clave,  setClave]    = useState('');
  const [estado, setEstado]   = useState('idle'); // idle | loading | ok | error
  const [result, setResult]   = useState(null);
  const [errorMsg, setError]  = useState('');

  async function buscar(e) {
    e.preventDefault();
    setEstado('loading');
    setResult(null);
    setError('');

    try {
      const API = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API}/api/nomina`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cedula, clave }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEstado('error');
        setError(data.error || 'Error desconocido');
      } else {
        setEstado('ok');
        setResult(data);
      }
    } catch {
      setEstado('error');
      setError('No se pudo conectar. Intenta de nuevo.');
    }
  }

  return (
    <div className="animate-fade-in min-h-screen flex flex-col items-center justify-center px-4 py-10">

      {/* Logo + título */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div
          style={{
            width: 64, height: 64, borderRadius: '50%',
            overflow: 'hidden', border: '2px solid rgba(200,164,62,0.5)',
            background: '#fff',
          }}
        >
          <img src="/logo-emblema.png" alt="Palumar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div className="text-center">
          <div className="font-display font-extrabold text-palumar-white" style={{ fontSize: '20px', letterSpacing: '0.5px' }}>
            PALMA · Nómina
          </div>
          <div className="text-palumar-muted" style={{ fontSize: '12px' }}>
            Distribuciones Palumar S.A.
          </div>
        </div>
      </div>

      {/* Tarjeta */}
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: 'rgba(13,30,43,0.85)',
          border: '1px solid rgba(90,145,185,0.2)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h2 className="font-display font-bold text-palumar-white mb-1" style={{ fontSize: '16px' }}>
          Consulta tu desprendible
        </h2>
        <p className="text-palumar-muted mb-5" style={{ fontSize: '12px' }}>
          Ingresa tu cédula y la clave para descargar tu comprobante de pago.
        </p>

        <form onSubmit={buscar} className="flex flex-col gap-4">
          {/* Cédula */}
          <div>
            <label className="text-palumar-muted mb-1 block" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Cédula
            </label>
            <input
              type="text"
              placeholder="Ej: 4-123-4567"
              value={cedula}
              onChange={e => setCedula(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-palumar-white"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(90,145,185,0.3)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          {/* Clave */}
          <div>
            <label className="text-palumar-muted mb-1 block" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Clave
            </label>
            <input
              type="password"
              placeholder="Clave proporcionada por RRHH"
              value={clave}
              onChange={e => setClave(e.target.value)}
              required
              className="w-full rounded-lg px-4 py-2.5 text-palumar-white"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(90,145,185,0.3)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={estado === 'loading'}
            className="w-full rounded-lg py-3 font-semibold text-white transition-all"
            style={{
              background: estado === 'loading' ? 'rgba(26,127,166,0.5)' : 'var(--blue)',
              fontSize: '14px',
              opacity: estado === 'loading' ? 0.7 : 1,
            }}
          >
            {estado === 'loading' ? 'Buscando…' : 'Consultar mi desprendible'}
          </button>
        </form>

        {/* Error */}
        {estado === 'error' && (
          <div
            className="mt-4 rounded-lg px-4 py-3 text-center"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>
              {errorMsg === 'Cédula no encontrada en la nómina'
                ? 'Cédula no encontrada. Verifica que sea correcta.'
                : errorMsg === 'Clave incorrecta'
                ? 'Clave incorrecta. Consulta con RRHH.'
                : errorMsg}
            </p>
          </div>
        )}

        {/* Éxito */}
        {estado === 'ok' && result && (
          <div
            className="mt-4 rounded-xl px-4 py-4 flex flex-col items-center gap-3"
            style={{ background: 'rgba(15,169,122,0.1)', border: '1px solid rgba(15,169,122,0.3)' }}
          >
            <div style={{ fontSize: '28px' }}>✅</div>
            <div className="text-center">
              <p className="font-bold text-palumar-white" style={{ fontSize: '13px' }}>
                {result.nombre}
              </p>
              <p className="text-palumar-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                Desprendible encontrado
              </p>
            </div>
            <a
              href={result.url}
              download
              className="w-full text-center rounded-lg py-2.5 font-semibold transition-all"
              style={{
                background: 'var(--green)',
                color: '#fff',
                fontSize: '13px',
                textDecoration: 'none',
              }}
            >
              ⬇ Descargar mi desprendible
            </a>
          </div>
        )}
      </div>

      <p className="text-palumar-muted mt-6 text-center" style={{ fontSize: '10px', maxWidth: '280px' }}>
        Este portal es exclusivo para empleados de Distribuciones Palumar S.A.
        Si tienes problemas, contacta a RRHH.
      </p>
    </div>
  );
}
