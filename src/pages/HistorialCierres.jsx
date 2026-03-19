import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Eye, TrendingUp, FileSpreadsheet, Filter, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'

// ─── Helpers numéricos ────────────────────────────────────────────────────────

/** Convierte cualquier valor a número seguro (0 si no es numérico) */
const n = (v) => {
  if (v == null) return 0
  const num = Number(v)
  return Number.isFinite(num) ? num : 0
}

/**
 * Extrae los datos financieros canónicos de un expediente.
 * Lee en cascada desde la fuente más fiable a la más degradada:
 *   1. cierre_grupo (el JSON guardado al cerrar) — fuente primaria
 *   2. columnas directas total_ingresos / total_gastos_reales
 *   3. 0 como último recurso (nunca da error)
 */
const extraerFinanzas = (exp) => {
  const cg = exp.cierre_grupo || {}

  // ── Ingresos ────────────────────────────────────────────────────────────────
  const ingresoTotal = n(
    cg.ingresos_totales ??
    cg.total_ingresos ??
    exp.total_ingresos
  )

  // ── Gastos: leer cierre_grupo.gastos_totales primero; si no, sumar costesReales ──
  let gastoTotal = n(cg.gastos_totales ?? cg.gastos_reales ?? exp.total_gastos_reales)
  if (gastoTotal === 0 && Array.isArray(cg.costesReales) && cg.costesReales.length > 0) {
    gastoTotal = cg.costesReales.reduce((sum, c) => sum + n(c.coste_real), 0)
  }
  if (gastoTotal === 0 && Array.isArray(cg.gastosImprevistos)) {
    // Sumar también gastos imprevistos si los hay
    const imprev = cg.gastosImprevistos.reduce((sum, g) => sum + n(g.importe), 0)
    gastoTotal += imprev
  }

  // ── Beneficio: preferir el guardado; si no, calcularlo ───────────────────
  const beneficioNeto = n(
    cg.beneficio_limpio ??
    cg.beneficio_neto ??
    cg.beneficio ??
    exp.beneficio_neto_real ??
    exp.liquidacion_final_beneficio ??
    (ingresoTotal - gastoTotal)
  )

  // ── Fecha de cierre ──────────────────────────────────────────────────────
  const fechaCierre = cg.fecha
    ? new Date(cg.fecha)
    : exp.fecha_inicio
      ? new Date(exp.fecha_inicio)
      : null

  // ── Desglose de proveedores ──────────────────────────────────────────────
  const costesReales = Array.isArray(cg.costesReales) ? cg.costesReales : []

  return { ingresoTotal, gastoTotal, beneficioNeto, fechaCierre, costesReales }
}

// ─── Constantes de UI ─────────────────────────────────────────────────────────

const getQuarter = (date) => date ? Math.floor(date.getMonth() / 3) + 1 : null

const TRIMESTRES = [
  { value: 'all', label: 'Todos los trimestres' },
  { value: '1',   label: 'Q1 — Ene / Feb / Mar' },
  { value: '2',   label: 'Q2 — Abr / May / Jun' },
  { value: '3',   label: 'Q3 — Jul / Ago / Sep' },
  { value: '4',   label: 'Q4 — Oct / Nov / Dic' },
]

const añoActual = new Date().getFullYear()
const AÑOS_DISPONIBLES = Array.from({ length: 6 }, (_, i) => añoActual - i)

// ─── Componente principal ────────────────────────────────────────────────────

const HistorialCierres = () => {
  const navigate = useNavigate()

  const [cierres,      setCierres]      = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [exportando,   setExportando]   = useState(false)
  const [trimestre,    setTrimestre]    = useState('all')
  const [año,          setAño]          = useState(String(añoActual))

  useEffect(() => { cargarCierres() }, [])

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const cargarCierres = async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select(`
          id,
          numero_expediente,
          nombre_grupo,
          cliente_nombre,
          destino,
          fecha_inicio,
          total_ingresos,
          total_gastos_reales,
          beneficio_neto_real,
          liquidacion_final_beneficio,
          cierre_grupo,
          informe_gastos_hacienda
        `)
        .or('estado.eq.Cerrado,estado.ilike.cerrado,estado.ilike.finalizado')
        .order('fecha_inicio', { ascending: false, nullsFirst: false })

      if (error) { setCierres([]); return }

      const mapeados = (data || []).map((exp) => ({
        ...exp,
        ...extraerFinanzas(exp),
      }))

      mapeados.sort((a, b) => (b.fechaCierre?.getTime() ?? 0) - (a.fechaCierre?.getTime() ?? 0))
      setCierres(mapeados)
    } catch {
      setCierres([])
    } finally {
      setCargando(false)
    }
  }

  // ── Filtrado por año y trimestre ──────────────────────────────────────────
  const cierresFiltrados = useMemo(() => {
    return cierres.filter((c) => {
      const fecha = c.fechaCierre
      if (!fecha) return true
      if (String(fecha.getFullYear()) !== año) return false
      if (trimestre === 'all') return true
      return getQuarter(fecha) === parseInt(trimestre, 10)
    })
  }, [cierres, año, trimestre])

  // ── Totales del periodo ───────────────────────────────────────────────────
  const totales = useMemo(() => ({
    ingresos:  cierresFiltrados.reduce((s, c) => s + c.ingresoTotal, 0),
    gastos:    cierresFiltrados.reduce((s, c) => s + c.gastoTotal,   0),
    beneficio: cierresFiltrados.reduce((s, c) => s + c.beneficioNeto, 0),
  }), [cierresFiltrados])

  // ── Exportar XLSX ─────────────────────────────────────────────────────────
  /**
   * Genera un XLSX con dos hojas:
   *  1. Resumen — una fila por expediente + fila de totales
   *  2. Desglose de Proveedores — una fila por concepto/proveedor
   *
   * Para expedientes sin cierre_grupo.costesReales, hace un fallback a
   * servicios_cotizacion.coste_real_proveedor (deep-fetch al exportar).
   */
  const exportarExcel = async () => {
    if (cierresFiltrados.length === 0) return
    setExportando(true)

    try {
      // ── Deep-fetch: coste_real_proveedor de servicios_cotizacion ───────────
      // Para expedientes cuyo cierre_grupo no tiene costesReales
      const idsNecesitanFetch = cierresFiltrados
        .filter((c) => c.costesReales.length === 0)
        .map((c) => c.id)

      let serviciosPorExpediente = {}

      if (idsNecesitanFetch.length > 0) {
        const { data: serviciosDB } = await supabase
          .from('servicios_cotizacion')
          .select(`
            id,
            id_expediente,
            tipo_servicio,
            nombre_especifico,
            coste_real_proveedor,
            coste_unitario,
            total_servicio_manual,
            proveedor_id_int,
            nombre_proveedor_texto
          `)
          .in('id_expediente', idsNecesitanFetch)

        // Resolver nombres de proveedor
        const provIds = [...new Set(
          (serviciosDB || []).map((s) => s.proveedor_id_int).filter(Boolean)
        )]
        let provNombres = {}
        if (provIds.length > 0) {
          const { data: provsDB } = await supabase
            .from('proveedores')
            .select('id, nombre_comercial')
            .in('id', provIds)
          ;(provsDB || []).forEach((p) => { provNombres[p.id] = p.nombre_comercial })
        }

        // Agrupar por expediente
        ;(serviciosDB || []).forEach((s) => {
          if (!serviciosPorExpediente[s.id_expediente]) {
            serviciosPorExpediente[s.id_expediente] = []
          }
          const proveedor = (s.proveedor_id_int && provNombres[s.proveedor_id_int])
            || s.nombre_proveedor_texto
            || 'Pendiente de asignar'
          const tipo    = s.tipo_servicio || 'Servicio'
          const nombre  = s.nombre_especifico ? `${tipo} – ${s.nombre_especifico}` : tipo
          // Prioridad: coste_real_proveedor → coste unitario/manual como fallback
          const costeReal = n(s.coste_real_proveedor ?? s.total_servicio_manual ?? s.coste_unitario)
          serviciosPorExpediente[s.id_expediente].push({
            concepto:        nombre,
            proveedor:       proveedor,
            coste_cotizado:  n(s.total_servicio_manual ?? s.coste_unitario),
            coste_real:      costeReal,
          })
        })
      }

      // ── Construir datos enriquecidos para el Excel ─────────────────────────
      const cierresEnriquecidos = cierresFiltrados.map((c) => {
        // Si ya tiene costesReales del cierre_grupo, usarlos; si no, usar los de servicios_cotizacion
        const detalle = c.costesReales.length > 0
          ? c.costesReales
          : (serviciosPorExpediente[c.id] || [])

        // Re-calcular gastos si el cierre no los tenía (sumamos los del deep-fetch)
        const gastoRecalculado = c.gastoTotal > 0
          ? c.gastoTotal
          : detalle.reduce((sum, d) => sum + n(d.coste_real), 0)

        const beneficioRecalculado = c.ingresoTotal - gastoRecalculado

        return { ...c, gastoTotal: gastoRecalculado, beneficioNeto: beneficioRecalculado, detalle }
      })

      // ─── Hoja 1: Resumen ───────────────────────────────────────────────────
      const labelPeriodo = trimestre === 'all'
        ? año
        : `${año}_Q${trimestre}`

      const filasCabecera = [
        ['ID Expediente', 'Cliente', 'Destino', 'Fecha de Cierre', 'Total Ingresos (€)', 'Total Gastos Proveedores (€)', 'Beneficio Neto (€)'],
      ]

      const filasResumen = cierresEnriquecidos.map((c) => [
        c.numero_expediente || c.id?.substring(0, 8) || '—',
        c.cliente_nombre || c.nombre_grupo || '—',
        c.destino || '—',
        c.fechaCierre ? c.fechaCierre.toLocaleDateString('es-ES') : '—',
        Number(c.ingresoTotal.toFixed(2)),      // número nativo → sumable en Excel
        Number(c.gastoTotal.toFixed(2)),
        Number(c.beneficioNeto.toFixed(2)),
      ])

      // Fila de totales (en negrita vía cellStyle)
      const filaTotales = [
        'TOTALES',
        '',
        '',
        `${cierresEnriquecidos.length} expediente${cierresEnriquecidos.length !== 1 ? 's' : ''}`,
        Number(cierresEnriquecidos.reduce((s, c) => s + c.ingresoTotal,  0).toFixed(2)),
        Number(cierresEnriquecidos.reduce((s, c) => s + c.gastoTotal,    0).toFixed(2)),
        Number(cierresEnriquecidos.reduce((s, c) => s + c.beneficioNeto, 0).toFixed(2)),
      ]

      const wsResumen = XLSX.utils.aoa_to_sheet([
        ...filasCabecera,
        ...filasResumen,
        [],           // fila vacía separadora
        filaTotales,
      ])

      // Anchos de columna
      wsResumen['!cols'] = [
        { wch: 14 }, // ID
        { wch: 30 }, // Cliente
        { wch: 22 }, // Destino
        { wch: 14 }, // Fecha
        { wch: 22 }, // Ingresos
        { wch: 28 }, // Gastos
        { wch: 20 }, // Beneficio
      ]

      // ─── Hoja 2: Desglose de Proveedores ──────────────────────────────────
      const filasDesglose = []
      filasDesglose.push([
        'Nº Expediente', 'Cliente', 'Proveedor', 'Concepto', 'Coste Cotizado (€)', 'Coste Real / Factura (€)',
      ])

      let expedienteAnterior = null
      for (const c of cierresEnriquecidos) {
        if (c.detalle.length === 0) {
          // Sin detalle: insertar fila de marcador
          filasDesglose.push([
            c.numero_expediente || '—',
            c.cliente_nombre || c.nombre_grupo || '—',
            '—', 'Sin desglose registrado', 0, 0,
          ])
        } else {
          for (let i = 0; i < c.detalle.length; i++) {
            const d = c.detalle[i]
            filasDesglose.push([
              i === 0 ? (c.numero_expediente || '—') : '',   // mostrar nº solo en 1ª fila del grupo
              i === 0 ? (c.cliente_nombre || c.nombre_grupo || '—') : '',
              d.proveedor || 'Pendiente de asignar',
              d.concepto  || '—',
              Number(n(d.coste_cotizado).toFixed(2)),
              Number(n(d.coste_real).toFixed(2)),
            ])
          }
        }
        expedienteAnterior = c.id
      }

      const wsDesglose = XLSX.utils.aoa_to_sheet(filasDesglose)
      wsDesglose['!cols'] = [
        { wch: 14 }, // Nº Exp
        { wch: 28 }, // Cliente
        { wch: 28 }, // Proveedor
        { wch: 38 }, // Concepto
        { wch: 22 }, // Cotizado
        { wch: 24 }, // Real
      ]

      // ─── Workbook ──────────────────────────────────────────────────────────
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, wsResumen,  'Resumen')
      XLSX.utils.book_append_sheet(wb, wsDesglose, 'Desglose de Proveedores')

      XLSX.writeFile(wb, `Historial_Cierres_${labelPeriodo}.xlsx`)

    } catch (err) {
      console.error('[Excel] Error al generar:', err)
      alert('Error al generar el Excel. Revisa la consola para más detalles.')
    } finally {
      setExportando(false)
    }
  }

  // ── Helpers de formato ────────────────────────────────────────────────────
  const formatearFecha = (fecha) => {
    if (!fecha) return '—'
    return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const verDetalle = (exp) => {
    navigate('/expedientes', { state: { abrirExpedienteId: exp.id, tabInicial: 'cierre' } })
  }

  const etiquetaPeriodo = trimestre === 'all'
    ? `Todo ${año}`
    : `${TRIMESTRES.find((t) => t.value === trimestre)?.label ?? ''} · ${año}`

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">

      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Historial de Cierres
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Expedientes cerrados · {etiquetaPeriodo}
          </p>
        </div>

        {/* ── Controles ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={año}
              onChange={(e) => setAño(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {AÑOS_DISPONIBLES.map((a) => (
                <option key={a} value={String(a)}>{a}</option>
              ))}
            </select>
          </div>

          <select
            value={trimestre}
            onChange={(e) => setTrimestre(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {TRIMESTRES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={exportarExcel}
            disabled={cierresFiltrados.length === 0 || exportando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold shadow-sm transition-colors text-sm"
          >
            {exportando
              ? <><Loader2 size={16} className="animate-spin" /> Generando…</>
              : <><FileSpreadsheet size={16} /> Exportar Excel</>
            }
          </button>
        </div>
      </div>

      {/* ── Tarjetas de resumen del periodo ─────────────────────────────────── */}
      {!cargando && cierresFiltrados.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Ingresos',           value: totales.ingresos,  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Total Gastos Proveedores',  value: totales.gastos,   color: 'text-red-700',     bg: 'bg-red-50 border-red-200'         },
            { label: 'Beneficio Neto',            value: totales.beneficio, color: totales.beneficio >= 0 ? 'text-blue-700' : 'text-red-700', bg: totales.beneficio >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200' },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-2xl font-extrabold ${card.color}`}>{card.value.toFixed(2)} €</p>
              <p className="text-xs text-slate-400 mt-0.5">{cierresFiltrados.length} expediente{cierresFiltrados.length !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Estado de carga / vacío ──────────────────────────────────────────── */}
      {cargando ? (
        <div className="py-16 text-center text-slate-500">
          <TrendingUp className="mx-auto text-slate-300 mb-4 animate-pulse" size={48} />
          <p>Cargando cierres...</p>
        </div>

      ) : cierresFiltrados.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            {cierres.length === 0 ? 'No hay expedientes cerrados' : `Sin cierres en ${etiquetaPeriodo}`}
          </h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            {cierres.length === 0
              ? 'Los expedientes aparecerán aquí cuando tengan estado Cerrado.'
              : 'Prueba a cambiar el año o el trimestre para ver otros períodos.'}
          </p>
        </div>

      ) : (
        <>
          {/* ── Tabla desktop ───────────────────────────────────────────────── */}
          <div className="hidden md:block bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em] text-xs">Nº Exp.</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em] text-xs">Cliente</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em] text-xs">Destino</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em] text-xs">Fecha Cierre</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-[0.12em] text-xs">Ingresos</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-[0.12em] text-xs">Gastos Prov.</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-[0.12em] text-xs">Beneficio</th>
                  <th className="px-4 py-3 text-center font-black uppercase tracking-[0.12em] text-xs">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cierresFiltrados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero_expediente || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{c.cliente_nombre || c.nombre_grupo || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.destino || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatearFecha(c.fechaCierre)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      {c.ingresoTotal.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {c.gastoTotal > 0
                        ? <span className="font-medium text-red-600">{c.gastoTotal.toFixed(2)} €</span>
                        : <span className="text-slate-300 text-xs italic">sin datos</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      <span className={c.beneficioNeto >= 0 ? 'text-blue-700' : 'text-red-600'}>
                        {c.beneficioNeto.toFixed(2)} €
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => verDetalle(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Eye size={14} />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-black text-slate-700 uppercase text-xs tracking-widest">
                    TOTALES ({cierresFiltrados.length})
                  </td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">{totales.ingresos.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-black text-red-600">{totales.gastos.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-black">
                    <span className={totales.beneficio >= 0 ? 'text-blue-700' : 'text-red-600'}>
                      {totales.beneficio.toFixed(2)} €
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Tarjetas móvil ──────────────────────────────────────────────── */}
          <div className="md:hidden space-y-4">
            {cierresFiltrados.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-xs font-mono text-slate-400 mb-0.5">{c.numero_expediente || '—'}</p>
                      <h3 className="font-bold text-slate-900">{c.cliente_nombre || c.nombre_grupo || '—'}</h3>
                      <p className="text-sm text-slate-500">{c.destino || '—'}</p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatearFecha(c.fechaCierre)}</span>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Ingresos</p>
                    <p className="font-bold text-emerald-700">{c.ingresoTotal.toFixed(2)} €</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Gastos</p>
                    <p className={`font-bold ${c.gastoTotal > 0 ? 'text-red-600' : 'text-slate-400'}`}>{c.gastoTotal.toFixed(2)} €</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Beneficio</p>
                    <p className={`font-bold ${c.beneficioNeto >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{c.beneficioNeto.toFixed(2)} €</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => verDetalle(c)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors"
                  >
                    <Eye size={18} />
                    Ver Detalle
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Nota informativa para la gestoría */}
      {!cargando && cierresFiltrados.length > 0 && (
        <p className="mt-4 text-xs text-slate-400 text-center">
          El Excel incluye dos hojas: <strong>Resumen</strong> (una fila por expediente) y <strong>Desglose de Proveedores</strong> (una fila por concepto / factura).
          Los valores monetarios son numéricos para poder hacer sumatorios directamente en Excel o Numbers.
        </p>
      )}
    </div>
  )
}

export default HistorialCierres
