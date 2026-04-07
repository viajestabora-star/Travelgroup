import React, { useState } from 'react';
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
import HistorialCierres from './pages/HistorialCierres';
import NotasTrabajo from './pages/NotasTrabajo';
import Composer from './pages/Composer';
import InteligenciaEconomica from './pages/InteligenciaEconomica';
import AdminRouteGuard from './components/AdminRouteGuard';
import { esUsuarioGestoria } from './utils/userRoles';

// ─── Auth ────────────────────────────────────────────────────────────────────
const USUARIOS_AUTORIZADOS = {
  'andres@viajestabora.com': { nombre: 'Andrés',        rol: 'ADMIN'    },
  'info@viajestabora.com':   { nombre: 'Germán',         rol: 'ADMIN'    },
  'grupos@viajestabora.com': { nombre: 'Marisa',         rol: 'STAFF'    },
  'alcor@asesores.com':      { nombre: 'Gestoria Alcor', rol: 'GESTORIA' },
};
const CLAVE_MAESTRA = 'tabora';

// ─── Helpers de rol ──────────────────────────────────────────────────────────
// esUsuarioGestoria: ./utils/userRoles.js (reutilizable en páginas como Historial de Cierres)

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
      return parsed && parsed.email ? parsed : null;
    } catch (e) {
      return null;
    }
  });
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const emailNorm        = email.toLowerCase().trim();
    const usuarioEncontrado = USUARIOS_AUTORIZADOS[emailNorm];
    if (usuarioEncontrado && pass === CLAVE_MAESTRA) {
      const datosSesion = { email: emailNorm, ...usuarioEncontrado };
      localStorage.setItem('sesion_tabora', JSON.stringify(datosSesion));
      setUser(datosSesion);
    } else {
      alert('Credenciales no válidas para Viajes Tabora');
    }
  };

  const handleLogout = async () => {
    await registrarSalida();
    localStorage.removeItem('sesion_tabora');
    setUser(null);
    window.location.href = '/';
  };

  window.confirmarAccionBorrar = (item) =>
    window.confirm(`¿Estás seguro de que quieres borrar ${item}?`);

  // REGLA DE ORO: Sin sesión = SOLO Login.
  const session = user;
  if (!session || !session.email) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '320px' }}>
          <h2 style={{ textAlign: 'center', color: '#1a73e8' }}>Viajes Tabora ERP</h2>
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={pass}
            onChange={e => setPass(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            required
          />
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            Entrar
          </button>
        </form>
      </div>
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
            <Route path="historial-cierres" element={<ProtectedRoute user={session}><HistorialCierres user={session} /></ProtectedRoute>} />
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
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
