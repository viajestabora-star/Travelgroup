import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import ServiciosCotizacionPanel from './ServiciosCotizacionPanel'
import { fromDb, servicioVacio } from '../lib/serviciosCotizacionAdapter'

/**
 * TablaServiciosVariante - Contenedor estanco por variante.
 * key={indiceActivo} fuerza remontaje al cambiar pestaña; cada variante tiene datos independientes.
 * Carga servicios desde versiones[indiceActivo].servicios (estado en memoria); si vacío, carga desde servicios_cotizacion.
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
          const tieneProveedor = (x) => x.proveedor_id != null || (x.proveedorNombreTemporal && String(x.proveedorNombreTemporal).trim())
          const tieneNombreServicio = (x) => x.nombreEspecifico && String(x.nombreEspecifico).trim()
          const tieneTipo = (x) => x.tipo && String(x.tipo).trim()
          const tieneImporte = (x) => x.coste_unitario != null && Number(x.coste_unitario) > 0
          const tieneTotalManual = (x) => x.total_servicio_manual != null && Number(x.total_servicio_manual) > 0
          return tieneProveedor(r) || tieneNombreServicio(r) || tieneImporte(r) || tieneTotalManual(r) || tieneTipo(r)
        }

        const mapeados = data.filter(tieneDatos).map(row => fromDb(row, proveedores))

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
      // Props para sincronización estricta del banner "sin guardar"
      lastSavedVersionesRef={lastSavedVersionesRef}
      lastSavedFormDataRef={lastSavedFormDataRef}
      versiones={versiones}
      formData={formData}
    />
  )
}

export default TablaServiciosVariante
