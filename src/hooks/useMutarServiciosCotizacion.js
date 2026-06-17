import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { toDb, validarServicio } from '../lib/serviciosCotizacionAdapter'
import { queryKeys } from '../lib/queryKeys'

export const useMutarServiciosCotizacion = ({
  cotizacionId  = null,
  idExpediente  = null,
  empresaId,
}) => {
  const queryClient = useQueryClient()
  const queryKey = cotizacionId
    ? queryKeys.cotizaciones.servicios.all(cotizacionId)
    : queryKeys.expedientes.servicios.all(idExpediente)

  return useMutation({
    mutationFn: async (servicios) => {
      const idCanónico = idExpediente ?? cotizacionId
      const erroresValidacion = []
      servicios.forEach((svc, idx) => {
        const { valido, errores } = validarServicio(svc)
        if (!valido) {
          erroresValidacion.push(`Servicio ${idx + 1} (${svc.tipo}): ${errores.join(', ')}`)
        }
      })
      if (erroresValidacion.length > 0) {
        throw new Error(erroresValidacion.join('\n'))
      }
      const filas = servicios.map((svc) => toDb(svc, idCanónico, empresaId))
      const { error } = await supabase
        .from('servicios_cotizacion')
        .upsert(filas, { onConflict: 'id', ignoreDuplicates: false })
      if (error) throw error
      return { ok: true }
    },
    onMutate: async (serviciosNuevos) => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, serviciosNuevos)
      return { snapshot }
    },
    onError: (_error, _serviciosNuevos, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(queryKey, context.snapshot)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })
}
