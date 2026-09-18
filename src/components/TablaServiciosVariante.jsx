import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import ServiciosCotizacionPanel from './ServiciosCotizacionPanel'
import { fromDb, servicioVacio } from '../lib/serviciosCotizacionAdapter'

/**
 * TablaServiciosVariante - Contenedor estanco por variante.
 * key={indiceActivo} fuerza remontaje al cambiar pestaña; cada variante tiene datos independientes.
 * Carga servicios desde versiones[indiceActivo].servicios (estado en memoria); si vacío, carga desde servicios_cotizacion.
 */
/**
 * Resuelve el tenant (empresa_id) desde el expediente inyectado por el padre.
 * Misma validación que ServiciosCotizacionPanel.resolverEmpresaIdDesdeExpediente:
 * exige entero positivo antes de cualquier lectura multi-tenant en Supabase.
 */
const resolverEmpresaIdDesdeExpediente = (expediente) => {
  if (expediente == null || typeof expediente !== 'object') {
    throw new Error(
      '[TablaServiciosVariante] Multi-tenant: no hay expediente en contexto; no se puede resolver empresa_id antes de acceder a la base de datos.'
    )
  }
  const raw = expediente.empresa_id ?? expediente.empresa_id_int
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error(
      '[TablaServiciosVariante] Multi-tenant: el expediente no incluye empresa_id ni empresa_id_int.'
    )
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(
      `[TablaServiciosVariante] Multi-tenant: empresa_id del expediente no es un entero positivo válido (recibido: ${String(raw)}).`
    )
  }
  return n
}

const TablaServiciosVariante = ({
  indiceActivo,
  versionId = null,
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
  // Props para sincronización estricta del banner "sin guardar"
  lastSavedVersionesRef,
  lastSavedFormDataRef,
  formData,
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
    if (!expedienteId || cargadoDesdeExpedienteRef.current) return
    const servs = versiones[indiceActivo]?.servicios ?? []
    if (Array.isArray(servs) && servs.length > 0) return

    const cargarDesdeExpediente = async () => {
      try {
        const empresaId = resolverEmpresaIdDesdeExpediente(expediente)
        const baseQuery = () => {
          const q = supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', String(expedienteId).trim())
            .eq('empresa_id', empresaId)
          return versionId ? q.eq('version_id', versionId) : q.is('version_id', null)
        }

        let res = await baseQuery()
          .order('orden', { ascending: true })
          .order('created_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })

        if (res.error && (res.error.code === 'PGRST204' || String(res.error?.message || '').includes('created_at'))) {
          res = await baseQuery()
            .order('orden', { ascending: true })
            .order('id', { ascending: true })
        }

        const data = res.data
        if (!data || !Array.isArray(data) || data.length === 0) return

        const mapeados = data.map(row => fromDb(row, proveedores))

        if (mapeados.length > 0) {
          setServiciosLocal(mapeados)
          onVersionesChange(prev => prev.map((v, i) =>
            i === indiceActivo ? { ...v, servicios: [...mapeados] } : v
          ))
        }
        cargadoDesdeExpedienteRef.current = true
      } catch (err) {
        console.error('[TablaServiciosVariante] Error al cargar servicios desde BD:', err)
      }
    }

    cargarDesdeExpediente()
  }, [expedienteId, indiceActivo, versionId, proveedores, expediente])

  return (
    <ServiciosCotizacionPanel
      expediente={expediente}
      expedienteId={expedienteId}
      versionId={versionId}
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
      // Props para sincronización estricta del banner "sin guardar"
      lastSavedVersionesRef={lastSavedVersionesRef}
      lastSavedFormDataRef={lastSavedFormDataRef}
      versiones={versiones}
      formData={formData}
    />
  )
}

export default TablaServiciosVariante
