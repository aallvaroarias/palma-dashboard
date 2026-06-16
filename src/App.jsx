import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Topbar from './components/layout/Topbar';
import BottomNav from './components/layout/BottomNav';
import LoadingOverlay from './components/ui/LoadingOverlay';
import Consultor from './components/ui/Consultor';
import { useDashboard } from './hooks/useDashboard';
import useDashboardStore from './store/dashboardStore';

// Views — lazy loaded for code splitting
const Gerencial    = React.lazy(() => import('./components/views/Gerencial'));
const Vendedor     = React.lazy(() => import('./components/views/Vendedor'));
const Cobertura    = React.lazy(() => import('./components/views/Cobertura'));
const Efectividad  = React.lazy(() => import('./components/views/Efectividad'));
const Devoluciones = React.lazy(() => import('./components/views/Devoluciones'));
const Clientes     = React.lazy(() => import('./components/views/Clientes'));
const Cartera      = React.lazy(() => import('./components/views/Cartera'));
const Nomina       = React.lazy(() => import('./components/views/Nomina'));
const Inventario   = React.lazy(() => import('./components/views/Inventario'));
const MiGerencia   = React.lazy(() => import('./components/views/MiGerencia'));

function ViewFallback() {
  return (
    <div className="flex items-center justify-center h-48 text-palumar-muted text-sm">
      Cargando...
    </div>
  );
}

export default function App() {
  React.useEffect(() => {
    console.log('[PALMA BUILD] 2026-06-09-fix-falta-acordeon');
  }, []);

  useDashboard();

  const { loading, loadAll, resumen } = useDashboardStore();
  const [initialLoad, setInitialLoad] = React.useState(true);

  // Quitar overlay cuando resumen carga, o tras timeout de 30s si falla
  React.useEffect(() => {
    if (resumen && initialLoad) setInitialLoad(false);
  }, [resumen, initialLoad]);
  React.useEffect(() => {
    const t = setTimeout(() => setInitialLoad(false), 30000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* Full-screen loading overlay on first load */}
      <LoadingOverlay visible={initialLoad && loading} />

      {/* Main app */}
      <div className={`flex flex-col min-h-screen transition-opacity duration-300 ${initialLoad && loading ? 'opacity-0' : 'opacity-100'}`}>
        <Topbar onRefresh={loadAll} />

        <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1440px] mx-auto w-full pb-20 sm:pb-6">
          <Suspense fallback={<ViewFallback />}>
            <Routes>
              <Route path="/"              element={<Gerencial />} />
              <Route path="/panel"         element={<Vendedor />} />
              <Route path="/cobertura"     element={<Cobertura />} />
              <Route path="/efectividad"   element={<Efectividad />} />
              <Route path="/devoluciones"  element={<Devoluciones />} />
              <Route path="/clientes"      element={<Clientes />} />
              <Route path="/cartera"       element={<Cartera />} />
              <Route path="/nomina"        element={<Nomina />} />
              <Route path="/inventario"   element={<Inventario />} />
              <Route path="/mi-gerencia" element={<MiGerencia />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>

        {/* Mobile bottom nav */}
        <BottomNav />
      </div>

      {/* Consultor IA — flotante en todas las vistas (OCULTO: cambiar a true para reactivar) */}
      {false && <Consultor />}
    </>
  );
}
