import React, { useState, useEffect, useMemo } from 'react';
import SectionTitle from '../ui/SectionTitle';

const TABS = [
  { key: 'centrales', label: 'Secos · Centrales' },
  { key: 'chiriqui',  label: 'Secos · Chiriquí'  },
  { key: 'frio',      label: '❄ Frío (ambos CEDI)' },
];

function badge(inv) {
  if (inv === null || inv === undefined) return { label: '—', color: 'var(--muted)' };
  if (inv <= 0)  return { label: 'Agotado', color: 'var(--red)'   };
  if (inv <= 10) return { label: 'Crítico', color: 'var(--red)'   };
  if (inv <= 30) return { label: 'Bajo',    color: 'var(--amber)'  };
  return           { label: 'OK',          color: 'var(--green)'  };
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('en', { maximumFractionDigits: 1 });
}

export default function Inventario() {
  const [tab,    setTab]    = useState('centrales');
  const [query,  setQuery]  = useState('');
  const [data,   setData]   = useState(null);
  const [loading,setLoading]= useState(true);
  const [error,  setError]  = useState('');

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || '';
    fetch(`${API}/api/inventario`)
      .then(r => r.json())
      .then(r => { if (r.ok) setData(r.data); else setError('Error cargando inventario'); })
      .catch(() => setError('No se pudo conectar'))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const src = data[tab] || [];
    if (!q) return src;
    return src.filter(p =>
      String(p.codigo).toLowerCase().includes(q) ||
      String(p.nombre).toLowerCase().includes(q) ||
      (p.linea && String(p.linea).toLowerCase().includes(q)) ||
      (p.proveedor && String(p.proveedor).toLowerCase().includes(q))
    );
  }, [data, tab, query]);

  const fecha = data?.fecha || '';

  return (
    <div className="animate-fade-in">
      <SectionTitle>Inventario</SectionTitle>

      {/* Header info */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {fecha && (
          <span className="font-mono-num text-palumar-muted rounded-md px-2.5 py-1 border"
            style={{ fontSize: '11px', background: 'var(--navy-3)', borderColor: 'var(--border-2)' }}>
            Corte: {fecha}
          </span>
        )}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: '🟢 OK', desc: '> 30 uds' },
            { label: '🟡 Bajo', desc: '11–30 uds' },
            { label: '🔴 Crítico/Agotado', desc: '≤ 10 uds' },
          ].map(b => (
            <span key={b.label} className="text-palumar-muted" style={{ fontSize: '10px' }}>
              {b.label} <span style={{ opacity: 0.6 }}>{b.desc}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setQuery(''); }}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={tab === t.key ? {
              background: 'linear-gradient(135deg,rgba(26,127,166,0.22),rgba(45,200,216,0.1))',
              border: '1px solid rgba(45,200,216,0.25)',
              color: 'var(--white)',
              boxShadow: 'inset 0 1px 0 rgba(45,200,216,0.2)',
            } : {
              border: '1px solid transparent',
              color: 'var(--muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="mb-4 relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por nombre, código o proveedor…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-xl pl-9 pr-4 py-2.5 text-palumar-white"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-2)',
            fontSize: '13px',
            outline: 'none',
            maxWidth: '480px',
          }}
        />
        {query && (
          <button onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-palumar-muted hover:text-white"
            style={{ fontSize: '16px', lineHeight: 1, maxWidth: '480px' }}>
            ×
          </button>
        )}
      </div>

      {/* Estado */}
      {loading && (
        <div className="chart-card flex items-center justify-center py-16">
          <p className="text-palumar-muted text-sm">Cargando inventario…</p>
        </div>
      )}
      {error && (
        <div className="chart-card flex items-center justify-center py-10">
          <p style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</p>
        </div>
      )}

      {/* Resultado búsqueda */}
      {!loading && !error && query && (
        <p className="text-palumar-muted mb-3" style={{ fontSize: '11px' }}>
          {rows.length} resultado{rows.length !== 1 ? 's' : ''} para <strong style={{ color: 'var(--cyan)' }}>"{query}"</strong>
        </p>
      )}

      {/* Tabla Secos (Centrales o Chiriquí) */}
      {!loading && !error && tab !== 'frio' && (
        <div className="table-card mb-8">
          <div className="px-5 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border-2)' }}>
            <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
              {tab === 'centrales' ? 'CEDI Centrales' : 'CEDI Chiriquí'} — Secos
            </h3>
            <span className="text-palumar-muted ml-auto" style={{ fontSize: '11px' }}>
              {rows.length} productos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="palma-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Inv. Disponible</th>
                  <th style={{ textAlign: 'right' }}>Venta Mes</th>
                  <th style={{ textAlign: 'right' }}>Cobertura</th>
                  <th style={{ textAlign: 'right' }}>En Pedido</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      {query ? 'Sin resultados para esa búsqueda' : 'Sin datos'}
                    </td>
                  </tr>
                ) : rows.map((p, i) => {
                  const inv = p.inv ?? 0;
                  const b   = badge(inv);
                  return (
                    <tr key={i}>
                      <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{p.codigo}</td>
                      <td style={{ fontWeight: 500, fontSize: '12px', maxWidth: '260px' }}>{p.nombre}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">
                        <span style={{ color: b.color, fontWeight: inv <= 30 ? 700 : 400 }}>
                          {fmtNum(inv)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">
                        {fmtNum(p.venta_mes)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">
                        {p.cobertura != null ? `${fmtNum(p.cobertura)} d` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--cyan)' }} className="font-mono-num">
                        {fmtNum(p.pedido)}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                          borderRadius: '99px', color: b.color,
                          background: `${b.color}20`,
                          border: `1px solid ${b.color}40`,
                        }}>
                          {b.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla Frío */}
      {!loading && !error && tab === 'frio' && (
        <div className="table-card mb-8">
          <div className="px-5 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border-2)' }}>
            <h3 className="font-display font-bold text-palumar-white" style={{ fontSize: '13px' }}>
              Inventario Frío — BR21 Centrales · BR23 Chiriquí
            </h3>
            <span className="text-palumar-muted ml-auto" style={{ fontSize: '11px' }}>
              {rows.length} productos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="palma-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Línea</th>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Centrales</th>
                  <th style={{ textAlign: 'right' }}>Chiriquí</th>
                  <th style={{ textAlign: 'right' }}>Forecast</th>
                  <th style={{ textAlign: 'right' }}>Venta Mes</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      {query ? 'Sin resultados para esa búsqueda' : 'Sin datos'}
                    </td>
                  </tr>
                ) : rows.map((p, i) => {
                  const bc = badge(p.inv_centrales);
                  const bq = badge(p.inv_chiriqui);
                  return (
                    <tr key={i}>
                      <td className="font-mono-num" style={{ color: 'var(--muted)', fontSize: '11px' }}>{p.codigo}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '11px' }}>{p.linea || '—'}</td>
                      <td style={{ fontWeight: 500, fontSize: '12px', maxWidth: '220px' }}>{p.nombre}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">
                        <span style={{ color: bc.color, fontWeight: (p.inv_centrales ?? 0) <= 30 ? 700 : 400 }}>
                          {fmtNum(p.inv_centrales)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono-num">
                        <span style={{ color: bq.color, fontWeight: (p.inv_chiriqui ?? 0) <= 30 ? 700 : 400 }}>
                          {fmtNum(p.inv_chiriqui)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">
                        {fmtNum(p.forecast)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }} className="font-mono-num">
                        {fmtNum(p.venta_mes)}
                      </td>
                      <td>
                        {p.estatus ? (
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                            borderRadius: '99px',
                            color: p.estatus === 'OK' ? 'var(--green)' : 'var(--amber)',
                            background: p.estatus === 'OK' ? 'rgba(15,169,122,0.12)' : 'rgba(245,158,11,0.12)',
                            border: `1px solid ${p.estatus === 'OK' ? 'rgba(15,169,122,0.3)' : 'rgba(245,158,11,0.3)'}`,
                          }}>
                            {p.estatus}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
