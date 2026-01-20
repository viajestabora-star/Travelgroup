import React, { useState, useEffect } from 'react';

const NotasTrabajo = ({ user }) => {
  // 1. CARGA INICIAL: Intentar leer lo que hay en el disco
  const [notas, setNotas] = useState(() => {
    try {
      const guardadas = localStorage.getItem('notas_tabora_v1');
      return guardadas ? JSON.parse(guardadas) : [];
    } catch (e) {
      return [];
    }
  });

  const [editando, setEditando] = useState(null);
  const [nuevaNota, setNuevaNota] = useState({ cliente: '', detalles: '', cuando: '', estado: 'NUEVA' });
  const [mostrarForm, setMostrarForm] = useState(false);

  // 2. GUARDADO DE SEGURIDAD: Cada vez que cambien las notas
  useEffect(() => {
    localStorage.setItem('notas_tabora_v1', JSON.stringify(notas));
  }, [notas]);

  const manejarGuardado = () => {
    let nuevasNotas;
    if (editando) {
      nuevasNotas = notas.map(n => n.id === editando.id ? { ...editando } : n);
      setEditando(null);
    } else {
      const notaFinal = { 
        ...nuevaNota, 
        id: Date.now(), 
        creadoPor: user.nombre,
        fechaCreacion: new Date().toLocaleString() 
      };
      nuevasNotas = [...notas, notaFinal];
      setMostrarForm(false);
      setNuevaNota({ cliente: '', detalles: '', cuando: '', estado: 'NUEVA' });
    }
    
    setNotas(nuevasNotas);
    // FORZAR ESCRITURA INMEDIATA (Para que no se pierda al recargar)
    localStorage.setItem('notas_tabora_v1', JSON.stringify(nuevasNotas));
  };

  const eliminarNota = (id) => {
    if (window.confirm('¿Deseas eliminar permanentemente esta nota?')) {
      const filtradas = notas.filter(n => n.id !== id);
      setNotas(filtradas);
      localStorage.setItem('notas_tabora_v1', JSON.stringify(filtradas));
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2>📋 Tablón de Notas Compartidas</h2>
        <button 
          onClick={() => setMostrarForm(true)}
          style={{ background: '#1a73e8', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
        >
          + Crear Nueva Nota
        </button>
      </div>

      {/* FORMULARIO */}
      {(mostrarForm || editando) && (
        <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '2px solid #1a73e8', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <input type="text" placeholder="Cliente" value={editando ? editando.cliente : nuevaNota.cliente} onChange={e => editando ? setEditando({...editando, cliente: e.target.value}) : setNuevaNota({...nuevaNota, cliente: e.target.value})} style={{ padding: '10px' }} />
            <input type="text" placeholder="Fecha/Plazo" value={editando ? editando.cuando : nuevaNota.cuando} onChange={e => editando ? setEditando({...editando, cuando: e.target.value}) : setNuevaNota({...nuevaNota, cuando: e.target.value})} style={{ padding: '10px' }} />
            <textarea placeholder="Detalles..." value={editando ? editando.detalles : nuevaNota.detalles} onChange={e => editando ? setEditando({...editando, detalles: e.target.value}) : setNuevaNota({...nuevaNota, detalles: e.target.value})} style={{ gridColumn: 'span 2', padding: '10px', minHeight: '60px' }} />
            <select value={editando ? editando.estado : nuevaNota.estado} onChange={e => editando ? setEditando({...editando, estado: e.target.value}) : setNuevaNota({...nuevaNota, estado: e.target.value})} style={{ padding: '10px' }}>
              <option value="NUEVA">🔴 NUEVA</option>
              <option value="EN_PROCESO">🟡 EN PROCESO</option>
              <option value="HECHO">🟢 FINALIZADA</option>
            </select>
          </div>
          <div style={{ marginTop: '15px' }}>
            <button onClick={manejarGuardado} style={{ background: '#2ecc71', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginRight: '10px' }}>Guardar</button>
            <button onClick={() => {setMostrarForm(false); setEditando(null)}} style={{ background: '#bdc3c7', padding: '10px 20px', border: 'none', borderRadius: '5px' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* RENDERIZADO DE NOTAS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
        {notas.map(nota => (
          <div key={nota.id} style={{ 
            background: 'white', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            borderLeft: `10px solid ${nota.estado === 'NUEVA' ? '#e74c3c' : nota.estado === 'EN_PROCESO' ? '#f1c40f' : '#2ecc71'}`
          }}>
            <div style={{ fontSize: '0.7rem', color: '#999', display: 'flex', justifyContent: 'space-between' }}>
              <span>Por: {nota.creadoPor}</span>
              <div>
                <button onClick={() => setEditando(nota)} style={{ color: '#1a73e8', border: 'none', background: 'none', cursor: 'pointer' }}>Edit</button> | 
                <button onClick={() => eliminarNota(nota.id)} style={{ color: '#e74c3c', border: 'none', background: 'none', cursor: 'pointer' }}>Borrar</button>
              </div>
            </div>
            <h4 style={{ margin: '10px 0' }}>{nota.cliente}</h4>
            <p style={{ fontSize: '0.9rem', color: '#333' }}>{nota.detalles}</p>
            <div style={{ fontSize: '0.8rem', marginTop: '10px', fontWeight: 'bold' }}>📅 {nota.cuando}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotasTrabajo;