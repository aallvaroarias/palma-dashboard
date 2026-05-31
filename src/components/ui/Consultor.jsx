import React, { useState, useRef, useEffect, useMemo } from 'react';
import useDashboardStore from '../../store/dashboardStore';
import { fmt, pct } from '../../utils/formatters';

const LOGO = '✦';

function buildContexto(store) {
  const { resumen: r, vendedores, skus, topClientes, clientesCero, marcas, cuotas } = store;
  if (!r) return 'Datos aún no cargados.';

  const lines = [];

  // Resumen período
  lines.push(`== PERÍODO: ${r.periodo || 'Mes actual'} ==`);
  lines.push(`Venta Bruta: $${fmt(r.venta_bruta || 0)} | Venta Neta: $${fmt(r.venta_neta || 0)}`);
  lines.push(`Devoluciones: $${fmt(r.devolucion_total || 0)} (${pct(r.pct_devolucion || 0)})`);
  lines.push(`Cobertura equipo: ${pct(r.cobertura_pct || 0)} (${r.clientes_impactados || 0} / ${r.clientes_maestro || 0} clientes)`);
  lines.push(`Efectividad: ${pct(r.efectividad_pct || 0)}`);
  if (r.cuota_total) lines.push(`Meta equipo: $${fmt(r.cuota_total)} | Cumplimiento: ${pct(r.pct_cumplimiento_equipo || 0)}`);
  lines.push('');

  // Vendedores
  if (vendedores?.length) {
    lines.push('== VENDEDORES ==');
    vendedores.forEach(v => {
      const cuota = cuotas?.find(c => String(c.cod).trim() === String(v.cod).trim());
      const meta  = cuota?.cuota || v.cuota || 0;
      const pctM  = meta > 0 ? Math.round((v.venta_neta || 0) / meta * 100) : null;
      lines.push(
        `${v.cod} - ${v.nombre}: V.Neta=$${fmt(v.venta_neta || 0)}, Cobertura=${pct(v.cobertura || 0)}, Maestro=${v.maestro || 0}, Impactos=${v.clientes_imp || 0}${meta ? `, Meta=$${fmt(meta)}, Cumpl.=${pctM}%` : ''}`
      );
    });
    lines.push('');
  }

  // Clientes sin compra por vendedor
  if (clientesCero?.por_vendedor?.length) {
    lines.push('== CLIENTES SIN COMPRA (período actual) ==');
    clientesCero.por_vendedor.forEach(r2 => {
      lines.push(`${r2.vendedor}: ${r2.cantidad} clientes sin compra`);
    });
    lines.push('');
  }

  // Top clientes globales
  if (topClientes?.top_global?.length) {
    lines.push('== TOP 10 CLIENTES (venta neta) ==');
    topClientes.top_global.slice(0, 10).forEach(c => {
      lines.push(`#${c.ranking} Cód.${c.cod_cliente} ${c.nombre} — $${fmt(c.venta)} — Vendedor: ${c.nom_vendedor || '—'} — Negocio: ${c.negocio_principal || '—'}`);
    });
    lines.push('');
  }

  // Top SKUs globales
  if (skus?.global?.length) {
    lines.push('== TOP SKUs GLOBALES ==');
    skus.global.slice(0, 15).forEach((s, i) => {
      lines.push(`#${i + 1} SKU:${s.sku} ${s.nombre} — $${fmt(s.venta)} — ${s.clientes} clientes — Negocio:${s.negocio || '—'} — Marca:${s.marca || '—'}`);
    });
    lines.push('');
  }

  // Marcas
  if (marcas?.length) {
    lines.push('== TOP MARCAS ==');
    marcas.slice(0, 10).forEach((m, i) => {
      lines.push(`#${i + 1} ${m.marca}: $${fmt(m.venta)}`);
    });
  }

  return lines.join('\n');
}

export default function Consultor() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [messages, setMessages] = useState([
    { role: 'bot', text: '¡Hola! Soy el consultor de Palumar 👋 Puedo responder preguntas sobre ventas, cobertura, metas, clientes y SKUs del período actual. ¿En qué te ayudo?' }
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const store     = useDashboardStore();

  const contexto = useMemo(() => buildContexto(store), [store]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function enviar() {
    const pregunta = input.trim();
    if (!pregunta || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: pregunta }]);
    setLoading(true);

    try {
      const res = await fetch('/api/consultor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, contexto }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.respuesta || data.error || 'Sin respuesta.'
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Error al conectar con el consultor. Intenta de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Consultor IA"
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
          width: '52px', height: '52px', borderRadius: '50%',
          background: open ? 'var(--blue)' : 'linear-gradient(135deg,#1a7fa6,#0d5c7a)',
          border: '2px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '22px', color: '#fff', transition: 'all 0.2s',
        }}
      >
        {open ? '✕' : LOGO}
      </button>

      {/* Panel de chat */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '88px', right: '24px', zIndex: 998,
          width: '360px', maxWidth: 'calc(100vw - 48px)',
          height: '500px', maxHeight: 'calc(100vh - 120px)',
          borderRadius: '16px', overflow: 'hidden',
          background: 'var(--card-bg, #0d1e2c)',
          border: '1px solid rgba(45,174,217,0.2)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', background: 'linear-gradient(135deg,#1a7fa6,#0d5c7a)',
            display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px',
            }}>✦</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}>Consultor Palumar</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>Powered by Gemini · Datos en tiempo real</div>
            </div>
          </div>

          {/* Mensajes */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '9px 12px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user'
                    ? 'linear-gradient(135deg,#1a7fa6,#0d5c7a)'
                    : 'rgba(255,255,255,0.06)',
                  border: m.role === 'bot' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  fontSize: '12.5px', lineHeight: '1.6',
                  color: m.role === 'user' ? '#fff' : 'var(--white-2, #c8d8e4)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '9px 14px', borderRadius: '14px 14px 14px 4px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', gap: '5px', alignItems: 'center',
                }}>
                  {[0, 1, 2].map(n => (
                    <span key={n} style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: 'var(--blue, #2AAED9)',
                      display: 'inline-block',
                      animation: `pulse 1.2s ease-in-out ${n * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', gap: '8px', flexShrink: 0,
            background: 'rgba(0,0,0,0.2)',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Pregunta algo sobre las ventas…"
              rows={1}
              disabled={loading}
              style={{
                flex: 1, resize: 'none', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '8px 12px',
                background: 'rgba(255,255,255,0.05)', color: 'var(--white-2, #c8d8e4)',
                fontSize: '12.5px', lineHeight: '1.5', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={enviar}
              disabled={!input.trim() || loading}
              style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                background: input.trim() && !loading ? 'var(--blue, #2AAED9)' : 'rgba(255,255,255,0.06)',
                border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                color: '#fff', fontSize: '16px', alignSelf: 'flex-end',
                transition: 'background 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
