import React, { useState, useEffect, useRef } from 'react'
import { X, Save, Plus, Trash2, CheckCircle } from 'lucide-react'
import { supabase } from '../supabase'
import ProveedorForm from './ProveedorForm'

/** Sanitización de números: cualquier valor no numérico → 0 (para cálculos financieros) */
const toNum = (v) => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number' && !isNaN(v)) return v
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

const normalizarTipo = (tipo) => {
  if (!tipo) return ''
  return tipo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

const normalizarText = (text) => {
  if (!text) return ''
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

const generarUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const DEFAULT_SERVICE_VALUES = {
  id: null,
  proveedorId: null,
  proveedorNombreTemporal: '',
  mayorista_id: null,
  tipo: 'Hotel',
  tipo_servicio: 'Hotel',
  tipo_calculo: 'porPersona',
  nombreEspecifico: '',
  localizacion: '',
  especificacion_destino: '',
  coste_unitario: 0,
  total_servicio_manual: 0,
  margen: 0,
  noches: 1,
  dias_guia: 1,
  cantidad: 1,
  fechaRelease: '',
  releasePagado: false,
}

const finalizarCalculoModulo = (servicio, paxPago = 31, paxTotal = 35) => {
  const s = servicio || {}
  const pP = Math.max(1, toNum(paxPago))
  const pT = Math.max(1, toNum(paxTotal))
  const precio = toNum(s.coste_unitario)
  const n = Math.max(1, toNum(s.noches))
  const d = Math.max(1, toNum(s.dias_guia))
  const manual = toNum(s.total_servicio_manual)
  const tipoNorm = normalizarTipo(s?.tipo_servicio || s?.tipo || '')
  const esPorGrupo = s?.tipo_calculo === 'porGrupo' || s?.tipo_calculo === 'Total a dividir'
  const esAutobusOTransporte = tipoNorm === 'autobus' || tipoNorm === 'transporte'

  let totalFinal = 0
  let costePorPersona = 0

  if (esAutobusOTransporte || esPorGrupo) {
    totalFinal = manual > 0 ? manual : (tipoNorm === 'guia' || tipoNorm === 'g' ? precio * Math.max(1, toNum(s.cantidad ?? d)) : precio)
    costePorPersona = pP > 0 ? totalFinal / pP : 0
  } else {
    const factor = (tipoNorm === 'hotel') ? n : (tipoNorm === 'guia' || tipoNorm === 'g' ? d : 1)
    costePorPersona = precio * factor
    totalFinal = costePorPersona * pT
  }
  return { ...s, coste_pax: Number(costePorPersona.toFixed(2)), total_servicio: Number(totalFinal.toFixed(2)) }
}

/**
 * ServiciosCotizacionPanel
 * Gestiona la tabla de servicios de cotización: añadir, editar, eliminar, guardar en Supabase.
 */
const ServiciosCotizacionPanel = ({
  expediente,
  expedienteId,
  servicios,
  setServicios,
  proveedores,
  paxPago,
  totalPax,
  onRefresh,
  cargarProveedores,
  persistirCambios,
  isSaving,
  setIsSaving,
}) => {
  const [busquedaProveedor, setBusquedaProveedor] = useState({})
  const [mostrarSugerencias, setMostrarSugerencias] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [nombreNuevoProveedor, setNombreNuevoProveedor] = useState('')
  const [tipoNuevoProveedor, setTipoNuevoProveedor] = useState('hotel')
  const [servicioIdParaProveedor, setServicioIdParaProveedor] = useState(null)

  const serviciosInicializados = useRef(false)

  const handleFocus = (e) => e.target.select()
  const handleWheel = (e) => e.target.blur()

  const mapearTipoServicioAProveedor = (tipoServicio) => {
    const mapa = {
      Hotel: 'hotel', Mayorista: 'mayorista', Restaurante: 'restaurante', Autobús: 'autobus',
      Transporte: 'transporte', Guía: 'guia', 'Guía Local': 'guialocal', 'Entradas/Tickets': 'entradas',
      Seguro: 'seguro', Otros: 'otros'
    }
    return mapa[tipoServicio] || normalizarTipo(tipoServicio)
  }

  const obtenerProveedorPorId = (id) => proveedores.find(p => p.id === id)

  const abrirModalProveedor = (inputValue, tipoServicioActual, servicioId) => {
    const nombreLimpio = inputValue?.trim() || ''
    const tipoProveedor = tipoServicioActual ? mapearTipoServicioAProveedor(tipoServicioActual) : 'hotel'
    setNombreNuevoProveedor(nombreLimpio)
    setTipoNuevoProveedor(tipoProveedor)
    setServicioIdParaProveedor(servicioId)
    setShowModal(true)
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-provider-combobox]')) {
        setMostrarSugerencias({})
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    const id = expedienteId || expediente?.id
    if (!id) return

    const cargarServicios = async () => {
      try {
        let serviciosResponse = await supabase
          .from('servicios_cotizacion')
          .select('*')
          .eq('id_expediente', String(id).trim())
          .order('created_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })

        if (serviciosResponse.error && (serviciosResponse.error.code === 'PGRST204' || String(serviciosResponse.error.message || '').includes('created_at'))) {
          serviciosResponse = await supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', String(id).trim())
            .order('id', { ascending: true })
        }

        if (serviciosResponse.data && Array.isArray(serviciosResponse.data) && serviciosResponse.data.length > 0) {
          const busquedaProveedoresRestaurada = {}
          const todosMapeados = serviciosResponse.data.map(row => {
            const proveedorIdInt = row.proveedor_id_int ? Number(row.proveedor_id_int) : null
            if (proveedorIdInt && !isNaN(proveedorIdInt) && proveedorIdInt > 0) {
              const proveedorEncontrado = proveedores.find(p => {
                const proveedorIdLista = Number(p.id)
                return !isNaN(proveedorIdLista) && proveedorIdLista === proveedorIdInt
              })
              if (proveedorEncontrado) busquedaProveedoresRestaurada[row.id] = proveedorEncontrado.nombreComercial
            }
            if (!busquedaProveedoresRestaurada[row.id] && row.nombre_proveedor_manual) {
              busquedaProveedoresRestaurada[row.id] = row.nombre_proveedor_manual
            }

            const coste = toNum(row.coste_unitario ?? row.precio_venta)
            const esPorGrupo = row.tipo_calculo === 'Total a dividir' || row.tipo_calculo === 'porGrupo'
            return {
              ...DEFAULT_SERVICE_VALUES,
              id: row.id || generarUUID(),
              proveedorId: proveedorIdInt,
              proveedorNombreTemporal: row.nombre_proveedor_manual || '',
              tipo: row.tipo_servicio || row.tipo || 'Hotel',
              tipo_servicio: row.tipo_servicio || row.tipo || 'Hotel',
              nombreEspecifico: row.nombre_especifico || '',
              localizacion: row.localizacion || '',
              especificacion_destino: row.especificacion_destino || '',
              coste_unitario: coste,
              total_servicio_manual: esPorGrupo ? coste : 0,
              tipo_calculo: esPorGrupo ? 'porGrupo' : 'porPersona',
              margen: toNum(row.margen_pax),
              noches: Math.max(1, toNum(row.noches)),
              dias_guia: toNum(row.dias_guia) || Math.max(1, toNum(row.noches)),
              cantidad: Math.max(1, toNum(row.cantidad ?? row.dias_guia ?? row.noches ?? 1)),
              fechaRelease: row.fecha_release ? String(row.fecha_release).split('T')[0] : '',
              releasePagado: !!row.release_pagado,
              mayorista_id: (row.mayorista_id != null && row.mayorista_id !== '') ? (typeof row.mayorista_id === 'string' && row.mayorista_id.includes('-') ? row.mayorista_id : String(row.mayorista_id)) : null,
            }
          })

          const tieneProveedor = (r) => r.proveedorId != null || (r.proveedorNombreTemporal && String(r.proveedorNombreTemporal).trim())
          const tieneNombreServicio = (r) => r.nombreEspecifico && String(r.nombreEspecifico).trim()
          const tieneTipo = (r) => r.tipo && String(r.tipo).trim()
          const tieneImporte = (r) => r.coste_unitario != null && Number(r.coste_unitario) > 0
          const tieneTotalManual = (r) => r.total_servicio_manual != null && Number(r.total_servicio_manual) > 0
          const tieneDatos = (r) => tieneProveedor(r) || tieneNombreServicio(r) || tieneImporte(r) || tieneTotalManual(r) || tieneTipo(r)
          const serviciosMapeados = todosMapeados.filter(tieneDatos)

          const idsEnBD = new Set((serviciosResponse.data || []).map(row => row.id))
          setServicios(prev => {
            const serviciosNuevos = prev.filter(s => s.id && !idsEnBD.has(s.id))
            return [...serviciosMapeados, ...serviciosNuevos]
          })
          setBusquedaProveedor(busquedaProveedoresRestaurada)
          serviciosInicializados.current = true
        } else {
          setServicios([])
          serviciosInicializados.current = false
        }
      } catch (_) {}
    }

    cargarServicios()
  }, [expedienteId || expediente?.id, proveedores])

  const añadirServicio = () => {
    const nuevoServicio = {
      ...DEFAULT_SERVICE_VALUES,
      id: generarUUID(),
      tipo: 'Hotel',
      tipo_calculo: 'porPersona',
    }
    setServicios(prev => [...prev, nuevoServicio])
    /* Persistence via manual Guardar button */
  }

  const seleccionarMayoristaYCrearHotel = (servicioId, proveedorId, nombreProveedor) => {
    const servicioActual = servicios.find(s => s.id === servicioId)
    const nuevoHotel = {
      ...DEFAULT_SERVICE_VALUES,
      id: generarUUID(),
      tipo: 'Hotel',
      mayorista_id: proveedorId,
      tipo_calculo: 'porPersona',
    }
    setServicios(prev => {
      const idx2 = prev.findIndex(s => s.id === servicioId)
      if (idx2 < 0) return prev
      const actualizado = prev.map(s => s.id === servicioId ? { ...s, proveedorId } : s)
      return [...actualizado.slice(0, idx2 + 1), nuevoHotel, ...actualizado.slice(idx2 + 1)]
    })
    setBusquedaProveedor(prev => ({ ...prev, [servicioId]: nombreProveedor }))
    setMostrarSugerencias(prev => ({ ...prev, [servicioId]: false }))
    /* Persistence via manual Guardar button */
  }

  const eliminarServicio = async (id) => {
    const servicio = servicios.find(s => s.id === id)
    const nombre = servicio?.descripcion || servicio?.tipo || 'este servicio'
    const esMayorista = servicio?.tipo === 'Mayorista'
    const mensajeConfirm = esMayorista
      ? '¿Estás seguro de que quieres borrar este servicio? También se eliminará el Hotel vinculado a este mayorista.'
      : `¿Estás seguro de que quieres borrar el servicio "${nombre}"?\n\nEsta acción no se puede deshacer.`

    if (!window.confirm(mensajeConfirm)) return

    const idsAEliminar = [id]
    if (esMayorista && servicio?.proveedorId) {
      const hotelesVinculados = servicios.filter(s => s.tipo === 'Hotel' && s.mayorista_id != null && String(s.mayorista_id) === String(servicio.proveedorId))
      hotelesVinculados.forEach(h => idsAEliminar.push(h.id))
    }

    /* DB delete happens on manual Guardar (delete-then-insert) */
    setServicios(servicios.filter(s => !idsAEliminar.includes(s.id)))
    const busquedaActualizada = { ...busquedaProveedor }
    idsAEliminar.forEach(idElim => delete busquedaActualizada[idElim])
    setBusquedaProveedor(busquedaActualizada)
  }

  const calcularTotalFilaUI = (servicio) => {
    const s = { ...DEFAULT_SERVICE_VALUES, ...servicio }
    const tipoNorm = normalizarTipo(s.tipo || s.tipo_servicio || '')
    const precioCoste = toNum(s.coste_unitario)
    if (tipoNorm === 'guia' || tipoNorm === 'g') {
      const cantidad = Math.max(1, toNum(s.cantidad ?? s.dias_guia ?? 1))
      return precioCoste * cantidad
    }
    const fila = {
      ...s,
      tipo_calculo: s.tipo_calculo === 'porGrupo' || s.tipo_calculo === 'Total a dividir' ? 'porGrupo' : 'porPersona',
      coste_unitario: precioCoste,
      total_servicio_manual: toNum(s.total_servicio_manual),
    }
    const { total_servicio } = finalizarCalculoModulo(fila, paxPago, totalPax)
    return toNum(total_servicio)
  }

  const actualizarServicio = (id, campoOrUpdates, valorOrOpts, opts = {}) => {
    const isMulti = typeof campoOrUpdates === 'object' && campoOrUpdates !== null && !Array.isArray(campoOrUpdates)
    const updates = isMulti ? campoOrUpdates : { [campoOrUpdates]: valorOrOpts }
    const serviciosActualizados = servicios.map(s => (s.id === id ? { ...s, ...updates } : s))
    setServicios(serviciosActualizados)
    /* No auto-save on blur: all persistence via manual Guardar button to avoid focus loss and save loops */
  }

  const buildDatosParaSupabase = (servicio) => {
    const nochesFinal = Math.max(1, toNum(servicio?.noches))
    const tipoCalc = servicio?.tipo_calculo === 'porGrupo' || servicio?.tipo_calculo === 'Total a dividir' ? 'porGrupo' : 'porPersona'
    const precioUnitario = toNum(servicio?.coste_unitario)
    const fila = {
      ...servicio,
      tipo_calculo: tipoCalc,
      tipo_servicio: servicio?.tipo_servicio || servicio?.tipo || '',
      coste_unitario: precioUnitario,
      noches: nochesFinal,
      dias_guia: toNum(servicio?.dias_guia) || nochesFinal,
      total_servicio_manual: toNum(servicio?.total_servicio_manual) || 0,
    }
    const calculado = finalizarCalculoModulo(fila, paxPago, totalPax)
    const totalServicio = toNum(calculado?.total_servicio)
    let proveedorIdLimpio = null
    if (servicio?.proveedorId != null) {
      const idRaw = typeof servicio.proveedorId === 'object' ? servicio.proveedorId?.id : servicio.proveedorId
      const num = idRaw != null ? Number(idRaw) : NaN
      proveedorIdLimpio = !isNaN(num) ? num : null
    }
    const tipoNorm = normalizarTipo(servicio?.tipo || '')
    const cantidadGuia = Math.max(1, toNum(servicio?.cantidad ?? servicio?.dias_guia ?? nochesFinal))
    const totalServicioFinal = (tipoNorm === 'guia' || tipoNorm === 'g')
      ? toNum(precioUnitario) * cantidadGuia
      : toNum(totalServicio)
    return {
      id_expediente: String(expediente?.id ?? '').trim(),
      tipo_servicio: servicio?.tipo || 'Hotel',
      nombre_especifico: servicio?.nombreEspecifico || '',
      localizacion: servicio?.localizacion || '',
      especificacion_destino: (servicio?.especificacion_destino && String(servicio.especificacion_destino).trim()) || null,
      coste_unitario: toNum(precioUnitario),
      total_servicio: totalServicioFinal,
      precio_venta: toNum(precioUnitario),
      margen_pax: toNum(servicio?.margen),
      noches: nochesFinal,
      dias_guia: (tipoNorm === 'guia' || tipoNorm === 'g') ? cantidadGuia : nochesFinal,
      cantidad: (tipoNorm === 'guia' || tipoNorm === 'g') ? cantidadGuia : Math.max(1, toNum(servicio?.noches ?? 1)),
      fecha_release: servicio?.fechaRelease || null,
      release_pagado: !!servicio?.releasePagado,
      tipo_calculo: tipoCalc === 'porGrupo' ? 'Total a dividir' : 'porPersona',
      proveedor_id_int: proveedorIdLimpio,
      nombre_proveedor_manual: (servicio?.proveedorNombreTemporal && String(servicio.proveedorNombreTemporal).trim()) || null,
      mayorista_id: (() => {
        const v = servicio?.mayorista_id
        if (v == null || v === '' || v === undefined) return null
        const str = String(v)
        const esUuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
        return esUuidValido ? str : null
      })(),
    }
  }

  /** Delete-then-insert for servicios_cotizacion to avoid 406 errors. Called only from manual Guardar. */
  const guardarTodosServiciosEnSupabase = async () => {
    const id = expedienteId || expediente?.id
    if (!id || !servicios?.length) return { ok: true }

    try {
      const { error: deleteError } = await supabase
        .from('servicios_cotizacion')
        .delete()
        .eq('id_expediente', String(id).trim())

      if (deleteError) {
        alert('Error al guardar servicios. Inténtalo de nuevo.')
        return { ok: false }
      }

      const rowsToInsert = servicios.map((s) => {
        const datos = buildDatosParaSupabase(s)
        return {
          ...datos,
          id: s.id && typeof s.id === 'string' && s.id.length > 10 ? s.id : generarUUID(),
        }
      })

      const { data, error: insertError } = await supabase
        .from('servicios_cotizacion')
        .insert(rowsToInsert)
        .select('id')

      if (insertError) {
        alert('No se pudieron guardar los servicios. Inténtalo de nuevo.')
        return { ok: false }
      }

      if (data && Array.isArray(data) && data.length === servicios.length) {
        setServicios((prev) =>
          prev.map((s, i) => (data[i]?.id ? { ...s, id: data[i].id } : s))
        )
      }
      if (typeof onRefresh === 'function') onRefresh()
      return { ok: true }
    } catch (_) {
      alert('No se pudieron guardar los servicios. Inténtalo de nuevo.')
      return { ok: false }
    }
  }

  const marcarReleaseComoPagadoServicio = (servicioId) => {
    if (!servicioId) return
    if (!window.confirm('¿Estás seguro de que quieres marcar este release como pagado?')) return
    actualizarServicio(servicioId, 'releasePagado', true)
    /* Persistence via manual Guardar button */
  }

  const handleGuardar = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const resultadoForm = await persistirCambios()
      const resultadoServicios = await guardarTodosServiciosEnSupabase()
      if (resultadoForm?.ok && resultadoServicios?.ok) {
        alert('✅ Cotización guardada correctamente')
      } else if (!resultadoForm?.ok) {
        alert('No se pudo guardar. Inténtalo de nuevo.')
      } else if (!resultadoServicios?.ok) {
        alert('No se pudieron guardar los servicios. Inténtalo de nuevo.')
      }
    } catch {
      alert('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h3 className="text-xl font-bold text-navy-900">Servicios del Viaje</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleGuardar}
              disabled={isSaving}
              className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 text-sm disabled:opacity-60"
            >
              <Save size={16} />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {servicios.length === 0 ? (
          <div className="space-y-4">
            <p className="text-center text-gray-500 py-8">No hay servicios añadidos</p>
            <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              <Plus size={20} />
              Añadir Primer Servicio
            </button>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full whitespace-nowrap" style={{ tableLayout: 'fixed', minWidth: '860px' }}>
                <colgroup>
                  <col style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }} />
                  <col style={{ width: '170px', minWidth: '170px', maxWidth: '170px' }} />
                  <col style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} />
                  <col style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }} />
                  <col style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }} />
                  <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                  <col style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} />
                  <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                  <col style={{ width: '40px', minWidth: '40px', maxWidth: '40px' }} />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '160px' }}>Servicio</th>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '170px' }}>Proveedor</th>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '130px' }}>Detalle</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '50px' }}>Cant.</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '70px' }}>Precio</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '120px' }}>Modo</th>
                    <th className="px-1 py-2 text-right text-xs font-semibold text-gray-700" style={{ width: '90px' }}>Total</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '120px' }}>Release</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((servicio, idx) => (
                    <tr key={servicio.id || `svc-${idx}`} className="border-t border-gray-200 hover:bg-gray-50 whitespace-nowrap">
                      <td className="px-1 py-2 align-middle" onClick={(e) => e.stopPropagation()} style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }}>
                        <select
                          value={servicio.tipo}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation()
                            const nuevoTipo = e.target.value
                            const updates = { tipo: nuevoTipo }
                            if (nuevoTipo === 'Autobús' || nuevoTipo === 'Transporte') {
                              updates.tipo_calculo = 'porGrupo'
                              if (servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                            }
                            if (servicio.proveedorId) {
                              const proveedorActual = obtenerProveedorPorId(servicio.proveedorId)
                              const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                              const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                              if (tipoProveedorActual !== nuevoTipoProveedor) {
                                updates.proveedorId = null
                                setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                              }
                            }
                            actualizarServicio(servicio.id, updates)
                            setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: true }))
                          }}
                          className="input-field text-xs transition-all"
                          style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '158px', minWidth: '158px', maxWidth: '158px' }}
                          onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                            actualizarServicio(servicio.id, 'tipo', e.target.value)
                          }}
                        >
                          <option>Hotel</option>
                          <option>Mayorista</option>
                          <option>Restaurante</option>
                          <option>Autobús</option>
                          <option>Transporte</option>
                          <option>Guía</option>
                          <option>Guía Local</option>
                          <option>Entradas/Tickets</option>
                          <option>Seguro</option>
                          <option>Otros</option>
                        </select>
                      </td>

                      <td className="px-1 py-2 align-middle" onClick={(e) => e.stopPropagation()} style={{ width: '170px', minWidth: '170px', maxWidth: '170px' }}>
                        <div className="relative" data-provider-combobox>
                          <div className="flex flex-row gap-1 items-center flex-nowrap" style={{ width: '170px' }}>
                            <div className="relative flex-shrink-0 flex-1 min-w-0" style={{ width: '170px', minWidth: '170px', maxWidth: '170px' }}>
                              <input
                                type="text"
                                value={busquedaProveedor[servicio.id] !== undefined ? busquedaProveedor[servicio.id] : (obtenerProveedorPorId(servicio.proveedorId)?.nombreComercial || '')}
                                onChange={(e) => {
                                  const inputValue = e.target.value
                                  setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: inputValue })
                                  setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                }}
                                onFocus={(e) => {
                                  setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                  if (!busquedaProveedor[servicio.id]) setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                  e.target.style.borderColor = '#3b82f6'
                                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                }}
                                placeholder="Pendiente"
                                className="input-field text-xs w-full pr-8 transition-all"
                                style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                onBlur={(e) => {
                                  e.target.style.borderColor = '#e2e8f0'
                                  e.target.style.boxShadow = 'none'
                                  setTimeout(() => {
                                    setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: false }))
                                    if (!servicio.proveedorId && busquedaProveedor[servicio.id]) {
                                      setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                                    }
                                  }, 120)
                                }}
                              />
                              {(busquedaProveedor[servicio.id] || servicio.proveedorId) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                                    actualizarServicio(servicio.id, 'proveedorId', null)
                                    setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: false }))
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10 transition-colors"
                                  title="Limpiar"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {mostrarSugerencias[servicio.id] && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {(() => {
                                const tipoProveedorBuscado = mapearTipoServicioAProveedor(servicio.tipo)
                                const textoBusqueda = (busquedaProveedor[servicio.id] || '').toLowerCase().trim()
                                const proveedoresFiltrados = proveedores
                                  .filter(p => {
                                    const tipoProveedorNormalizado = normalizarText(p.tipo || '')
                                    const tipoBuscadoNormalizado = normalizarText(tipoProveedorBuscado || '')
                                    const coincideTipo = tipoProveedorNormalizado === tipoBuscadoNormalizado
                                    if (!textoBusqueda) return coincideTipo
                                    const coincideNombre = (p.nombreComercial || '').toLowerCase().includes(textoBusqueda)
                                    return coincideTipo && coincideNombre
                                  })
                                  .sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || ''))

                                return (
                                  <>
                                    {proveedoresFiltrados.length === 0 && !textoBusqueda && (
                                      <div className="px-3 py-3 text-xs text-center">
                                        <p className="text-gray-600 mb-2">No hay proveedores de <strong>{servicio.tipo}</strong></p>
                                        <p className="text-green-600 font-medium">💡 Usa el botón + para añadir uno nuevo</p>
                                      </div>
                                    )}
                                    {proveedoresFiltrados.length === 0 && textoBusqueda && (
                                      <div className="px-3 py-3 text-xs text-center">
                                        <p className="text-gray-600 mb-2">No se encontró &quot;{busquedaProveedor[servicio.id]}&quot; en {servicio.tipo}</p>
                                        <p className="text-green-600 font-medium">➕ Usa el botón + para crear nuevo proveedor</p>
                                      </div>
                                    )}
                                    {proveedoresFiltrados.length > 0 && (
                                      <div className="py-1">
                                        {proveedoresFiltrados.map((proveedor, pidx) => (
                                          <button
                                            key={proveedor.id || `prov-${pidx}`}
                                            type="button"
                                            onMouseDown={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              if (servicio.tipo === 'Mayorista') {
                                                seleccionarMayoristaYCrearHotel(servicio.id, proveedor.id, proveedor.nombreComercial)
                                              } else {
                                                actualizarServicio(servicio.id, 'proveedorId', proveedor.id)
                                                setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: proveedor.nombreComercial })
                                                setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false })
                                              }
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                                          >
                                            <span className="font-medium text-navy-900">{proveedor.nombreComercial}</span>
                                            {proveedor.telefono && <span className="text-gray-500">· {proveedor.telefono}</span>}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-1 py-2 align-middle" onClick={(e) => e.stopPropagation()} style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }}>
                        <div className="flex flex-row items-center gap-1 flex-nowrap" style={{ width: '130px' }}>
                          {(servicio.tipo === 'Guía Local' || servicio.tipo === 'Entradas/Tickets') && (
                            <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap flex-shrink-0">de </span>
                          )}
                          <input
                            type="text"
                            value={servicio.especificacion_destino || ''}
                            onChange={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                            placeholder={servicio.tipo === 'Guía Local' ? 'ej. Santiago' : servicio.tipo === 'Entradas/Tickets' ? 'ej. Catedral' : 'Detalle...'}
                            className="input-field text-xs py-1.5 px-2 flex-1 min-w-0"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1 1 0', minWidth: 0 }}
                          />
                          <button
                            type="button"
                            onClick={() => abrirModalProveedor(busquedaProveedor[servicio.id] || '', servicio.tipo, servicio.id)}
                            className="flex-shrink-0 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-colors"
                            style={{ width: '32px', minWidth: '32px' }}
                            title="Añadir nuevo proveedor"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </td>

                      <td className="px-1 py-2 align-middle" style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }}>
                        <div className="flex justify-center">
                          {servicio.tipo === 'Hotel' ? (
                            <input
                              type="number"
                              value={servicio.noches || 1}
                              onChange={(e) => {
                                const valor = e.target.value
                                const valorNumerico = valor === '' ? 1 : Number(valor) || 1
                                actualizarServicio(servicio.id, 'noches', Math.max(1, valorNumerico))
                              }}
                              onWheel={handleWheel}
                              onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                              onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0'
                                e.target.style.boxShadow = 'none'
                                const valor = e.target.value
                                const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1)
                                actualizarServicio(servicio.id, 'noches', valorNumerico)
                              }}
                              className="input-field text-xs text-center transition-all"
                              style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '50px', minWidth: '50px', maxWidth: '50px' }}
                              min="1"
                              placeholder="1"
                            />
                          ) : servicio.tipo === 'Guía' ? (
                            <input
                              type="number"
                              value={servicio.cantidad ?? servicio.dias_guia ?? 1}
                              onChange={(e) => {
                                const valor = e.target.value
                                const valorNumerico = valor === '' ? 1 : Number(valor) || 1
                                actualizarServicio(servicio.id, 'cantidad', Math.max(1, valorNumerico))
                              }}
                              onWheel={handleWheel}
                              onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0'
                                e.target.style.boxShadow = 'none'
                                const valor = e.target.value
                                const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1)
                                actualizarServicio(servicio.id, 'cantidad', valorNumerico)
                              }}
                              onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                              className="input-field text-xs text-center transition-all"
                              style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '50px', minWidth: '50px', maxWidth: '50px' }}
                              min="1"
                              placeholder="1"
                            />
                          ) : (
                            <span className="text-gray-600 text-xs font-medium">1</span>
                          )}
                        </div>
                      </td>

                      <td className="px-1 py-2 align-middle" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>
                        <div className="flex justify-end">
                          <input
                            type="number"
                            step="0.01"
                            value={servicio.coste_unitario === '' || servicio.coste_unitario == null ? '' : servicio.coste_unitario}
                            onWheel={handleWheel}
                            onChange={(e) => {
                              const valorInput = e.target.value
                              if (valorInput === '' || valorInput === '-') {
                                actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                  ? { coste_unitario: '', total_servicio_manual: '' }
                                  : { coste_unitario: '' })
                                return
                              }
                              const valorLimpio = valorInput.replace(/,/g, '.')
                              const valorNumerico = parseFloat(valorLimpio)
                              if (!isNaN(valorNumerico)) {
                                actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                  ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico }
                                  : { coste_unitario: valorNumerico })
                              } else {
                                actualizarServicio(servicio.id, 'coste_unitario', valorLimpio)
                              }
                            }}
                            onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            onBlur={(e) => {
                              const valor = e.target.value
                              if (valor !== '' && valor !== '-') {
                                const valorNumerico = parseFloat(valor.replace(/,/g, '.'))
                                if (!isNaN(valorNumerico)) {
                                  actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                    ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico }
                                    : { coste_unitario: valorNumerico })
                                }
                              } else {
                                actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                  ? { coste_unitario: 0, total_servicio_manual: 0 }
                                  : { coste_unitario: 0 })
                              }
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                            }}
                            className="input-field text-xs text-right w-full transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '70px', minWidth: '70px', maxWidth: '70px' }}
                            placeholder="0.00"
                            min="0"
                          />
                        </div>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                        {(servicio.tipo === 'Autobús' || servicio.tipo === 'Transporte') ? (
                          <span className="text-xs font-medium text-slate-600" title="Autobús/Transporte siempre divide el total entre pasajeros de pago">Total ÷ pax</span>
                        ) : (
                          <select
                            value={servicio.tipo_calculo || 'porPersona'}
                            onChange={(e) => {
                              const nuevoModo = e.target.value
                              const updates = { tipo_calculo: nuevoModo }
                              if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                              else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0
                              actualizarServicio(servicio.id, updates)
                            }}
                            className="input-field text-[10px] transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '120px', minWidth: '120px', maxWidth: '120px' }}
                            onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            onBlur={(e) => {
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                              const nuevoModo = e.target.value
                              const updates = { tipo_calculo: nuevoModo }
                              if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                              else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0
                              actualizarServicio(servicio.id, updates)
                            }}
                          >
                            <option value="porPersona">X pax</option>
                            <option value="porGrupo">÷ Todos</option>
                          </select>
                        )}
                      </td>

                      <td className="px-1 py-2 align-middle text-right" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                        <span className="text-gray-900 text-xs font-semibold whitespace-nowrap">{calcularTotalFilaUI(servicio).toFixed(2)}€</span>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="date"
                            value={servicio.fechaRelease || ''}
                            onChange={(e) => actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '')}
                            onFocus={(e) => { e.target.select(); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            onBlur={(e) => {
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                              actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '')
                            }}
                            className="input-field text-center transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '4px 4px', width: '120px', minWidth: '120px', maxWidth: '120px', fontSize: '11px' }}
                          />
                          {!servicio.releasePagado && servicio.fechaRelease && (
                            <button type="button" onClick={() => marcarReleaseComoPagadoServicio(servicio.id)} className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold" style={{ fontSize: '16px' }} title="Marcar como pagado"><CheckCircle size={12} /> Pagado</button>
                          )}
                          {servicio.releasePagado && (
                            <span className="text-green-600 font-semibold flex items-center gap-1" style={{ fontSize: '16px' }}><CheckCircle size={12} /> Pagado</span>
                          )}
                        </div>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '40px', minWidth: '40px', maxWidth: '40px' }}>
                        <button onClick={() => eliminarServicio(servicio.id)} className="text-red-600 hover:text-red-900 p-1" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-4">
              {servicios.map((servicio, idx) => (
                <div key={servicio.id || `svc-${idx}`} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Servicio</span>
                    <button onClick={() => eliminarServicio(servicio.id)} className="text-red-600 hover:text-red-900 p-1" title="Eliminar"><Trash2 size={16} /></button>
                  </div>
                  <div>
                    <select
                      value={servicio.tipo}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation()
                        const nuevoTipo = e.target.value
                        const updates = { tipo: nuevoTipo }
                        if (nuevoTipo === 'Autobús' || nuevoTipo === 'Transporte') {
                          updates.tipo_calculo = 'porGrupo'
                          if (servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                        }
                        if (servicio.proveedorId) {
                          const proveedorActual = obtenerProveedorPorId(servicio.proveedorId)
                          const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                          const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                          if (tipoProveedorActual !== nuevoTipoProveedor) {
                            updates.proveedorId = null
                            setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                          }
                        }
                        actualizarServicio(servicio.id, updates)
                        setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: true }))
                      }}
                      className="input-field text-xs w-full transition-all"
                      style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                      onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                        actualizarServicio(servicio.id, 'tipo', e.target.value)
                      }}
                    >
                      <option>Hotel</option>
                      <option>Mayorista</option>
                      <option>Restaurante</option>
                      <option>Autobús</option>
                      <option>Transporte</option>
                      <option>Guía</option>
                      <option>Guía Local</option>
                      <option>Entradas/Tickets</option>
                      <option>Seguro</option>
                      <option>Otros</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Proveedor</span>
                    <div className="relative" data-provider-combobox onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-row gap-2 items-center flex-nowrap">
                        <div className="relative flex-shrink-0 min-w-0" style={{ minWidth: '80px', maxWidth: '120px' }}>
                          <input
                            type="text"
                            value={busquedaProveedor[servicio.id] !== undefined ? busquedaProveedor[servicio.id] : (obtenerProveedorPorId(servicio.proveedorId)?.nombreComercial || '')}
                            onChange={(e) => { const inputValue = e.target.value; setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: inputValue }); setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true }) }}
                            onFocus={(e) => { setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true }); if (!busquedaProveedor[servicio.id]) setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' }); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            placeholder="Pendiente"
                            className="input-field text-xs w-full pr-8 transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                            onBlur={(e) => {
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                              setTimeout(() => {
                                setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: false }))
                                if (!servicio.proveedorId && busquedaProveedor[servicio.id]) setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                              }, 120)
                            }}
                          />
                          {(busquedaProveedor[servicio.id] || servicio.proveedorId) && (
                            <button onClick={() => { setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' }); actualizarServicio(servicio.id, 'proveedorId', null); setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false }) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10" title="Limpiar"><X size={14} /></button>
                          )}
                        </div>
                        <div className="flex flex-row items-center gap-1 min-w-0 flex-1">
                          {(servicio.tipo === 'Guía Local' || servicio.tipo === 'Entradas/Tickets') && <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">de </span>}
                          <input
                            type="text"
                            value={servicio.especificacion_destino || ''}
                            onChange={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                            placeholder={servicio.tipo === 'Guía Local' ? 'ej. Santiago' : servicio.tipo === 'Entradas/Tickets' ? 'ej. Catedral' : 'Detalle...'}
                            className="input-field text-xs flex-1 min-w-0 py-1.5 px-2"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                          />
                        </div>
                        <button type="button" onClick={() => abrirModalProveedor(busquedaProveedor[servicio.id] || '', servicio.tipo, servicio.id)} className="flex-shrink-0 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-colors" title="Añadir nuevo proveedor"><Plus size={16} /></button>
                      </div>
                      {mostrarSugerencias[servicio.id] && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                          {(() => {
                            const tipoProveedorBuscado = mapearTipoServicioAProveedor(servicio.tipo)
                            const textoBusqueda = (busquedaProveedor[servicio.id] || '').toLowerCase().trim()
                            const proveedoresFiltrados = proveedores.filter(p => {
                              const tipoProveedorNormalizado = normalizarText(p.tipo || '')
                              const tipoBuscadoNormalizado = normalizarText(tipoProveedorBuscado || '')
                              const coincideTipo = tipoProveedorNormalizado === tipoBuscadoNormalizado
                              if (!textoBusqueda) return coincideTipo
                              const coincideNombre = (p.nombreComercial || '').toLowerCase().includes(textoBusqueda)
                              return coincideTipo && coincideNombre
                            }).sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || ''))
                            return (
                              <>
                                {proveedoresFiltrados.length === 0 && !textoBusqueda && <div className="px-3 py-3 text-xs text-center"><p className="text-gray-600 mb-2">No hay proveedores de <strong>{servicio.tipo}</strong></p><p className="text-green-600 font-medium">💡 Usa el botón + para añadir uno nuevo</p></div>}
                                {proveedoresFiltrados.length === 0 && textoBusqueda && <div className="px-3 py-3 text-xs text-center"><p className="text-gray-600 mb-2">No se encontró &quot;{busquedaProveedor[servicio.id]}&quot; en {servicio.tipo}</p><p className="text-green-600 font-medium">➕ Usa el botón + para crear nuevo proveedor</p></div>}
                                {proveedoresFiltrados.length > 0 && (
                                  <div className="py-1">
                                    {proveedoresFiltrados.map((proveedor, pidx) => (
                                      <button key={proveedor.id || `prov-${pidx}`} type="button" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (servicio.tipo === 'Mayorista') { seleccionarMayoristaYCrearHotel(servicio.id, proveedor.id, proveedor.nombreComercial); } else { actualizarServicio(servicio.id, 'proveedorId', proveedor.id); setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: proveedor.nombreComercial }); setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false }); } }} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b border-gray-100 transition-colors">
                                        <span className="font-medium text-navy-900">{proveedor.nombreComercial}</span>
                                        {proveedor.telefono && <span className="text-gray-500">· {proveedor.telefono}</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Cantidad</span>
                      {servicio.tipo === 'Hotel' ? (
                        <input type="number" value={servicio.noches || 1} onChange={(e) => { const valor = e.target.value; const valorNumerico = valor === '' ? 1 : Number(valor) || 1; actualizarServicio(servicio.id, 'noches', Math.max(1, valorNumerico)) }} onWheel={handleWheel} onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; const valor = e.target.value; const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1); actualizarServicio(servicio.id, 'noches', valorNumerico) }} className="input-field text-xs text-center w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} min="1" placeholder="1" />
                      ) : servicio.tipo === 'Guía' ? (
                        <input type="number" value={servicio.cantidad ?? servicio.dias_guia ?? 1} onChange={(e) => { const valor = e.target.value; const valorNumerico = valor === '' ? 1 : Number(valor) || 1; actualizarServicio(servicio.id, 'cantidad', Math.max(1, valorNumerico)) }} onWheel={handleWheel} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; const valor = e.target.value; const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1); actualizarServicio(servicio.id, 'cantidad', valorNumerico) }} onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} className="input-field text-xs text-center w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} min="1" placeholder="1" />
                      ) : (
                        <span className="text-gray-600 text-xs font-medium block py-2">1</span>
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Precio</span>
                      <input type="number" step="0.01" value={servicio.coste_unitario === '' || servicio.coste_unitario == null ? '' : servicio.coste_unitario} onWheel={handleWheel} onChange={(e) => { const valorInput = e.target.value; if (valorInput === '' || valorInput === '-') { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: '', total_servicio_manual: '' } : { coste_unitario: '' }); return; } const valorLimpio = valorInput.replace(/,/g, '.'); const valorNumerico = parseFloat(valorLimpio); if (!isNaN(valorNumerico)) { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico } : { coste_unitario: valorNumerico }); } else { actualizarServicio(servicio.id, 'coste_unitario', valorLimpio); } }} onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { const valor = e.target.value; if (valor !== '' && valor !== '-') { const valorNumerico = parseFloat(valor.replace(/,/g, '.')); if (!isNaN(valorNumerico)) { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico } : { coste_unitario: valorNumerico }); } } else { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: 0, total_servicio_manual: 0 } : { coste_unitario: 0 }); } e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} className="input-field text-xs text-right w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} placeholder="0.00" min="0" />
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Modo</span>
                    {(servicio.tipo === 'Autobús' || servicio.tipo === 'Transporte') ? (
                      <span className="text-xs font-medium text-slate-600">Total ÷ pax</span>
                    ) : (
                      <select value={servicio.tipo_calculo || 'porPersona'} onChange={(e) => { const nuevoModo = e.target.value; const updates = { tipo_calculo: nuevoModo }; if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario); else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0; actualizarServicio(servicio.id, updates); }} className="input-field text-xs w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; const nuevoModo = e.target.value; const updates = { tipo_calculo: nuevoModo }; if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario); else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0; actualizarServicio(servicio.id, updates); }}>
                        <option value="porPersona">X pax</option>
                        <option value="porGrupo">÷ Todos</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Total</span>
                    <span className="text-gray-900 text-sm font-semibold">{calcularTotalFilaUI(servicio).toFixed(2)}€</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Release</span>
                    <input type="date" value={servicio.fechaRelease || ''} onChange={(e) => actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '')} onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '') }} className="input-field w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '6px 8px', fontSize: '16px' }} />
                    {!servicio.releasePagado && servicio.fechaRelease && (
                      <button type="button" onClick={() => marcarReleaseComoPagadoServicio(servicio.id)} className="mt-2 flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold w-full justify-center" style={{ fontSize: '16px' }}><CheckCircle size={14} /> Marcar como Pagado</button>
                    )}
                    {servicio.releasePagado && (
                      <span className="mt-2 text-green-600 font-semibold flex items-center gap-1" style={{ fontSize: '16px' }}><CheckCircle size={14} /> Pagado</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                <Plus size={20} />
                Añadir Servicio
              </button>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-md flex items-center justify-center z-[9999] p-6 text-left"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-navy-900">Nuevo Proveedor</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-4 bg-slate-100 rounded-full hover:bg-red-500 hover:text-white transition-all">
                <X size={32} />
              </button>
            </div>
            <ProveedorForm
              initialData={{ nombre_comercial: nombreNuevoProveedor, tipo: tipoNuevoProveedor }}
              submitLabel="Guardar y Seleccionar"
              onCancel={() => setShowModal(false)}
              onSaved={async (nuevoProveedor) => {
                await cargarProveedores?.()
                if (servicioIdParaProveedor) {
                  const nombre = nuevoProveedor.nombreComercial || nuevoProveedor.nombre_comercial || ''
                  actualizarServicio(servicioIdParaProveedor, 'proveedorId', nuevoProveedor.id)
                  setBusquedaProveedor(prev => ({ ...prev, [servicioIdParaProveedor]: nombre }))
                  setMostrarSugerencias(prev => ({ ...prev, [servicioIdParaProveedor]: false }))
                }
                setShowModal(false)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default ServiciosCotizacionPanel
