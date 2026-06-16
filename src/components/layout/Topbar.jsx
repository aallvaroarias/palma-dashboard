import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import useDashboardStore from '../../store/dashboardStore';

const TABS = [
  { label: 'Gerencial', path: '/' },
  { label: 'Mi Panel', path: '/panel' },
  { label: 'Cobertura', path: '/cobertura' },
  { label: 'Efectividad', path: '/efectividad' },
  { label: 'Devoluciones', path: '/devoluciones' },
  { label: 'Clientes', path: '/clientes' },
  { label: 'Cartera', path: '/cartera' },
  { label: 'Nómina',     path: '/nomina' },
  { label: 'Inventario', path: '/inventario' },
  { label: 'Mi Gerencia', path: '/mi-gerencia' },
];

export default function Topbar({ onRefresh }) {
  const location = useLocation();
  const { resumen, lastUpdate, loading } = useDashboardStore();

  const lastUpdateStr = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header
      className="glass-dark sticky top-0 z-50 h-16 flex items-center gap-5 px-4 sm:px-6"
      style={{ boxShadow: '0 1px 0 rgba(90,145,185,0.1), 0 4px 24px rgba(0,0,0,0.3)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '1.5px solid rgba(200,164,62,0.45)',
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
        <div className="leading-tight">
          <div
            className="font-display font-extrabold tracking-wide text-palumar-white"
            style={{ fontSize: '14px', letterSpacing: '0.5px' }}
          >
            PALMA
          </div>
          <div
            className="text-palumar-muted"
            style={{ fontSize: '9px', letterSpacing: '0.3px' }}
          >
            Distribuciones Palumar S.A.
          </div>
        </div>
      </div>

      {/* Separator */}
      <div
        className="w-px h-7 flex-shrink-0"
        style={{ background: 'var(--border-2)' }}
      />

      {/* Nav tabs (hidden on mobile) */}
      <nav className="hidden sm:flex items-center gap-0.5">
        {TABS.map((tab) => {
          const isActive =
            tab.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`relative px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'text-white'
                  : 'text-palumar-muted hover:text-palumar-white'
              }`}
              style={
                isActive
                  ? {
                      background: 'linear-gradient(135deg, rgba(26,127,166,0.22) 0%, rgba(45,200,216,0.1) 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(45,200,216,0.2), 0 0 12px rgba(26,127,166,0.15)',
                      border: '1px solid rgba(45,200,216,0.25)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2.5 flex-shrink-0">
        {/* Fecha de corte */}
        {resumen?.fecha_corte && (
          <span
            className="hidden md:inline font-mono-num text-palumar-muted rounded-md px-2.5 py-1 border"
            style={{ fontSize: '10px', background: 'var(--navy-3)', borderColor: 'var(--border-2)' }}
          >
            Corte: {new Date(resumen.fecha_corte + 'T12:00:00').toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        )}

        {/* Live indicator */}
        <div
          className="hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1 border"
          style={{
            background: 'rgba(15,169,122,0.12)',
            borderColor: 'rgba(15,169,122,0.3)',
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: 'var(--green)',
              animation: 'pulse-dot 2s infinite',
            }}
          />
          <span
            className="font-semibold tracking-wide text-green"
            style={{ fontSize: '10px', letterSpacing: '0.3px' }}
          >
            LIVE
          </span>
        </div>

        {/* Last update */}
        {lastUpdateStr && (
          <span
            className="hidden md:inline font-mono-num text-palumar-muted"
            style={{ fontSize: '10px' }}
          >
            Act. {lastUpdateStr}
          </span>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="h-8 px-3 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition-all duration-150"
          style={{
            background: loading ? 'rgba(26,127,166,0.5)' : 'var(--blue)',
            opacity: loading ? 0.7 : 1,
          }}
          title="Actualizar datos"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>
    </header>
  );
}
