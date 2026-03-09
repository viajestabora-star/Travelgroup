import React, { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import { TrendingUp, Receipt, Wallet, PiggyBank, BarChart3, Clock, User } from 'lucide-react'
import ModalDesgloseInteligencia from './ModalDesgloseInteligencia'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

/** Usuarios a controlar en Control de Personal */
const USUARIOS_CONTROL = [
  { email: 'andres@viajestabora.com', nombre: 'Andrés' },
  { email: 'info@viajestabora.com', nombre: 'Germán' },
  { email: 'grupos@viajestabora.com', nombre: 'Marisa' },
]
const EMAILS_CONTROL = USUARIOS_CONTROL.map((u) => u.email)

const toNum = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0)

const formatEuro = (val) => {
  const num = toNum(val)
  const abs = Math.abs(num)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = num < 0 ? '−' : ''
  return `${sign}${formatted},${decPart} €`
}

const formatearHora = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '—'
  }
}

const formatearFecha = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

const formatearDuracion = (min) => {
  if (min == null || min === '') return '—'
  const m = parseInt(min, 10)
  if (isNaN(m)) return '—'
  const h = Math.floor(m / 60)
  const mins = m % 60
  return `${h}h ${mins}m`
}

const calcularMinutosTrabajados = (r) => {
  if (r.duracion_minutos != null && r.duracion_minutos !== '' && !Number.isNaN(Number(r.duracion_minutos))) {
    return Number(r.duracion_minutos)
  }
  if (!r.hora_entrada || !r.hora_salida) return null
  try {
    const entrada = new Date(r.hora_entrada).getTime()
    const salida = new Date(r.hora_salida).getTime()
    return Math.round((salida - entrada) / 60000)
  } catch {
    return null
  }
}

const getIngresos = (e) => toNum(e.total_ingresos) || toNum(e.cierre_grupo?.ingresos_totales ?? e.cierre_grupo?.total_ingresos)
const getGastos = (e) => toNum(e.total_gastos_reales) || toNum(e.cierre_grupo?.gastos_totales ?? e.cierre_grupo?.total_gastos)
const getIva = (e) => toNum(e.cuota_iva) || toNum(e.cierre_grupo?.iva_pagado)
const getBeneficioNeto = (e) => toNum(e.beneficio_neto_real) || toNum(e.cierre_grupo?.beneficio_limpio ?? e.cierre_grupo?.beneficio)

/**
 * InteligenciaEconomicaPanel - Panel financiero dinámico desde Supabase.
 * Fetch directo a expedientes. Suma en frontend.
 */
const InteligenciaEconomicaPanel = ({ user }) => {
  const [expedientes, setExpedientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [showDesgloseModal, setShowDesgloseModal] = useState(false)
  const [tabInicialModal, setTabInicialModal] = useState('general')
  const [tabPrincipal, setTabPrincipal] = useState('finanzas')
  const [controlHorario, setControlHorario] = useState([])
  const [loadingControl, setLoadingControl] = useState(false)
  const [filtroEmpleado, setFiltroEmpleado] = useState('todos')
  const esAdmin = user?.rol === 'ADMIN'
  const rol = user?.rol
  const controlHorarioCargadoRef = useRef(false)

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (tabPrincipal !== 'controlPersonal' || rol !== 'ADMIN') {
      if (tabPrincipal !== 'controlPersonal') controlHorarioCargadoRef.current = false
      return
    }
    if (controlHorarioCargadoRef.current) return
    controlHorarioCargadoRef.current = true

    let cancelled = false
    const cargar = async () => {
      setLoadingControl(true)
      try {
        const { data, error: err } = await supabase
          .from('control_horario')
          .select('user_email, fecha, hora_entrada, hora_salida')
          .in('user_email', ['andres@viajestabora.com', 'info@viajestabora.com', 'grupos@viajestabora.com'])
          .order('fecha', { ascending: false })
          .limit(200)
        console.log('Datos recuperados:', data)
        if (err) console.warn('Error control_horario:', err)
        if (cancelled) return
        if (!err && Array.isArray(data)) {
          setControlHorario(data)
        } else {
          setControlHorario([])
        }
      } finally {
        if (!cancelled) setLoadingControl(false)
      }
    }
    cargar()
    return () => { cancelled = true }
  }, [tabPrincipal, rol])

  useEffect(() => {
    if (rol !== 'ADMIN') {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: dbError } = await supabase
          .from('expedientes')
          .select('id, numero_expediente, destino, total_ingresos, total_gastos_reales, total_cobrado, cuota_iva, beneficio_neto_real, total_pax, cliente_nombre, nombre_grupo, cierre_grupo')
          .or('estado.eq.Cerrado,estado.ilike.cerrado')

        if (dbError) throw dbError

        const lista = Array.isArray(data) ? data : []
        setExpedientes(lista)
      } catch (err) {
        setError(err?.message || 'Error desconocido al cargar datos financieros.')
        setExpedientes([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [rol])

  /** Registros filtrados por empleado - useMemo al inicio para Rules of Hooks */
  const controlHorarioFiltrado = useMemo(() => {
    if (filtroEmpleado === 'todos') return controlHorario
    return controlHorario.filter((r) => r.user_email === filtroEmpleado)
  }, [controlHorario, filtroEmpleado])

  const ingresosTotales = expedientes.reduce((acc, e) => acc + getIngresos(e), 0)
  const gastosTotales = expedientes.reduce((acc, e) => acc + getGastos(e), 0)
  const ivaAcumulado = expedientes.reduce((acc, e) => acc + getIva(e), 0)
  const beneficioNeto = expedientes.reduce((acc, e) => acc + getBeneficioNeto(e), 0)
  const margenBruto = ingresosTotales - gastosTotales
  const datosSinPersistir = expedientes.length > 0 && ingresosTotales === 0

  const chartData = [
    { name: 'Ingresos Totales', valor: ingresosTotales, fill: '#059669' },
    { name: 'Gastos Totales', valor: gastosTotales, fill: '#dc2626' },
    { name: 'Beneficio Neto', valor: beneficioNeto, fill: beneficioNeto >= 0 ? '#7c3aed' : '#dc2626' },
  ]

  const cards = [
    { title: 'Ingresos Totales', value: formatEuro(ingresosTotales), subtitle: 'Suma de total_ingresos', icon: TrendingUp, bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-500', iconColor: 'text-white', tabApertura: 'cobros' },
    { title: 'Gastos Totales', value: formatEuro(gastosTotales), subtitle: 'Suma de total_gastos_reales', icon: Wallet, bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-500', iconColor: 'text-white', tabApertura: 'gastos' },
    { title: 'Margen Bruto', value: formatEuro(margenBruto), subtitle: 'Ingresos - Gastos', icon: BarChart3, bg: 'bg-sky-50', border: 'border-sky-200', iconBg: 'bg-sky-500', iconColor: 'text-white', tabApertura: 'general' },
    { title: 'IVA Acumulado', value: formatEuro(ivaAcumulado), subtitle: 'Suma de cuota_iva', icon: Receipt, bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-500', iconColor: 'text-white', tabApertura: 'general' },
    { title: 'Beneficio Neto', value: formatEuro(beneficioNeto), subtitle: 'Suma de beneficio_neto_real', icon: PiggyBank, bg: beneficioNeto >= 0 ? 'bg-purple-50' : 'bg-red-50', border: beneficioNeto >= 0 ? 'border-purple-200' : 'border-red-300', iconBg: beneficioNeto >= 0 ? 'bg-purple-600' : 'bg-red-600', iconColor: 'text-white', valueClass: beneficioNeto < 0 ? 'text-red-700 font-black' : undefined, tabApertura: 'rentabilidad' },
  ]

  const abrirModalConTab = (tab) => {
    setTabInicialModal(tab)
    setShowDesgloseModal(true)
  }

  return (
    <>
      {!esAdmin && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-medium">
          Sin permisos para ver este panel.
        </div>
      )}

      {esAdmin && loading && (
        <div className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-navy-200 border-t-navy-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-gray-500">Cargando datos financieros...</p>
        </div>
      )}

      {esAdmin && !loading && error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <span className="font-bold">Error al cargar datos:</span> {error}
          <p className="text-sm mt-2 text-red-600">Comprueba la conexión y vuelve a intentarlo.</p>
        </div>
      )}

      {esAdmin && !loading && !error && (
    <div className="animate-in fade-in duration-500 space-y-8">
      {/* Tabs: Finanzas | Control de Personal (solo visible aquí, no en menú) */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTabPrincipal('finanzas')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${tabPrincipal === 'finanzas' ? 'bg-navy-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <TrendingUp size={18} className="inline mr-2 align-middle" />
          Resumen Financiero
        </button>
        <button
          type="button"
          onClick={() => setTabPrincipal('controlPersonal')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${tabPrincipal === 'controlPersonal' ? 'bg-navy-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <Clock size={18} className="inline mr-2 align-middle" />
          Control de Personal
        </button>
      </div>

      {tabPrincipal === 'controlPersonal' && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Clock size={22} className="text-navy-600" />
              <h3 className="text-base font-bold text-slate-800">Control Horario</h3>
            </div>
            <div className="flex items-center gap-2">
              <User size={18} className="text-slate-500" />
              <select
                value={filtroEmpleado}
                onChange={(e) => setFiltroEmpleado(e.target.value)}
                className="rounded-lg border-2 border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="todos">Todos los empleados</option>
                {USUARIOS_CONTROL.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="p-6 overflow-x-auto">
            {loadingControl ? (
              <div className="py-12 text-center text-slate-500">Cargando...</div>
            ) : controlHorarioFiltrado.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                {controlHorario.length === 0
                  ? 'No hay registros de control horario para estos empleados'
                  : 'No hay registros para el empleado seleccionado'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 font-semibold text-slate-700">Fecha</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-700">Usuario</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-700">Hora Entrada</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-700">Hora Salida</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-700">Tiempo Total</th>
                  </tr>
                </thead>
                <tbody>
                  {controlHorarioFiltrado.map((r, idx) => (
                    <tr key={`${r.user_email}-${r.fecha}-${r.hora_entrada}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-2">{formatearFecha(r.fecha)}</td>
                      <td className="py-3 px-2">
                        {USUARIOS_CONTROL.find((u) => u.email === r.user_email)?.nombre || r.user_email || '—'}
                      </td>
                      <td className="py-3 px-2">{formatearHora(r.hora_entrada)}</td>
                      <td className="py-3 px-2">{formatearHora(r.hora_salida)}</td>
                      <td className="py-3 px-2">{formatearDuracion(calcularMinutosTrabajados(r))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tabPrincipal === 'finanzas' && (
        <>
      {datosSinPersistir && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-800">
          <p className="font-bold">⚠️ Validación: Los totales suman 0 €</p>
          <p className="text-sm mt-1">Hay {expedientes.length} expediente(s) cerrado(s) pero las columnas total_ingresos, total_gastos_reales, cuota_iva y beneficio_neto_real están vacías. Ejecuta la migración SQL y vuelve a guardar el cierre en cada expediente.</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy-800">
          Resumen Financiero (Cerrado)
        </h2>
        <span className="text-sm text-slate-500 font-medium">{ejercicioActual}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <button
              type="button"
              key={card.title}
              onClick={() => abrirModalConTab(card.tabApertura || 'general')}
              className={`flex flex-col p-4 rounded-2xl border-2 ${card.bg} ${card.border} shadow-sm hover:shadow-md transition-shadow min-w-0 text-left cursor-pointer`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-slate-600 shrink-0">{card.title}</p>
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center`}>
                  <Icon size={20} strokeWidth={2.5} />
                </div>
              </div>
              <p
                className={`font-black min-w-0 ${card.valueClass || 'text-slate-900'}`}
                style={{
                  fontSize: '1.25rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {card.value}
              </p>
              <p className="text-xs text-slate-500 mt-1">{card.subtitle}</p>
            </button>
          )
        })}
      </div>

      <ModalDesgloseInteligencia
        isOpen={showDesgloseModal}
        onClose={() => setShowDesgloseModal(false)}
        expedientes={expedientes}
        tabInicial={tabInicialModal}
        ejercicioActual={ejercicioActual}
      />

      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <BarChart3 size={22} className="text-navy-600" />
          <h3 className="text-base font-bold text-slate-800">Comparativa: Ingresos vs Gastos vs Beneficio Neto</h3>
        </div>
        <div className="p-6">
          {expedientes.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              No hay expedientes con estado Cerrado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k €`} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value) => [formatEuro(value), '']}
                  labelFormatter={(label) => label}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                />
                <Legend />
                <Bar dataKey="valor" name="Importe" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
        </>
      )}
    </div>
      )}
    </>
  )
}

export default InteligenciaEconomicaPanel
