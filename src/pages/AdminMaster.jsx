import React, { useState } from 'react'
import { Building2, RefreshCw, Pencil, X, Save, ShieldAlert } from 'lucide-react'
import { useSaasManagement } from '../hooks/useSaasManagement'

// CIF de la empresa raíz — sus campos críticos quedan protegidos contra edición accidental
const CIF_MATRIZ = 'B98998107'

const PLANES_DISPONIBLES = ['basic', 'professional', 'enterprise']

const resolveId      = (row) => row?.id ?? row?.empresa_id ?? null
const resolveNombre  = (row) => row?.nombre_comercial || row?.empresa || row?.nombre || row?.razon_social || '—'
const resolveCif     = (row) => row?.cif || row?.nif || row?.vat || '—'
const resolvePlan    = (row) => row?.tipo_plan || row?.plan || row?.nombre_plan || '—'
const resolveMaxU    = (row) => row?.max_usuarios ?? row?.limite_usuarios_staff ?? '—'
const resolveFecha   = (row) => {
  const v = row?.fecha_expiracion
  if (!v) return '—'
  try { return String(v).slice(0, 10) } catch { return '—' }
}
const resolveSuscripcion = (row) => {
  if (typeof row?.suscripcion_activa === 'boolean') return row.suscripcion_activa ? 'Activa' : 'Inactiva'
  return row?.estado_suscripcion || row?.suscripcion || '—'
}

const buildForm = (row) => ({
  nombre_comercial:  row?.nombre_comercial  || row?.nombre  || '',
  tipo_plan:         row?.tipo_plan         || row?.plan    || '',
  max_usuarios:      row?.max_usuarios      ?? row?.limite_usuarios_staff ?? 1,
  suscripcion_activa: typeof row?.suscripcion_activa === 'boolean' ? row.suscripcion_activa : true,
  fecha_expiracion:  row?.fecha_expiracion  ? String(row.fecha_expiracion).slice(0, 10) : '',
})

// ─── Modal de edición ────────────────────────────────────────────────────────
const EditModal = ({ row, onClose, onSave }) => {
  const esMatriz = resolveCif(row) === CIF_MATRIZ
  const [form, setForm]       = useState(buildForm(row))
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState({ tipo: '', texto: '' })

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaveMsg({ tipo: '', texto: '' })
    setSaving(true)

    const changes = {
      nombre_comercial:   form.nombre_comercial.trim() || null,
      suscripcion_activa: form.suscripcion_activa,
      fecha_expiracion:   form.fecha_expiracion || null,
      max_usuarios:       Number(form.max_usuarios) || 1,
    }
    // plan_tipo solo se modifica si no es la empresa matriz
    if (!esMatriz) {
      changes.tipo_plan = form.tipo_plan.trim() || null
    }

    try {
      await onSave(resolveId(row), changes)
      setSaveMsg({ tipo: 'ok', texto: 'Cambios guardados correctamente.' })
      setTimeout(onClose, 900)
    } catch (err) {
      setSaveMsg({ tipo: 'err', texto: err?.message || 'No se pudo guardar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full border border-slate-200">

        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Pencil size={18} className="text-violet-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Editar empresa
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={22} />
          </button>
        </div>

        {/* Aviso si es la empresa matriz */}
        {esMatriz && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <span>
              Esta es la <strong>empresa matriz</strong> (CIF {CIF_MATRIZ}). Los campos
              <strong> CIF</strong> y <strong>Plan</strong> están protegidos para evitar
              bloqueos accidentales del sistema.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Nombre comercial */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Nombre comercial
            </label>
            <input
              type="text"
              value={form.nombre_comercial}
              onChange={(e) => set('nombre_comercial', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 outline-none"
              placeholder="Nombre de la empresa"
            />
          </div>

          {/* Plan */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Plan
              {esMatriz && (
                <span className="ml-2 text-amber-600 font-normal">(protegido)</span>
              )}
            </label>
            {esMatriz ? (
              <input
                type="text"
                value={resolvePlan(row)}
                disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-400 cursor-not-allowed"
              />
            ) : (
              <select
                value={form.tipo_plan}
                onChange={(e) => set('tipo_plan', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-violet-500 outline-none"
              >
                <option value="">— Sin plan asignado —</option>
                {PLANES_DISPONIBLES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                {/* Incluye el valor actual aunque no esté en la lista predefinida */}
                {form.tipo_plan && !PLANES_DISPONIBLES.includes(form.tipo_plan) && (
                  <option value={form.tipo_plan}>{form.tipo_plan}</option>
                )}
              </select>
            )}
          </div>

          {/* Máximo de usuarios */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Máx. usuarios
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={form.max_usuarios}
              onChange={(e) => set('max_usuarios', Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Suscripción activa */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Estado de suscripción
            </label>
            <select
              value={form.suscripcion_activa ? 'true' : 'false'}
              onChange={(e) => set('suscripcion_activa', e.target.value === 'true')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-violet-500 outline-none"
            >
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
          </div>

          {/* Fecha de expiración */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Fecha de expiración
            </label>
            <input
              type="date"
              value={form.fecha_expiracion}
              onChange={(e) => set('fecha_expiracion', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Mensaje de resultado */}
          {saveMsg.texto && (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              saveMsg.tipo === 'ok'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-rose-50 text-rose-900 border border-rose-200'
            }`}>
              {saveMsg.texto}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
const AdminMaster = () => {
  const { rows, loading, error, reload, updateEmpresa } = useSaasManagement()
  const [editingRow, setEditingRow] = useState(null)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="text-violet-600" size={28} />
            Panel Master
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            Gestión SaaS — fuente:{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">vista_gestion_saas</code>.
            Edición directa sobre tabla{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">empresas</code>.
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

      {/* Error de carga */}
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <span className="font-semibold text-slate-800">Empresas SaaS</span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            No hay datos en la vista de gestión SaaS.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">CIF</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Máx. usuarios</th>
                  <th className="px-4 py-3 font-medium">Suscripción</th>
                  <th className="px-4 py-3 font-medium">Expira</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const esMatriz = resolveCif(row) === CIF_MATRIZ
                  return (
                    <tr
                      key={resolveId(row) ?? idx}
                      className="border-b border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        <div className="flex items-center gap-1.5">
                          {esMatriz && (
                            <ShieldAlert
                              size={14}
                              className="text-amber-500 shrink-0"
                              title="Empresa matriz — campos críticos protegidos"
                            />
                          )}
                          {resolveNombre(row)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono">{resolveCif(row)}</td>
                      <td className="px-4 py-3 text-slate-700">{resolvePlan(row)}</td>
                      <td className="px-4 py-3 text-slate-700 text-center">{resolveMaxU(row)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                          row?.suscripcion_activa
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {resolveSuscripcion(row)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">{resolveFecha(row)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingRow(row)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium"
                        >
                          <Pencil size={13} />
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de edición */}
      {editingRow && (
        <EditModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSave={updateEmpresa}
        />
      )}
    </div>
  )
}

export default AdminMaster
