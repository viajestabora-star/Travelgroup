import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabase';
import { useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useEmpresa } from '../context/EmpresaContext';
import { empresaIdSesionValido } from '../utils/tenantEmpresa';
import { assertFilaPersistida, empresaIdNumericoOThrow, toIsoDateOnly } from '../utils/supabasePersistenciaCerteza';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const hashStringHue = (s) => {
  let h = 0
  const str = String(s || '')
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) - h) + str.charCodeAt(i)
  return Math.abs(h) % 360
}

const NotasTrabajo = ({ user, expedienteId = null }) => {
  const location = useLocation();
  // Obtener expediente_id de props o del estado de navegación
  const expedienteIdFromState = location?.state?.expedienteId;
  const expedienteIdFinal = expedienteId || expedienteIdFromState;
  // Deep-link: open a specific note's edit form on mount (from Dashboard widget click)
  const notaIdFromState = location?.state?.notaId || null;

  const [notas, setNotas] = useState([]);
  const [editando, setEditando] = useState(null);
  const [nuevaNota, setNuevaNota] = useState({ 
    titulo: '', 
    contenido: '', 
    fecha_plazo: '', 
    destinatario: 'Todos',
    estado: 'Pendiente' 
  });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardandoNota, setGuardandoNota] = useState(false);
  const { empresaId } = useEmpresa();
  const empresaIdRequerido = empresaIdSesionValido(user, empresaId);
  // Estado para manejar respuestas por cada nota
  const [respuestasTexto, setRespuestasTexto] = useState({});
  const [respondiendo, setRespondiendo] = useState({});
  // Estado para filtrar notas (Pendientes por defecto)
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);
  // Estado para notas que están siendo completadas (para animación)
  const [notasCompletando, setNotasCompletando] = useState(new Set());
  const [notasOcultas, setNotasOcultas] = useState(new Set());
  /** Perfiles del mismo tenant (selector "Para quién"); id = auth user id (UUID). */
  const [perfilesDestinatario, setPerfilesDestinatario] = useState([]);

  const perfilesPorId = useMemo(() => {
    const m = new Map()
    ;(perfilesDestinatario || []).forEach((p) => {
      if (p?.id) m.set(String(p.id), p)
    })
    return m
  }, [perfilesDestinatario])

  const resolverEtiquetaDestinatario = useCallback(
    (valor) => {
      if (!valor || valor === 'Todos') return 'Todos'
      const id = String(valor)
      if (UUID_RE.test(id)) {
        const p = perfilesPorId.get(id)
        return p?.nombre?.trim() || id
      }
      const porNombre = perfilesDestinatario.find(
        (x) => String(x.nombre || '').trim().toLowerCase() === String(valor).trim().toLowerCase(),
      )
      return porNombre?.nombre?.trim() || String(valor)
    },
    [perfilesDestinatario, perfilesPorId],
  )

  const normalizarNotaParaEdicion = useCallback(
    (nota) => {
      if (!nota) return nota
      let dest = nota.destinatario || 'Todos'
      if (dest !== 'Todos' && !UUID_RE.test(dest)) {
        const m = perfilesDestinatario.find(
          (p) => String(p.nombre || '').trim().toLowerCase() === String(dest).trim().toLowerCase(),
        )
        if (m) dest = m.id
      }
      return { ...nota, destinatario: dest }
    },
    [perfilesDestinatario],
  )

  useEffect(() => {
    const cargarPerfilesMismaEmpresa = async () => {
      if (!empresaIdRequerido) {
        setPerfilesDestinatario([])
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, empresa_id')
        .eq('empresa_id', empresaIdRequerido)
        .order('nombre', { ascending: true, nullsFirst: false })
      if (error) {
        console.error('[Notas] profiles destinatarios:', error.message)
        setPerfilesDestinatario([])
        return
      }
      // Filtro defensivo: descartar cualquier perfil cuyo empresa_id difiera del tenant activo.
      const rows = (Array.isArray(data) ? data : []).filter((p) => {
        if (p.empresa_id != null && Number(p.empresa_id) !== Number(empresaIdRequerido)) {
          console.error('[Notas][SEGURIDAD] Perfil de otra empresa excluido del selector:', p)
          return false
        }
        return true
      })
      setPerfilesDestinatario(rows)
    }
    cargarPerfilesMismaEmpresa()
  }, [empresaIdRequerido])

  // Cargar notas desde Supabase
  useEffect(() => {
    cargarNotas();
  }, [mostrarCompletadas, empresaIdRequerido]);

  // Deep-link: when arriving from Dashboard with a notaId, open that note for editing.
  // Runs whenever notas loads (cargando flips to false) and a target ID is present.
  useEffect(() => {
    if (cargando || !notaIdFromState) return;
    if (editando && editando.id !== notaIdFromState) return;

    const notaObjetivo = notas.find(n => n.id === notaIdFromState);
    if (notaObjetivo) {
      setEditando(normalizarNotaParaEdicion(notaObjetivo));
      // Scroll the form into view after React paints
      setTimeout(() => {
        document.getElementById('nota-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      // The note may be Completado — fetch it directly so the form still opens
      supabase.from('notas').select('*').eq('id', notaIdFromState).single()
        .then(({ data }) => {
          if (data) setEditando(normalizarNotaParaEdicion(data))
        });
    }
  }, [cargando, notaIdFromState, notas, editando, normalizarNotaParaEdicion]);

  const cargarNotas = async () => {
    try {
      setCargando(true);
      
      // Construir query base
      let query = supabase
        .from('notas')
        .select('*')
        .is('expediente_id', null); // Solo notas generales (sin expediente asociado)

      if (empresaIdRequerido) {
        query = query.eq('empresa_id', empresaIdRequerido);
      }
      
      // Filtrar por estado según la vista activa
      if (!mostrarCompletadas) {
        query = query.eq('estado', 'Pendiente');
      } else {
        query = query.eq('estado', 'Completado');
      }
      
      // Ordenar por fecha_plazo descendente
      const { data, error } = await query.order('fecha_plazo', { ascending: false });

      if (error) {
        setNotas([]);
      } else {
        setNotas(data || []);
      }
    } catch (error) {
      setNotas([]);
    } finally {
      setCargando(false);
    }
  };

  const manejarGuardado = async () => {
    if (guardandoNota) return;
    setGuardandoNota(true);
    try {
      let tenantId;
      try {
        tenantId = empresaIdNumericoOThrow(empresaIdRequerido);
      } catch (e) {
        alert(e?.message || 'No hay empresa en sesión; no se puede guardar la nota.');
        return;
      }

      let destinatarioFinal = (editando ? editando.destinatario : nuevaNota.destinatario) || 'Todos'

      if (destinatarioFinal !== 'Todos') {
        if (!UUID_RE.test(destinatarioFinal)) {
          const porNombre = perfilesDestinatario.find(
            (p) => String(p.nombre || '').trim().toLowerCase() === String(destinatarioFinal).trim().toLowerCase(),
          )
          if (porNombre) destinatarioFinal = porNombre.id
          else {
            alert('El destinatario seleccionado no es válido. Elige un usuario de tu empresa en "Para quién".')
            return
          }
        }
        const { data: profOk, error: errProf } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', destinatarioFinal)
          .eq('empresa_id', tenantId)
          .maybeSingle()
        if (errProf || !profOk?.id) {
          alert('El usuario destinatario no pertenece a tu empresa o no existe. Revisa "Para quién".')
          return
        }
      }

      if (editando) {
        const fechaPlazoIso = editando.fecha_plazo ? toIsoDateOnly(editando.fecha_plazo) : null;
        const datosActualizar = {
          expediente_id: null,
          titulo: editando.titulo || '',
          contenido: editando.contenido || '',
          destinatario: destinatarioFinal,
          estado: editando.estado || 'Pendiente',
          fecha_plazo: fechaPlazoIso,
          empresa_id: tenantId,
        };

        const result = await supabase
          .from('notas')
          .update(datosActualizar)
          .eq('id', editando.id)
          .select()
          .single();

        try {
          assertFilaPersistida(result);
        } catch (err) {
          alert(`Error al actualizar la nota: ${err.message}`);
          return;
        }

        setEditando(null);
      } else {
        const fechaPlazoIso = nuevaNota.fecha_plazo ? toIsoDateOnly(nuevaNota.fecha_plazo) : null;
        const notaParaGuardar = {
          expediente_id: null,
          titulo: nuevaNota.titulo || '',
          contenido: nuevaNota.contenido || '',
          destinatario: destinatarioFinal,
          estado: nuevaNota.estado || 'Pendiente',
          fecha_plazo: fechaPlazoIso,
          empresa_id: tenantId,
        };

        const result = await supabase
          .from('notas')
          .insert([notaParaGuardar])
          .select()
          .single();

        try {
          assertFilaPersistida(result);
        } catch (err) {
          alert(`Error al guardar la nota: ${err.message}`);
          return;
        }

        setMostrarForm(false);
        setNuevaNota({
          titulo: '',
          contenido: '',
          fecha_plazo: '',
          destinatario: 'Todos',
          estado: 'Pendiente',
        });
      }

      await cargarNotas();
    } catch (error) {
      alert(`Error inesperado: ${error.message}`);
    } finally {
      setGuardandoNota(false);
    }
  };

  const eliminarNota = async (id) => {
    if (!window.confirm('¿Estás seguro de que quieres borrar esta nota permanentemente?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('notas')
        .delete()
        .eq('id', id);

      if (error) {
        alert(`Error al eliminar la nota: ${error.message}`);
        return;
      }

      await cargarNotas();
    } catch (error) {
      alert(`Error inesperado: ${error.message}`);
    }
  };

  const getColorBorde = (destinatario) => {
    const dest = destinatario || 'Todos'
    if (!dest || dest === 'Todos') return '#9ca3af'
    const hue = hashStringHue(dest)
    return `hsl(${hue} 52% 42%)`
  }

  // Obtener nombre del usuario logueado
  const obtenerNombreUsuario = () => {
    // Intentar obtener el nombre del usuario desde diferentes fuentes
    if (user?.nombre) return user.nombre;
    if (user?.name) return user.name;
    if (user?.email) {
      // Extraer nombre del email si es posible
      const emailPart = user.email.split('@')[0];
      return emailPart.charAt(0).toUpperCase() + emailPart.slice(1);
    }
    // Fallback: intentar desde localStorage
    const usuarioGuardado = localStorage.getItem('user');
    if (usuarioGuardado) {
      try {
        const parsed = JSON.parse(usuarioGuardado);
        return parsed.nombre || parsed.name || 'Usuario';
      } catch (e) {
        return 'Usuario';
      }
    }
    return 'Usuario';
  };

  // Función para agregar respuesta a una nota
  const agregarRespuesta = async (notaId) => {
    const textoRespuesta = respuestasTexto[notaId]?.trim();
    if (!textoRespuesta) {
      alert('Por favor, escribe una respuesta');
      return;
    }

    try {
      setRespondiendo(prev => ({ ...prev, [notaId]: true }));

      // Obtener la nota actual
      const notaActual = notas.find(n => n.id === notaId);
      if (!notaActual) {
        alert('Error: No se encontró la nota');
        return;
      }

      // Crear nueva respuesta
      const nuevaRespuesta = {
        autor: obtenerNombreUsuario(),
        texto: textoRespuesta,
        fecha: new Date().toISOString()
      };

      // Obtener respuestas existentes o inicializar array vacío
      const respuestasExistentes = Array.isArray(notaActual.respuestas) 
        ? notaActual.respuestas 
        : [];

      // Agregar nueva respuesta
      const respuestasActualizadas = [...respuestasExistentes, nuevaRespuesta];

      // Actualización optimista: actualizar estado local inmediatamente
      setNotas(prevNotas => 
        prevNotas.map(nota => 
          nota.id === notaId 
            ? { ...nota, respuestas: respuestasActualizadas }
            : nota
        )
      );

      // Limpiar campo de texto
      setRespuestasTexto(prev => ({ ...prev, [notaId]: '' }));

      const result = await supabase
        .from('notas')
        .update({ respuestas: respuestasActualizadas })
        .eq('id', notaId)
        .select()
        .single();

      try {
        assertFilaPersistida(result);
      } catch (error) {
        setNotas(prevNotas =>
          prevNotas.map(nota =>
            nota.id === notaId
              ? { ...nota, respuestas: respuestasExistentes }
              : nota
          )
        );
        alert(`Error al guardar la respuesta: ${error.message}`);
        return;
      }

    } catch (error) {
      alert(`Error inesperado: ${error.message}`);
    } finally {
      setRespondiendo(prev => ({ ...prev, [notaId]: false }));
    }
  };

  // Función para completar una nota
  const completarNota = async (notaId) => {
    try {
      // Marcar como completando para animación
      setNotasCompletando(prev => new Set(prev).add(notaId));

      const result = await supabase
        .from('notas')
        .update({ estado: 'Completado' })
        .eq('id', notaId)
        .select()
        .single();

      try {
        assertFilaPersistida(result);
      } catch (error) {
        alert(`Error al completar la nota: ${error.message}`);
        setNotasCompletando(prev => {
          const nuevo = new Set(prev);
          nuevo.delete(notaId);
          return nuevo;
        });
        return;
      }

      // Esperar un momento para la animación
      setTimeout(() => {
        // Ocultar la nota con animación
        setNotasOcultas(prev => new Set(prev).add(notaId));
        
        // Después de la animación, recargar notas
        setTimeout(() => {
          setNotasCompletando(prev => {
            const nuevo = new Set(prev);
            nuevo.delete(notaId);
            return nuevo;
          });
          setNotasOcultas(prev => {
            const nuevo = new Set(prev);
            nuevo.delete(notaId);
            return nuevo;
          });
          cargarNotas();
        }, 300); // Tiempo de animación
      }, 100);
    } catch (error) {
      alert(`Error inesperado: ${error.message}`);
      setNotasCompletando(prev => {
        const nuevo = new Set(prev);
        nuevo.delete(notaId);
        return nuevo;
      });
    }
  };

  // Función para formatear fecha de respuesta
  const formatearFechaRespuesta = (fechaISO) => {
    try {
      const fecha = new Date(fechaISO);
      const ahora = new Date();
      const diffMs = ahora - fecha;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Ahora mismo';
      if (diffMins < 60) return `Hace ${diffMins} min`;
      if (diffHours < 24) return `Hace ${diffHours} h`;
      if (diffDays < 7) return `Hace ${diffDays} días`;
      
      return fecha.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (e) {
      return fechaISO;
    }
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
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900">📋 Tablón de Notas Compartidas</h2>
          <button
            onClick={() => setMostrarCompletadas(!mostrarCompletadas)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mostrarCompletadas
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {mostrarCompletadas ? '← Ver Pendientes' : '✓ Ver Completadas'}
          </button>
        </div>
        {!mostrarCompletadas && (
          <button 
            onClick={() => setMostrarForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-2"
          >
            + Crear Nueva Nota
          </button>
        )}
      </div>

      {/* FORMULARIO */}
      {(mostrarForm || editando) && (
        <div id="nota-edit-form" className="bg-gray-50 p-6 rounded-xl border-2 border-blue-500 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input 
              type="text" 
              placeholder="Título/Cliente" 
              value={editando ? editando.titulo : nuevaNota.titulo} 
              onChange={e => editando ? setEditando({...editando, titulo: e.target.value}) : setNuevaNota({...nuevaNota, titulo: e.target.value})} 
              className="p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <input 
              type="date" 
              placeholder="Fecha/Plazo" 
              value={editando ? editando.fecha_plazo : nuevaNota.fecha_plazo} 
              onChange={e => editando ? setEditando({...editando, fecha_plazo: e.target.value}) : setNuevaNota({...nuevaNota, fecha_plazo: e.target.value})} 
              className="p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <textarea 
              placeholder="Contenido/Detalles..." 
              value={editando ? editando.contenido : nuevaNota.contenido} 
              onChange={e => editando ? setEditando({...editando, contenido: e.target.value}) : setNuevaNota({...nuevaNota, contenido: e.target.value})} 
              className="col-span-1 md:col-span-2 p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 min-h-[80px]"
            />
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Para quién</label>
              <select 
                value={editando ? editando.destinatario : nuevaNota.destinatario} 
                onChange={e => editando ? setEditando({...editando, destinatario: e.target.value}) : setNuevaNota({...nuevaNota, destinatario: e.target.value})} 
                className="w-full p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white"
              >
                <option value="Todos">Todos</option>
                {perfilesDestinatario.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre?.trim() || 'Sin nombre'}
                  </option>
                ))}
                {editando?.destinatario
                  && editando.destinatario !== 'Todos'
                  && UUID_RE.test(String(editando.destinatario))
                  && !perfilesPorId.has(String(editando.destinatario)) && (
                  <option value={editando.destinatario}>
                    (Ya no en tu empresa — elige otro o Todos)
                  </option>
                )}
              </select>
              {!empresaIdRequerido && (
                <p className="text-xs text-amber-600 mt-1">Inicia sesión con una empresa asignada para elegir destinatarios.</p>
              )}
            </div>
            <select 
              value={editando ? editando.estado : nuevaNota.estado} 
              onChange={e => editando ? setEditando({...editando, estado: e.target.value}) : setNuevaNota({...nuevaNota, estado: e.target.value})} 
              className="p-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="Pendiente">🔴 Pendiente</option>
              <option value="Completado">🟢 Completado</option>
            </select>
          </div>
          <div className="mt-4 flex gap-3">
            <button 
              type="button"
              onClick={manejarGuardado} 
              disabled={guardandoNota}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {guardandoNota ? 'Guardando…' : 'Guardar'}
            </button>
            <button 
              type="button"
              onClick={() => {
                setMostrarForm(false);
                setEditando(null);
              }} 
              disabled={guardandoNota}
              className="bg-gray-400 hover:bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* RENDERIZADO DE NOTAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {notas
          .filter(nota => !notasOcultas.has(nota.id))
          .map(nota => {
          const colorBorde = getColorBorde(nota.destinatario)
          const chipBg =
            nota.destinatario === 'Todos' || !nota.destinatario
              ? '#f3f4f6'
              : `hsl(${hashStringHue(nota.destinatario)} 42% 93%)`
          const estaCompletando = notasCompletando.has(nota.id);
          return (
            <div 
              key={nota.id} 
              className={`bg-white p-4 rounded-xl shadow-md border-l-4 transition-all hover:shadow-lg ${
                estaCompletando ? 'opacity-0 scale-95 transform transition-all duration-300' : 'opacity-100 scale-100'
              }`}
              style={{ borderLeftColor: colorBorde }}
            >
              <div className="text-xs text-gray-500 flex justify-between items-center mb-2">
                <span>ID: {nota.id}</span>
                <div className="flex gap-2 items-center">
                  {!mostrarCompletadas && nota.estado === 'Pendiente' && (
                    <>
                      <button
                        onClick={() => completarNota(nota.id)}
                        disabled={estaCompletando}
                        className="flex items-center gap-1 text-green-600 hover:text-green-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Marcar como completada"
                      >
                        <CheckCircle2 size={16} />
                        <span>Completar</span>
                      </button>
                      <span className="text-gray-300">|</span>
                    </>
                  )}
                  <button 
                    type="button"
                    onClick={() => setEditando(normalizarNotaParaEdicion(nota))} 
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
                    backgroundColor: chipBg,
                    color: (nota.destinatario === 'Todos' || !nota.destinatario)
                      ? '#6b7280'
                      : colorBorde
                  }}
                >
                  Para: {resolverEtiquetaDestinatario(nota.destinatario)}
                </span>
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">{nota.titulo || 'Sin título'}</h4>
              <p className="text-sm text-gray-700 mb-3">{nota.contenido || 'Sin contenido'}</p>
              
              {/* HILO DE RESPUESTAS */}
              {Array.isArray(nota.respuestas) && nota.respuestas.length > 0 && (
                <div className="mt-3 mb-3 border-t border-gray-200 pt-3">
                  <div className="space-y-2">
                    {nota.respuestas.map((respuesta, idx) => {
                      const colorAutor = getColorBorde(respuesta.autor);
                      return (
                        <div 
                          key={idx} 
                          className="ml-4 pl-3 border-l-2 border-gray-200"
                          style={{ borderLeftColor: colorAutor }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span 
                              className="text-xs font-semibold"
                              style={{ color: colorAutor }}
                            >
                              {respuesta.autor}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatearFechaRespuesta(respuesta.fecha)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{respuesta.texto}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CAMPO DE RESPUESTA */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Escribe una respuesta..."
                    value={respuestasTexto[nota.id] || ''}
                    onChange={(e) => setRespuestasTexto(prev => ({ 
                      ...prev, 
                      [nota.id]: e.target.value 
                    }))}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        agregarRespuesta(nota.id);
                      }
                    }}
                    className="flex-1 text-sm p-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                  />
                  <button
                    onClick={() => agregarRespuesta(nota.id)}
                    disabled={respondiendo[nota.id] || !respuestasTexto[nota.id]?.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {respondiendo[nota.id] ? '...' : 'Responder'}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs mt-3">
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-gray-600">
                    📅 {nota.fecha_plazo ? new Date(nota.fecha_plazo).toLocaleDateString('es-ES') : 'Sin fecha'}
                  </span>
                  <span className="text-gray-500">👤 {resolverEtiquetaDestinatario(nota.destinatario)}</span>
                </div>
                <span className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: nota.estado === 'Pendiente' ? '#fee2e2' : '#d1fae5',
                    color: nota.estado === 'Pendiente' ? '#991b1b' : '#065f46'
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
          <p>
            {mostrarCompletadas 
              ? 'No hay notas completadas aún.' 
              : 'No hay notas pendientes. ¡Crea tu primera nota para comenzar!'}
          </p>
        </div>
      )}
    </div>
  );
};

export default NotasTrabajo;
