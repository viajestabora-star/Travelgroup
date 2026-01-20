import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Expedientes from './pages/Expedientes';
import Proveedores from './pages/Proveedores';
import Planning from './pages/Planning';
import CRM from './pages/CRM';
import Cierres from './pages/Cierres';
import NotasTrabajo from './pages/NotasTrabajo'; // NUEVA PÁGINA

const USUARIOS_AUTORIZADOS = {
  'andres@viajestabora.com': { nombre: 'Andrés', rol: 'ADMIN' },
  'info@viajestabora.com': { nombre: 'Germán', rol: 'ADMIN' },
  'grupos@viajestabora.com': { nombre: 'Marisa', rol: 'STAFF' }
};
const CLAVE_MAESTRA = 'tabora';

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('sesion_tabora')));
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

  const handleLogout = () => {
    localStorage.removeItem('sesion_tabora');
    setUser(null);
    window.location.href = '/';
  };

  window.confirmarAccionBorrar = (item) => {
    return window.confirm(`¿Está seguro de que desea eliminar ${item}?`);
  };

  if (!user) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <form onSubmit={handleLogin} style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '320px' }}>
          <h2 style={{ textAlign: 'center', color: '#1a73e8' }}>Viajes Tabora ERP</h2>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} required />
          <input type="password" placeholder="Contraseña" value={pass} onChange={e => setPass(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} required />
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard user={user} />} />
          <Route path="clientes" element={<Clientes user={user} />} />
          <Route path="expedientes" element={<Expedientes user={user} />} />
          <Route path="proveedores" element={<Proveedores user={user} />} />
          <Route path="planning" element={<Planning user={user} />} />
          <Route path="crm" element={<CRM user={user} />} />
          <Route path="notas" element={<NotasTrabajo user={user} />} /> {/* RUTA AÑADIDA */}
          <Route path="cierres" element={<Cierres user={user} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;