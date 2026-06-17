export const queryKeys = {
  cotizaciones: {
    all:       ()    => ['cotizaciones'],
    byId:      (id)  => ['cotizaciones', id],
    servicios: {
      all:     (cotizacionId) => ['cotizaciones', cotizacionId, 'servicios'],
    },
  },
  expedientes: {
    all:       ()    => ['expedientes'],
    byId:      (id)  => ['expedientes', id],
    servicios: {
      all:     (idExpediente) => ['expedientes', idExpediente, 'servicios'],
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
