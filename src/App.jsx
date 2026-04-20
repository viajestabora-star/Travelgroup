import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { registrarSalida } from './utils/controlHorario';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Expedientes from './pages/Expedientes';
import Proveedores from './pages/Proveedores';
import Planning from './pages/Planning';
import CRM from './pages/CRM';
import Cierres from './pages/Cierres';
import CierresEconomicos from './pages/CierresEconomicos';
import NotasTrabajo from './pages/NotasTrabajo';
import Composer from './pages/Composer';
import InteligenciaEconomica from './pages/InteligenciaEconomica';
import GestionEquipo from './pages/GestionEquipo';
import AdminMaster from './pages/AdminMaster';
import SuscripcionExpirada from './pages/SuscripcionExpirada';
import AdminRouteGuard from './components/AdminRouteGuard';
import AdminOnlyRouteGuard from './components/AdminOnlyRouteGuard';
import AdminMasterRouteGuard from './components/AdminMasterRouteGuard';
import { esUsuarioGestoria, puedeAccederCierresEconomicos } from './utils/userRoles';
import { sincronizarNivelAccesoEnSesion } from './utils/nivelAcceso';
import { DEFAULT_EMPRESA_ID } from './config/empresa';
import LoginPortal from './components/LoginPortal';
import { aplicarMarcaDocumento, NOMBRE_APP_DEFAULT } from './utils/marcaBlanca';

/** Ruta `/historial-cierres`: solo ADMIN o GESTORIA; resto → panel principal. */
function CierresEconomicosRoute({ user }) {
  if (!puedeAccederCierresEconomicos(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <CierresEconomicos user={user} />;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
const USUARIOS_AUTORIZADOS = {
  'andres@viajestabora.com': { nombre: 'Andrés',        nivel_acceso: 'ADMIN',    empresa_id: DEFAULT_EMPRESA_ID },
  'info@viajestabora.com':   { nombre: 'Germán',         nivel_acceso: 'ADMIN',    empresa_id: DEFAULT_EMPRESA_ID },
  'grupos@viajestabora.com': { nombre: 'Marisa',         nivel_acceso: 'STAFF',    empresa_id: DEFAULT_EMPRESA_ID },
  'alcor@asesores.com':      { nombre: 'Gestoria Alcor', nivel_acceso: 'GESTORIA', empresa_id: DEFAULT_EMPRESA_ID },
};
const CLAVE_MAESTRA = 'tabora';

// ─── Helpers de rol ──────────────────────────────────────────────────────────
// esUsuarioGestoria / puedeAccederCierresEconomicos: ./utils/userRoles.js

// Bloquea a usuarios GESTORIA de rutas internas que no les corresponden
const GestoriaBlockGuard = ({ user, children }) => {
  if (esUsuarioGestoria(user)) return <Navigate to="/cierres" replace />;
  return children;
};

// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('sesion_tabora');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (!parsed || !parsed.email) return null;
      return sincronizarNivelAccesoEnSesion({
        ...parsed,
        empresa_id: parsed.empresa_id ?? DEFAULT_EMPRESA_ID,
        nombre_app: parsed.nombre_app ?? NOMBRE_APP_DEFAULT,
        favicon_url: parsed.favicon_url ?? null,
      });
    } catch (e) {
      return null;
    }
  });
  const handleLogout = async () => {
    await registrarSalida();
    localStorage.removeItem('sesion_tabora');
    setUser(null);
    window.location.href = '/';
  };

  window.confirmarAccionBorrar = (item) =>
    window.confirm(`¿Estás seguro de que quieres borrar ${item}?`);

  const session = user;

  useEffect(() => {
    if (session?.email) {
      aplicarMarcaDocumento(session.nombre_app || NOMBRE_APP_DEFAULT, session.favicon_url);
    }
  }, [session]);

  if (!session || !session.email) {
    return (
      <ErrorBoundary>
        <LoginPortal
          usuariosInternos={USUARIOS_AUTORIZADOS}
          claveMaestra={CLAVE_MAESTRA}
          onSesion={(u) => setUser(u)}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <ProtectedRoute user={session}>
              <Layout user={session} onLogout={handleLogout} />
            </ProtectedRoute>
          }>
            {/* Redirección inicial según perfil */}
            <Route index element={
              esUsuarioGestoria(session)
                ? <Navigate to="/cierres" replace />
                : <Navigate to="/dashboard" replace />
            } />

            {/* ── Accesibles a todos ── */}
            <Route path="dashboard"         element={<Dashboard user={session} />} />
            <Route path="cierres"           element={<ProtectedRoute user={session}><Cierres user={session} /></ProtectedRoute>} />
            <Route
              path="historial-cierres"
              element={
                <ProtectedRoute user={session}>
                  <CierresEconomicosRoute user={session} />
                </ProtectedRoute>
              }
            />
            <Route path="proveedores"       element={<ProtectedRoute user={session}><Proveedores user={session} /></ProtectedRoute>} />

            {/* ── Bloqueadas para GESTORIA ── */}
            <Route path="clientes"    element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><Clientes user={session} /></GestoriaBlockGuard></ProtectedRoute>} />
            <Route path="expedientes" element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><Expedientes user={session} /></GestoriaBlockGuard></ProtectedRoute>} />
            <Route path="planning"    element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><Planning user={session} /></GestoriaBlockGuard></ProtectedRoute>} />
            <Route path="crm"         element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><CRM user={session} /></GestoriaBlockGuard></ProtectedRoute>} />
            <Route path="notas"       element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><NotasTrabajo user={session} /></GestoriaBlockGuard></ProtectedRoute>} />
            <Route path="composer"             element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><Composer user={session} /></GestoriaBlockGuard></ProtectedRoute>} />

            {/* ── Inteligencia Económica: ADMIN + GESTORIA ── */}
            <Route
              path="inteligencia-economica"
              element={
                <ProtectedRoute user={session}>
                  <AdminRouteGuard user={session}>
                    <InteligenciaEconomica user={session} />
                  </AdminRouteGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="gestion-equipo"
              element={
                <ProtectedRoute user={session}>
                  <GestoriaBlockGuard user={session}>
                    <AdminOnlyRouteGuard user={session}>
                      <GestionEquipo user={session} />
                    </AdminOnlyRouteGuard>
                  </GestoriaBlockGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="admin-master"
              element={
                <ProtectedRoute user={session}>
                  <GestoriaBlockGuard user={session}>
                    <AdminMasterRouteGuard user={session}>
                      <AdminMaster />
                    </AdminMasterRouteGuard>
                  </GestoriaBlockGuard>
                </ProtectedRoute>
              }
            />
          </Route>
          <Route
            path="/suscripcion-expirada"
            element={
              <ProtectedRoute user={session}>
                <SuscripcionExpirada user={session} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
