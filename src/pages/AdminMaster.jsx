import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabase'
import { Building2, Plus, Minus, RefreshCw, X, Mail, Link2 } from 'lucide-react'
import { TABORA_MASTER_EMPRESA_ID } from '../utils/adminMasterAccess'

const fmtFecha = (d) => {
  if (d == null || d === '') return '—'
  try {
    const s = typeof d === 'string' ? d : String(d)
    const part = s.slice(0, 10)
    return part || '—'
  } catch {
    return '—'
  }
}

const AdminMaster = () => {
  const [agencias, setAgencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [modalNueva, setModalNueva] = useState(false)
  const [nombreNueva, setNombreNueva] = useState('')
  const [limiteNueva, setLimiteNueva] = useState(1)
  const [guardandoNueva, setGuardandoNueva] = useState(false)
  const [ajusteId, setAjusteId] = useState(null)
  const [ultimaEmpresaCreadaId, setUltimaEmpresaCreadaId] = useState(null)

  const [empresaVinculo, setEmpresaVinculo] = useState('')
  const [emailVinculo, setEmailVinculo] = useState('')
  const [guardandoVinculo, setGuardandoVinculo] = useState(false)

  const agenciasCliente = useMemo(
    () => agencias.filter((a) => a.id !== TABORA_MASTER_EMPRESA_ID),
    [agencias]
  )

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const { data, error: err } = await supabase.rpc('master_listar_empresas')
    if (err) {
      setAgencias([])
      setError(
        err.code === '42501' || /solo_master_tabora/i.test(err.message || '')
          ? 'No tienes permiso para el panel master (requiere empresa Tabora en Supabase o perfil ADMIN en empresa 1).'
          : err.message || 'Error al cargar agencias.'
      )
    } else {
      setAgencias(Array.isArray(data) ? data : [])
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (agenciasCliente.length === 0) return
    setEmpresaVinculo((prev) => {
      if (prev && agenciasCliente.some((a) => String(a.id) === prev)) return prev
      const pref =
        ultimaEmpresaCreadaId && agenciasCliente.some((a) => a.id === ultimaEmpresaCreadaId)
          ? String(ultimaEmpresaCreadaId)
          : String(agenciasCliente[agenciasCliente.length - 1].id)
      return pref
    })
  }, [agenciasCliente, ultimaEmpresaCreadaId])

  const abrirNueva = () => {
    setNombreNueva('')
    setLimiteNueva(1)
    setModalNueva(true)
  }

  const crearAgencia = async (e) => {
    e.preventDefault()
    const nombre = nombreNueva.trim()
    if (!nombre) {
      alert('Indica el nombre de la agencia.')
      return
    }
    const limEntero = Math.floor(Number(limiteNueva))
    const limiteFinal = Number.isFinite(limEntero) && limEntero >= 1 ? limEntero : 1

    setGuardandoNueva(true)
    const { data, error: err } = await supabase.rpc('master_crear_empresa', {
      p_nombre: nombre,
      p_limite_usuarios_staff: limiteFinal,
    })
    setGuardandoNueva(false)

    if (err) {
      const detalle = [err.message, err.details, err.hint].filter(Boolean).join(' — ')
      alert(detalle || 'No se pudo crear la agencia. Comprueba permisos RPC y migraciones.')
      return
    }

    const nuevaId = typeof data === 'number' ? data : data != null ? Number(data) : null
    if (Number.isFinite(nuevaId) && nuevaId > 0) {
      setUltimaEmpresaCreadaId(nuevaId)
      setEmpresaVinculo(String(nuevaId))
    }

    setModalNueva(false)
    setNombreNueva('')
    setLimiteNueva(1)
    await cargar()
  }

  const vincularAdmin = async (e) => {
    e.preventDefault()
    const email = emailVinculo.trim().toLowerCase()
    const empId = parseInt(empresaVinculo, 10)
    if (!email || !email.includes('@')) {
      alert('Introduce un email válido.')
      return
    }
    if (!Number.isFinite(empId) || empId < 2) {
      alert('Selecciona una agencia cliente (id ≥ 2).')
      return
    }
    setGuardandoVinculo(true)
    const { error: err } = await supabase.rpc('master_vincular_admin_empresa', {
      p_email: email,
      p_empresa_id: empId,
    })
    setGuardandoVinculo(false)
    if (err) {
      alert(err.message || 'No se pudo vincular el administrador.')
      return
    }
    setEmailVinculo('')
    alert('Administrador vinculado en roles_usuarios como ADMIN.')
  }

  const ajustarLimite = async (empresaId, delta) => {
    setAjusteId(empresaId)
    const { error: err } = await supabase.rpc('master_ajustar_limite_staff', {
      p_empresa_id: empresaId,
      p_delta: delta,
    })
    setAjusteId(null)
    if (err) {
      if (/limite_inferior_a_usuarios/i.test(err.message || '')) {
        alert('No puedes bajar el límite por debajo del número de usuarios ya dados de alta en esa agencia.')
      } else {
        alert(err.message || 'No se pudo actualizar el límite.')
      }
      return
    }
    await cargar()
  }

  const toggleActiva = async (row) => {
    if (row.id === TABORA_MASTER_EMPRESA_ID && row.activa) {
      alert('No se puede desactivar la agencia raíz Tabora (id 1).')
      return
    }
    const siguiente = !row.activa
    const accion = siguiente ? 'activar' : 'desactivar'
    if (!window.confirm(`¿${accion === 'activar' ? 'Activar' : 'Desactivar'} la agencia «${row.nombre}»?`)) return
    const { error: err } = await supabase.rpc('master_set_empresa_activa', {
      p_empresa_id: row.id,
      p_activa: siguiente,
    })
    if (err) {
      if (/no_desactivar_tabora_raiz/i.test(err.message || '')) {
        alert('No se puede desactivar la agencia raíz Tabora.')
      } else {
        alert(err.message || 'No se pudo cambiar el estado.')
      }
      return
    }
    await cargar()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="text-violet-600" size={28} />
            Panel Master
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            Gestión central de agencias. «Nueva agencia» usa la RPC <code className="text-xs bg-slate-100 px-1 rounded">master_crear_empresa</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={cargar}
            disabled={cargando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={abrirNueva}
            disabled={cargando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-40"
          >
            <Plus size={20} />
            Nueva agencia
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
          <Link2 className="text-violet-600" size={22} />
          Vincular administrador
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Asigna el email del cliente como <strong>ADMIN</strong> de la agencia elegida (registro en{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">roles_usuarios</code>). Solo agencias con id ≥ 2.
        </p>
        <form onSubmit={vincularAdmin} className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Agencia</label>
            <select
              value={empresaVinculo}
              onChange={(e) => setEmpresaVinculo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 bg-white"
              required
            >
              {agenciasCliente.length === 0 ? (
                <option value="">Crea una agencia primero</option>
              ) : (
                agenciasCliente.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    #{a.id} — {a.nombre}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email del administrador</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="email"
                value={emailVinculo}
                onChange={(e) => setEmailVinculo(e.target.value)}
                placeholder="cliente@agencia.com"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-slate-900"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={guardandoVinculo || agenciasCliente.length === 0}
            className="px-5 py-2.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-40"
          >
            {guardandoVinculo ? 'Guardando…' : 'Vincular'}
          </button>
        </form>
      </section>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <span className="font-semibold text-slate-800">Agencias</span>
        </div>
        {cargando ? (
          <div className="p-10 text-center text-slate-500">Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Límite staff</th>
                  <th className="px-4 py-3 font-medium">Fin suscripción</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {agencias.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-slate-600 font-mono">{row.id}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{row.nombre || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={ajusteId === row.id || row.limite_usuarios_staff <= 1}
                          onClick={() => ajustarLimite(row.id, -1)}
                          className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                          title="Reducir límite"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="min-w-[2.5rem] text-center font-semibold text-slate-800">
                          {row.limite_usuarios_staff ?? '—'}
                        </span>
                        <button
                          type="button"
                          disabled={ajusteId === row.id}
                          onClick={() => ajustarLimite(row.id, 1)}
                          className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"
                          title="Aumentar límite"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtFecha(row.fecha_expiracion)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={row.id === TABORA_MASTER_EMPRESA_ID && row.activa}
                        onClick={() => toggleActiva(row)}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                          row.activa ? 'bg-emerald-500' : 'bg-slate-300'
                        } ${row.id === TABORA_MASTER_EMPRESA_ID && row.activa ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={row.activa ? 'Activa — pulsar para desactivar' : 'Inactiva — pulsar para activar'}
                        aria-pressed={!!row.activa}
                      >
                        <span
                          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            row.activa ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <span className="ml-2 text-xs font-medium text-slate-600">
                        {row.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalNueva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Nueva agencia</h2>
              <button
                type="button"
                onClick={() => !guardandoNueva && setModalNueva(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>
            <form onSubmit={crearAgencia} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={nombreNueva}
                  onChange={(e) => setNombreNueva(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 outline-none"
                  placeholder="Nombre comercial"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Límite usuarios staff (inicial)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={limiteNueva}
                  onChange={(e) => setLimiteNueva(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Por defecto 1. Se envía a la RPC como entero.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalNueva(false)}
                  disabled={guardandoNueva}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoNueva}
                  className="flex-1 py-2.5 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50"
                >
                  {guardandoNueva ? 'Guardando…' : 'Crear con RPC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminMaster
