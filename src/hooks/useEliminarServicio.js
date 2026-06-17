import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { queryKeys } from '../lib/queryKeys'

export const useEliminarServicio = ({ cotizacionId = null, idExpediente = null }) => {
  const queryClient = useQueryClient()
  const queryKey = cotizacionId
    ? queryKeys.cotizaciones.servicios.all(cotizacionId)
    : queryKeys.expedientes.servicios.all(idExpediente)

  return useMutation({
    mutationFn: async (idsAEliminar) => {
      for (const idElim of idsAEliminar) {
        const { error } = await supabase
          .from('servicios_cotizacion')
          .delete()
          .eq('id', idElim)
        if (error) throw error
      }
      return { ok: true, eliminados: idsAEliminar.length }
    },
    onMutate: async (idsAEliminar) => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (serviciosActuales = []) =>
        serviciosActuales.filter((svc) => !idsAEliminar.includes(svc.id))
      )
      return { snapshot }
    },
    onError: (_error, _idsAEliminar, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(queryKey, context.snapshot)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })
}
