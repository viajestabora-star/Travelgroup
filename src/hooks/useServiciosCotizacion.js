import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { fromDb } from '../lib/serviciosCotizacionAdapter'
import { queryKeys } from '../lib/queryKeys'

export const useServiciosCotizacion = ({
  cotizacionId = null,
  idExpediente = null,
  proveedores  = [],
} = {}) => {
  const queryKey = cotizacionId
    ? queryKeys.cotizaciones.servicios.all(cotizacionId)
    : queryKeys.expedientes.servicios.all(idExpediente)

  const enabled = !!(cotizacionId || idExpediente)

  return useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      let query = supabase
        .from('servicios_cotizacion')
        .select('*')
        .order('created_at', { ascending: true })

      if (cotizacionId) {
        query = query.eq('cotizacion_id', cotizacionId)
      } else {
        query = query.eq('id_expediente', idExpediente)
      }

      const { data, error } = await query

      if (error) throw error

      return data.map((row) => fromDb(row, proveedores))
    },
    staleTime: 60_000,
  })
}
