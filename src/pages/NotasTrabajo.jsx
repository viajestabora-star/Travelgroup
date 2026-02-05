import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const NotasTrabajo = ({ user }) => {
  const [notas, setNotas] = useState([]);
  const [editando, setEditando] = useState(null);
  const [nuevaNota, setNuevaNota] = useState({ 
    cliente: '', 
    detalles: '', 
    cuando: '', 
    destinatario: 'Todos',
    estado: 'Pendiente' 
  });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Colores de borde según destinatario
  const coloresDestinatario = {
    'Todos': '#9ca3af',   // Gris neutro
    'Andres': '#3b82f6',  // Azul
    'Marisa': '#10b981',  // Verde
    'German': '#f59e0b'   // Amarillo/Naranja
  };

  // Cargar notas desde Supabase
  useEffect(() => {
    cargarNotas();
  }, []);

  const cargarNotas = async () => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from('notas_trabajo')
        .select('*')
        .order('fecha_creacion', { ascending: false });

      if (error) {
        console.error('Error cargando notas:', error);
        // Fallback a localStorage si falla Supabase
        const guardadas = localStorage.getItem('notas_tabora_v1');
        if (guardadas) {
          setNotas(JSON.parse(guardadas));
        }
      } else {
        setNotas(data || []);
      }
    } catch (error) {
      console.error('Error fatal cargando notas:', error);
      const guardadas = localStorage.getItem('notas_tabora_v1');
      if (guardadas) {
        setNotas(JSON.parse(guardadas));
      }
    } finally {
      setCargando(false);
    }
  };

  const manejarGuardado = async () => {
    try {
      if (editando) {
        // Actualizar nota existente
        const { error } = await supabase
          .from('notas_trabajo')
          .update({
            cliente: editando.cliente,
            detalles: editando.detalles,
            cuando: editando.cuando,
            destinatario: editando.destinatario,
            estado: editando.estado
          })
          .eq('id', editando.id);

        if (error) {
          console.error('Error actualizando nota:', error);
          alert('Error al actualizar la nota');
          return;
        }

        setEditando(null);
      } else {
        // Crear nueva nota
        const notaParaGuardar = {
          cliente: nuevaNota.cliente,
          detalles: nuevaNota.detalles,
          cuando: nuevaNota.cuando,
          destinatario: nuevaNota.destinatario,
          estado: nuevaNota.estado,
          creado_por: user?.nombre || 'Usuario',
          fecha_creacion: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('notas_trabajo')
          .insert([notaParaGuardar])
          .select()
          .single();

        if (error) {
          console.error('Error guardando nota:', error);
          alert('Error al guardar la nota');
          return;
        }

        setMostrarForm(false);
        setNuevaNota({ 
          cliente: '', 
          detalles: '', 
          cuando: '', 
          destinatario: 'Todos',
          estado: 'Pendiente' 
        });
      }

      // Recargar notas
      await cargarNotas();
    } catch (error) {
      console.error('Error inesperado:', error);
      alert('Error inesperado al guardar');
    }
  };

  const eliminarNota = async (id) => {
    if (!window.confirm('¿Deseas eliminar permanentemente esta nota?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('notas_trabajo')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error eliminando nota:', error);
        alert('Error al eliminar la nota');
        return;
      }

      await cargarNotas();
    } catch (error) {
      console.error('Error inesperado:', error);
      alert('Error inesperado al eliminar');
    }
  };

  const getColorBorde = (destinatario) => {
    // Si no hay destinatario o es null/undefined, usar "Todos" por defecto
    const dest = destinatario || 'Todos';
    return coloresDestinatario[dest] || coloresDestinatario['Todos'];
  };

  if (cargando) {
    return (
      <div className="p-8 max-w-1200 mx-auto">
        <p className="text-gray-600">Cargando notas...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-1200 mx-auto font-sans">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">📋 Tablón de Notas Compartidas</h2>
        <button 
          onClick={() => setMostrarForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-2"
        >
          + Crear Nueva Nota
        </button>
      </div>

      {/* FORMULARIO */}
      {(mostrarForm || editando) && (
        <div className="bg-gray-50 p-6 rounded-xl border-2 border-blue-500 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input 
              type="text" 
              placeholder="Cliente" 
              value={editando ? editando.cliente : nuevaNota.cliente} 
              onChange={e => editando ? setEditando({...editando, cliente: e.target.value}) : setNuevaNota({...nuevaNota, cliente: e.target.value})} 
              className="p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <input 
              type="text" 
              placeholder="Fecha/Plazo" 
              value={editando ? editando.cuando : nuevaNota.cuando} 
              onChange={e => editando ? setEditando({...editando, cuando: e.target.value}) : setNuevaNota({...nuevaNota, cuando: e.target.value})} 
              className="p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <textarea 
              placeholder="Detalles..." 
              value={editando ? editando.detalles : nuevaNota.detalles} 
              onChange={e => editando ? setEditando({...editando, detalles: e.target.value}) : setNuevaNota({...nuevaNota, detalles: e.target.value})} 
              className="col-span-1 md:col-span-2 p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 min-h-[80px]"
            />
            <select 
              value={editando ? editando.destinatario : nuevaNota.destinatario} 
              onChange={e => editando ? setEditando({...editando, destinatario: e.target.value}) : setNuevaNota({...nuevaNota, destinatario: e.target.value})} 
              className="p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="Todos">Todos</option>
              <option value="Marisa">Marisa</option>
              <option value="German">German</option>
              <option value="Andres">Andres</option>
            </select>
            <select 
              value={editando ? editando.estado : nuevaNota.estado} 
              onChange={e => editando ? setEditando({...editando, estado: e.target.value}) : setNuevaNota({...nuevaNota, estado: e.target.value})} 
              className="p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="Pendiente">🔴 Pendiente</option>
              <option value="En Proceso">🟡 En Proceso</option>
              <option value="Finalizada">🟢 Finalizada</option>
            </select>
          </div>
          <div className="mt-4 flex gap-3">
            <button 
              onClick={manejarGuardado} 
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md"
            >
              Guardar
            </button>
            <button 
              onClick={() => {
                setMostrarForm(false);
                setEditando(null);
              }} 
              className="bg-gray-400 hover:bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* RENDERIZADO DE NOTAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {notas.map(nota => {
          const colorBorde = getColorBorde(nota.destinatario);
          return (
            <div 
              key={nota.id} 
              className="bg-white p-4 rounded-xl shadow-md border-l-4 transition-all hover:shadow-lg"
              style={{ borderLeftColor: colorBorde }}
            >
              <div className="text-xs text-gray-500 flex justify-between items-center mb-2">
                <span>Por: {nota.creado_por || nota.creadoPor || 'Usuario'}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setEditando(nota)} 
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Edit
                  </button>
                  <span className="text-gray-300">|</span>
                  <button 
                    onClick={() => eliminarNota(nota.id)} 
                    className="text-red-600 hover:text-red-800 font-medium"
                  >
                    Borrar
                  </button>
                </div>
              </div>
              <div className="mb-2">
                <span 
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{ 
                    backgroundColor: (nota.destinatario === 'Todos' || !nota.destinatario) 
                      ? '#f3f4f6' 
                      : colorBorde + '20',
                    color: (nota.destinatario === 'Todos' || !nota.destinatario)
                      ? '#6b7280'
                      : colorBorde
                  }}
                >
                  Para: {nota.destinatario || 'Todos'}
                </span>
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">{nota.cliente}</h4>
              <p className="text-sm text-gray-700 mb-3">{nota.detalles}</p>
              <div className="flex justify-between items-center text-xs">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-gray-600">📅 {nota.cuando}</span>
                  <span className="text-gray-500">👤 {nota.destinatario || 'Todos'}</span>
                </div>
                <span className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: nota.estado === 'Pendiente' ? '#fee2e2' : 
                                   nota.estado === 'En Proceso' ? '#fef3c7' : '#d1fae5',
                    color: nota.estado === 'Pendiente' ? '#991b1b' : 
                          nota.estado === 'En Proceso' ? '#92400e' : '#065f46'
                  }}
                >
                  {nota.estado || 'Pendiente'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {notas.length === 0 && !cargando && (
        <div className="text-center py-12 text-gray-500">
          <p>No hay notas aún. Crea tu primera nota para comenzar.</p>
        </div>
      )}
    </div>
  );
};

export default NotasTrabajo;
