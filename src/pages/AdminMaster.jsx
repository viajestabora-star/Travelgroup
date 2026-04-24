import React from 'react'
import { Building2, RefreshCw } from 'lucide-react'
import { useSaasManagement } from '../hooks/useSaasManagement'

const resolveNombre = (row) =>
  row?.nombre_comercial || row?.empresa || row?.nombre || row?.razon_social || '—'

const resolveCif = (row) => row?.cif || row?.nif || row?.vat || '—'

const resolvePlan = (row) => row?.tipo_plan || row?.plan || row?.nombre_plan || '—'

const resolveSuscripcion = (row) => {
  if (typeof row?.suscripcion_activa === 'boolean') {
    return row.suscripcion_activa ? 'Activa' : 'Inactiva'
  }
  return row?.estado_suscripcion || row?.suscripcion || '—'
}

const AdminMaster = () => {
  const { rows, loading, error, reload } = useSaasManagement()

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="text-violet-600" size={28} />
            Panel Master
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            Vista de solo lectura de la gestión SaaS (fuente: <code className="text-xs bg-slate-100 px-1 rounded">vista_gestion_saas</code>).
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <span className="font-semibold text-slate-800">Empresas SaaS</span>
        </div>
        {loading ? (
          <div className="p-10 text-center text-slate-500">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No hay datos en la vista de gestión SaaS.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">CIF</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Suscripción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id ?? row.empresa_id ?? row.cif ?? idx} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-slate-900 font-medium">{resolveNombre(row)}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{resolveCif(row)}</td>
                    <td className="px-4 py-3 text-slate-700">{resolvePlan(row)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700">
                        {resolveSuscripcion(row)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminMaster
