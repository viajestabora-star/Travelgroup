import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import ServiciosCotizacionPanel from './ServiciosCotizacionPanel'

const toNum = (v) => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number' && !isNaN(v)) return v
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

const esUuidProveedorFk = (v) =>
  v != null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v).trim())

/** Resuelve proveedorId de fila BD hacia el id de catálogo (UUID preferido). */
const proveedorIdDesdeFilaDb = (row, proveedores) => {
  if (row.proveedor_id != null && String(row.proveedor_id).trim() !== '' && esUuidProveedorFk(row.proveedor_id)) {
    return String(row.proveedor_id).trim()
  }
  const intv = row.proveedor_id_int ? Number(row.proveedor_id_int) : null
  if (!intv || isNaN(intv) || intv <= 0) return null
  const p = (proveedores || []).find((pr) => {
    const pn = Number(pr.id)
    if (!isNaN(pn) && pn === intv) return true
    const pint = pr.id_int != null ? Number(pr.id_int) : NaN
    return !isNaN(pint) && pint === intv
  })
  return p?.id != null ? p.id : intv
}

/** Si el catálogo llega después del fetch, sustituye proveedorId numérico por UUID del proveedor. */
const normalizarProveedorIdsEnServicios = (lista, proveedores) => {
  if (!Array.isArray(lista) || lista.length === 0) return lista
  let changed = false
  const next = lista.map((s) => {
    const id = s?.proveedorId
    if (id == null || id === '') return s
    if (esUuidProveedorFk(id)) return s
    const intv = Number(id)
    if (isNaN(intv) || intv <= 0) return s
    const p = (proveedores || []).find((pr) => {
      const pn = Number(pr.id)
      if (!isNaN(pn) && pn === intv) return true
      const pint = pr.id_int != null ? Number(pr.id_int) : NaN
      return !isNaN(pint) && pint === intv
    })
    if (p?.id != null && esUuidProveedorFk(p.id)) {
      changed = true
      return { ...s, proveedorId: String(p.id).trim() }
    }
    return s
  })
  return changed ? next : lista
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

/**
 * TablaServiciosVariante - Contenedor estanco por variante.
 * key={indiceActivo} fuerza remontaje al cambiar pestaña; cada variante tiene datos independientes.
 * Carga desde versiones_json[indiceActivo].servicios; si vacío, carga desde expediente (servicios_cotizacion).
 */
const TablaServiciosVariante = ({
  indiceActivo,
  versiones,
  onVersionesChange,
  expedienteId,
  proveedores = [],
  paxPago,
  totalPax,
  onRefresh,
  cargarProveedores,
  persistirCambios,
  guardarCotizacionYServiciosRef,
  isSaving,
  setIsSaving,
  expediente,
}) => {
  const servsIniciales = versiones[indiceActivo]?.servicios ?? []
  const [servicios, setServiciosLocal] = useState(() =>
    Array.isArray(servsIniciales) ? [...servsIniciales] : []
  )
  const cargadoDesdeExpedienteRef = useRef(false)

  const setServiciosParaVariante = (nuevosOrUpdater) => {
    const arr = typeof nuevosOrUpdater === 'function'
      ? nuevosOrUpdater(servicios)
      : nuevosOrUpdater
    const final = Array.isArray(arr) ? arr : []
    setServiciosLocal(final)
    onVersionesChange(prev => prev.map((v, i) =>
      i === indiceActivo ? { ...v, servicios: [...final] } : v
    ))
  }

  useEffect(() => {
    cargadoDesdeExpedienteRef.current = false
  }, [expedienteId, indiceActivo])

  useEffect(() => {
    if (!Array.isArray(proveedores) || proveedores.length === 0) return
    setServiciosLocal((prev) => {
      const next = normalizarProveedorIdsEnServicios(prev, proveedores)
      if (next === prev) return prev
      onVersionesChange((vers) =>
        vers.map((v, i) => (i === indiceActivo ? { ...v, servicios: [...next] } : v))
      )
      return next
    })
  }, [proveedores, indiceActivo, onVersionesChange])

  useEffect(() => {
    if (!expedienteId || cargadoDesdeExpedienteRef.current) return
    const servs = versiones[indiceActivo]?.servicios ?? []
    if (Array.isArray(servs) && servs.length > 0) return

    const cargarDesdeExpediente = async () => {
      try {
        let res = await supabase
          .from('servicios_cotizacion')
          .select('*')
          .eq('id_expediente', String(expedienteId).trim())
          .eq('empresa_id', 1)
          .order('orden', { ascending: true })
          .order('created_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })

        if (res.error && (res.error.code === 'PGRST204' || String(res.error?.message || '').includes('created_at'))) {
          res = await supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', String(expedienteId).trim())
            .eq('empresa_id', 1)
            .order('orden', { ascending: true })
            .order('id', { ascending: true })
        }

        const data = res.data
        if (!data || !Array.isArray(data) || data.length === 0) return

        const tieneDatos = (r) => {
          const tieneProveedor = (x) => x.proveedorId != null || (x.proveedorNombreTemporal && String(x.proveedorNombreTemporal).trim())
          const tieneNombreServicio = (x) => x.nombreEspecifico && String(x.nombreEspecifico).trim()
          const tieneTipo = (x) => x.tipo && String(x.tipo).trim()
          const tieneImporte = (x) => x.coste_unitario != null && Number(x.coste_unitario) > 0
          const tieneTotalManual = (x) => x.total_servicio_manual != null && Number(x.total_servicio_manual) > 0
          return tieneProveedor(r) || tieneNombreServicio(r) || tieneImporte(r) || tieneTotalManual(r) || tieneTipo(r)
        }

        const mapeados = data.map(row => {
          const coste = (v) => toNum(v)
          const proveedorId = proveedorIdDesdeFilaDb(row, proveedores)
          const c = coste(row.coste_unitario ?? row.precio_venta)
          const esPorGrupo = row.tipo_calculo === 'Total a dividir' || row.tipo_calculo === 'porGrupo'
          return {
            ...DEFAULT_SERVICE_VALUES,
            id: row.id || generarUUID(),
            proveedorId,
            proveedorNombreTemporal: row.nombre_proveedor_manual || '',
            tipo: row.tipo_servicio || row.tipo || 'Hotel',
            tipo_servicio: row.tipo_servicio || row.tipo || 'Hotel',
            nombreEspecifico: row.nombre_especifico || '',
            localizacion: row.localizacion || '',
            especificacion_destino: row.especificacion_destino || '',
            coste_unitario: c,
            total_servicio_manual: esPorGrupo ? c : 0,
            tipo_calculo: esPorGrupo ? 'porGrupo' : 'porPersona',
            margen: coste(row.margen_pax),
            noches: Math.max(1, coste(row.noches)),
            dias_guia: coste(row.dias_guia) || Math.max(1, coste(row.noches)),
            cantidad: Math.max(1, coste(row.cantidad ?? row.dias_guia ?? row.noches ?? 1)),
            fechaRelease: row.fecha_release ? String(row.fecha_release).split('T')[0] : '',
            releasePagado: !!row.release_pagado,
            mayorista_id: (row.mayorista_id != null && row.mayorista_id !== '') ? (typeof row.mayorista_id === 'string' && row.mayorista_id.includes('-') ? row.mayorista_id : String(row.mayorista_id)) : null,
          }
        }).filter(tieneDatos)

        if (mapeados.length > 0) {
          setServiciosLocal(mapeados)
          onVersionesChange(prev => prev.map((v, i) =>
            i === indiceActivo ? { ...v, servicios: [...mapeados] } : v
          ))
        }
        cargadoDesdeExpedienteRef.current = true
      } catch (_) {}
    }

    cargarDesdeExpediente()
  }, [expedienteId, indiceActivo, proveedores])

  return (
    <ServiciosCotizacionPanel
      expediente={expediente}
      expedienteId={expedienteId}
      servicios={servicios}
      setServicios={setServiciosParaVariante}
      multicotizacionMode={true}
      proveedores={proveedores}
      paxPago={paxPago}
      totalPax={totalPax}
      onRefresh={onRefresh}
      cargarProveedores={cargarProveedores}
      persistirCambios={persistirCambios}
      guardarCotizacionYServiciosRef={guardarCotizacionYServiciosRef}
      isSaving={isSaving}
      setIsSaving={setIsSaving}
    />
  )
}

export default TablaServiciosVariante
