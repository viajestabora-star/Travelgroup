import React, { useState, useEffect, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { toSlug } from './utils/slugify';
import SlugGuard from './components/SlugGuard';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
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
import GestionEquipo from './pages/GestionEquipo';
import AdminMaster from './pages/AdminMaster';
import SuscripcionExpirada from './pages/SuscripcionExpirada';
import AdminMasterRouteGuard from './components/AdminMasterRouteGuard';
import { esUsuarioGestoria, puedeAccederCierresEconomicos } from './utils/userRoles';
import { sincronizarNivelAccesoEnSesion } from './utils/nivelAcceso';
import LoginPortal from './components/LoginPortal';
import { aplicarMarcaDocumento, NOMBRE_APP_DEFAULT } from './utils/marcaBlanca';
import { EmpresaProvider } from './context/EmpresaContext';
import { supabase } from './supabase';
import { setTenantEmpresaId, clearTenantEmpresaId } from './utils/tenantDb';
import { empresaIdDesdeJwtUsuario } from './utils/tenantEmpresa';

/** Ruta `/historial-cierres`: solo ADMIN o GESTORIA; resto → panel principal. */
function CierresEconomicosRoute({ user }) {
  if (!puedeAccederCierresEconomicos(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <CierresEconomicos user={user} />;
}

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
      // Sin empresa_id válido → sesión inválida (no usar DEFAULT_EMPRESA_ID como fallback)
      if (!(Number(parsed.empresa_id) > 0)) return null;
      // empresa_id se normaliza siempre como Number (Integer) para que las comparaciones
      // === 1 (empresa raíz) y === empresaIdReal funcionen sin coerciones inesperadas.
      const u = sincronizarNivelAccesoEnSesion({
        ...parsed,
        empresa_id:  Number(parsed.empresa_id),
        nombre_app:  parsed.nombre_app  ?? NOMBRE_APP_DEFAULT,
        favicon_url: parsed.favicon_url ?? null,
      });
      // Activar el filtro de tenant desde el arranque (antes del primer render)
      setTenantEmpresaId(u.empresa_id);
      return u;
    } catch (_) {
      return null;
    }
  });

  // ── Verificación JWT al montar ────────────────────────────────────────────
  // Compara el empresa_id del localStorage con el del JWT real de Supabase Auth.
  // Si hay discrepancia o el JWT no tiene empresa_id, corrige o cierra sesión.
  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData?.session?.user;
      if (!authUser) return; // Sin sesión activa → flujo de login ya lo gestiona

      // Intentar empresa_id desde JWT claims
      let empresa_idReal = empresaIdDesdeJwtUsuario(authUser) ?? 0;
      let nivelAccesoReal = null;

      // Si no viene en JWT, leer desde profiles (hint: empresa_id en localStorage para acotar RLS)
      if (!empresa_idReal) {
        let hint = 0;
        try {
          const raw = localStorage.getItem('sesion_tabora');
          if (raw) hint = Number(JSON.parse(raw).empresa_id) || 0;
        } catch (_) {}
        let q = supabase
          .from('profiles')
          .select('empresa_id, nivel_acceso')
          .eq('id', authUser.id);
        if (hint > 0) q = q.eq('empresa_id', hint);
        const { data: perfil } = await q.maybeSingle();
        empresa_idReal = Number(perfil?.empresa_id) || 0;
        nivelAccesoReal = perfil?.nivel_acceso || null;
      }

      if (cancelled) return;

      if (!empresa_idReal) {
        // Sin empresa_id real → sesión corrupta, forzar logout
        console.warn('[App] Sin empresa_id en sesión JWT/profiles → cerrando sesión');
        await supabase.auth.signOut();
        localStorage.removeItem('sesion_tabora');
        setUser(null);
        return;
      }

      // Corregir sesión local con datos reales: empresa_id numérico y nivel_acceso reciente
      setUser((prev) => {
        if (!prev) return prev;
        const empresaIgual = Number(prev.empresa_id) === empresa_idReal;
        const nivelIgual = !nivelAccesoReal || prev.nivel_acceso === nivelAccesoReal;
        if (empresaIgual && nivelIgual) {
          setTenantEmpresaId(empresa_idReal);
          return prev;
        }
        console.warn('[App] Sesión local desactualizada → corrigiendo empresa_id/nivel_acceso', {
          empresaLocal: prev.empresa_id,
          empresaReal: empresa_idReal,
          nivelLocal: prev.nivel_acceso,
          nivelReal: nivelAccesoReal,
        });
        const corrected = {
          ...prev,
          empresa_id: empresa_idReal,
          ...(nivelAccesoReal ? { nivel_acceso: nivelAccesoReal } : {}),
        };
        localStorage.setItem('sesion_tabora', JSON.stringify(corrected));
        setTenantEmpresaId(empresa_idReal);
        return corrected;
      });

      // Completar empresa_slug y logo_url si no están en la sesión guardada
      const rawStored = localStorage.getItem('sesion_tabora');
      if (rawStored) {
        try {
          const stored = JSON.parse(rawStored);
          if (!stored.empresa_slug || !stored.logo_url || !stored.nombre_comercial) {
            const { data: emp } = await supabase
              .from('empresas')
              .select('cif, nombre_comercial, logo_url')
              .eq('id', empresa_idReal)
              .maybeSingle();
            if (emp && !cancelled) {
              const empresa_slug = stored.empresa_slug || toSlug(emp.nombre_comercial || `empresa-${empresa_idReal}`);
              const logo_url     = stored.logo_url     || emp.logo_url || null;
              const nombre_comercial = stored.nombre_comercial || emp.nombre_comercial || null;
              const updated = { ...stored, cif: emp.cif ?? stored.cif, empresa_slug, logo_url, nombre_comercial };
              localStorage.setItem('sesion_tabora', JSON.stringify(updated));
              setUser((prev) => prev ? { ...prev, cif: updated.cif, empresa_slug, logo_url, nombre_comercial } : prev);
            }
          }
        } catch (_) {}
      }
    };

    syncSession();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    clearTenantEmpresaId();
    localStorage.removeItem('sesion_tabora');
    setUser(null);
    window.location.href = '/';
  };

  window.confirmarAccionBorrar = (item) =>
    window.confirm(`¿Estás seguro de que quieres borrar ${item}?`);

  const session = user;

  // Sesión con email pero sin tenant: limpiar antes de mostrar login (protección de datos)
  useLayoutEffect(() => {
    if (user?.email && !(Number(user.empresa_id) > 0)) {
      clearTenantEmpresaId();
      localStorage.removeItem('sesion_tabora');
      void supabase.auth.signOut();
      setUser(null);
    }
  }, [user?.email, user?.empresa_id]);

  // Slug URL-safe de la empresa (prioriza empresa_slug guardado en sesión)
  const empresaSlug = session?.empresa_slug || toSlug(session?.nombre_app || NOMBRE_APP_DEFAULT);

  useEffect(() => {
    if (session?.email) {
      aplicarMarcaDocumento(session.nombre_app || NOMBRE_APP_DEFAULT, session.favicon_url);
    }
  }, [session]);

  // Sin email o sin empresa_id válido → no ERP (evita navegación / escrituras sin tenant)
  if (!session || !session.email || !(Number(session.empresa_id) > 0)) {
    return (
      <ErrorBoundary>
        <LoginPortal
          onSesion={(u) => setUser(u)}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <EmpresaProvider user={session}>
      <BrowserRouter>
        <Routes>
          {/* ── Raíz → slug de la empresa ── */}
          <Route path="/" element={<Navigate to={`/${empresaSlug}`} replace />} />

          {/* ── Redirects de compatibilidad: rutas sin slug → con slug ──
              Los guards internos (AdminRouteGuard, etc.) redirigen a rutas absolutas
              como /dashboard o /cierres; estas rutas las capturan y añaden el slug. */}
          {['dashboard','clientes','expedientes','proveedores','planning','crm',
            'notas','composer','cierres','historial-cierres',
            'gestion-equipo','admin-master'].map((p) => (
            <Route key={p} path={`/${p}`} element={<Navigate to={`/${empresaSlug}/${p}`} replace />} />
          ))}

          {/* ── Rutas principales bajo /:slug ── */}
          <Route path="/:slug" element={
            <ProtectedRoute user={session}>
              <SlugGuard>
                <Layout user={session} onLogout={handleLogout} />
              </SlugGuard>
            </ProtectedRoute>
          }>
            {/* Redirección inicial según perfil (paths relativos dentro de /:slug) */}
            <Route index element={
              esUsuarioGestoria(session)
                ? <Navigate to="cierres" replace />
                : <Navigate to="dashboard" replace />
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
            <Route path="crm"         element={<ProtectedRoute user={session}><CRM user={session} /></ProtectedRoute>} />
            <Route path="notas"       element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><NotasTrabajo user={session} /></GestoriaBlockGuard></ProtectedRoute>} />
            <Route path="composer"    element={<ProtectedRoute user={session}><GestoriaBlockGuard user={session}><Composer user={session} /></GestoriaBlockGuard></ProtectedRoute>} />


            {/* ── Gestión de Equipo: todos los no-gestores (Admin + Staff de cualquier empresa) ── */}
            <Route
              path="gestion-equipo"
              element={
                <ProtectedRoute user={session}>
                  <GestoriaBlockGuard user={session}>
                    <GestionEquipo user={session} />
                  </GestoriaBlockGuard>
                </ProtectedRoute>
              }
            />

            {/* ── Panel Master: solo Tabora ── */}
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
      </EmpresaProvider>
    </ErrorBoundary>
  );
}

export default App;
