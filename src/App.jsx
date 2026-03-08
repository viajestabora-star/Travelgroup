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

const USUARIOS_AUTORIZADOS = {
  'andres@viajestabora.com': { nombre: 'Andrés', rol: 'ADMIN' },
  'info@viajestabora.com': { nombre: 'Germán', rol: 'ADMIN' },
  'grupos@viajestabora.com': { nombre: 'Marisa', rol: 'STAFF' }
};
const CLAVE_MAESTRA = 'tabora';

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
  const [pass, setPass] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const usuarioEncontrado = USUARIOS_AUTORIZADOS[email.toLowerCase()];
    if (usuarioEncontrado && pass === CLAVE_MAESTRA) {
      const datosSesion = { email, ...usuarioEncontrado };
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

  window.confirmarAccionBorrar = (item) => {
    return window.confirm(`¿Estás seguro de que quieres borrar ${item}?`);
  };

  // REGLA DE ORO: Sin sesión = SOLO Login. No renderizar nada más.
  const session = user;
  if (!session || session === null || session === undefined || !session.email) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '320px' }}>
          <h2 style={{ textAlign: 'center', color: '#1a73e8' }}>Viajes Tabora ERP</h2>
          <input type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} required />
          <input type="password" placeholder="Contraseña" value={pass} onChange={e => setPass(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} required />
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Entrar</button>
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
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard user={session} />} />
            <Route path="clientes" element={<ProtectedRoute user={session}><Clientes user={session} /></ProtectedRoute>} />
            <Route path="expedientes" element={<ProtectedRoute user={session}><Expedientes user={session} /></ProtectedRoute>} />
            <Route path="proveedores" element={<ProtectedRoute user={session}><Proveedores user={session} /></ProtectedRoute>} />
            <Route path="planning" element={<ProtectedRoute user={session}><Planning user={session} /></ProtectedRoute>} />
            <Route path="crm" element={<ProtectedRoute user={session}><CRM user={session} /></ProtectedRoute>} />
            <Route path="notas" element={<ProtectedRoute user={session}><NotasTrabajo user={session} /></ProtectedRoute>} />
            <Route path="composer" element={<ProtectedRoute user={session}><Composer user={session} /></ProtectedRoute>} />
            <Route path="cierres" element={<ProtectedRoute user={session}><Cierres user={session} /></ProtectedRoute>} />
            <Route path="historial-cierres" element={<ProtectedRoute user={session}><HistorialCierres user={session} /></ProtectedRoute>} />
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
