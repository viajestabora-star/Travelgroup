export const queryKeys = {
  cotizaciones: {
    all:       ()    => ['cotizaciones'],
    byId:      (id)  => ['cotizaciones', id],
    servicios: {
      all:     (cotizacionId, versionId) => versionId
        ? ['cotizaciones', cotizacionId, 'servicios', versionId]
        : ['cotizaciones', cotizacionId, 'servicios'],
    },
  },
  expedientes: {
    all:       ()    => ['expedientes'],
    byId:      (id)  => ['expedientes', id],
    servicios: {
      all:     (idExpediente, versionId) => versionId
        ? ['expedientes', idExpediente, 'servicios', versionId]
        : ['expedientes', idExpediente, 'servicios'],
    },
  },
  proveedores: {
    all:       ()    => ['proveedores'],
    byId:      (id)  => ['proveedores', id],
  },
  mayoristas: {
    all:       ()    => ['mayoristas'],
    byId:      (id)  => ['mayoristas', id],
  },
}
