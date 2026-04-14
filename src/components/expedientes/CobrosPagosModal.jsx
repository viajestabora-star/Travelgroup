import React from 'react'
import { X, Save } from 'lucide-react'
import { limpiarNumero } from '../../utils/finanzasHelpers'

/**
 * Suma `importe` de `cobros_expediente` y persiste `expedientes.total_cobrado` (Number).
 * No escribe `pendiente_cobro` (no existe en esquema).
 */
export async function sincronizarTotalCobradoExpediente(supabase, expedienteId) {
  if (!expedienteId) throw new Error('expedienteId requerido')
  const { data: rows, error } = await supabase
    .from('cobros_expediente')
    .select('importe')
    .eq('expediente_id', expedienteId)
  if (error) throw error
  const sum = (rows || []).reduce((acc, r) => acc + Number(r?.importe ?? 0), 0)
  const totalCobrado = Number(Number.isFinite(sum) ? sum.toFixed(2) : '0')
  const { error: upErr } = await supabase
    .from('expedientes')
    .update({ total_cobrado: totalCobrado })
    .eq('id', expedienteId)
  if (upErr) throw upErr
  return totalCobrado
}

/** Pendiente de cobro solo en UI: total_ingresos − total_cobrado (ambos como Number). */
export function calcularPendienteCobro(totalIngresos, totalCobrado) {
  const ti = Number(totalIngresos)
  const tc = Number(totalCobrado)
  const ing = Number.isFinite(ti) ? ti : 0
  const cob = Number.isFinite(tc) ? tc : 0
  return Number((ing - cob).toFixed(2))
}

/** Verde (liquidado) si no queda pendiente por cobrar; rojo si pendiente > 0. */
export function esCobroLiquidado(pendiente) {
  const p = Number(pendiente)
  return Number.isFinite(p) ? p <= 0 : true
}

/**
 * Modal registrar/editar cobro (UI pura; el guardado y sync viven en el padre).
 */
export default function CobrosPagosModal({
  open,
  onClose,
  cobroEnEdicionId,
  cobros = [],
  formCobro,
  setFormCobro,
  onGuardar,
  onWheel,
}) {
  if (!open) return null

  const resetCerrar = () => {
    onClose?.()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-navy-900">
            {cobroEnEdicionId ? 'Editar Cobro' : 'Registrar Nuevo Cobro'}
          </h3>
          <button
            type="button"
            onClick={resetCerrar}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Cerrar"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {cobroEnEdicionId && (() => {
            const cobroEdit = (cobros || []).find((c) => c.id === cobroEnEdicionId)
            const nr = cobroEdit?.numero_recibo
            if (!nr) return null
            return (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-xs font-medium text-gray-500 mb-1">Nº Recibo (inmutable)</label>
                <p className="text-sm font-mono font-bold text-navy-900">{nr}</p>
              </div>
            )
          })()}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Importe (€) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formCobro.importe}
              onChange={(e) => {
                let valor = e.target.value
                if (valor.includes(',')) valor = valor.replace(',', '.')
                setFormCobro({ ...formCobro, importe: valor })
              }}
              onWheel={onWheel}
              onBlur={(e) => {
                const valorLimpio = limpiarNumero(e.target.value)
                setFormCobro({
                  ...formCobro,
                  importe: valorLimpio > 0 ? valorLimpio.toFixed(2) : '',
                })
              }}
              placeholder="Ej: 66.50"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Método de Pago <span className="text-red-500">*</span>
            </label>
            <select
              value={formCobro.metodo_pago}
              onChange={(e) => setFormCobro({ ...formCobro, metodo_pago: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="Transferencia">Transferencia</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Talon">Talón</option>
              <option value="Mixto">Mixto</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cuenta Destino <span className="text-red-500">*</span>
            </label>
            <select
              value={formCobro.cuenta_destino}
              onChange={(e) => setFormCobro({ ...formCobro, cuenta_destino: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="Caixabank">Caixabank</option>
              <option value="Santander">Santander</option>
              <option value="Caja">Caja</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Concepto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formCobro.concepto}
              onChange={(e) => setFormCobro({ ...formCobro, concepto: e.target.value })}
              placeholder="Ej: Depósito, Pago 2, Total"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onGuardar} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Save size={20} />
            {cobroEnEdicionId ? 'Actualizar Cobro' : 'Guardar Cobro'}
          </button>
          <button type="button" onClick={resetCerrar} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
