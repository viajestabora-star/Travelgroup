import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { UserPlus, Users, RefreshCw, Shield, X } from 'lucide-react'
import { NIVELES_ACCESO, normalizarNivelAccesoParaServidor } from '../utils/nivelAcceso'
import {
  verificarLicenciasYRegistrarMiembro,
  MENSAJE_SIN_LICENCIAS,
} from '../utils/gestionEquipoRegistration'
import { DEFAULT_EMPRESA_ID } from '../config/empresa'

const emptyForm = () => ({
  email: '',
  password: '',
  nivel_acceso: 'STAFF',
})

const GestionEquipo = ({ user }) => {
  const [authReady, setAuthReady] = useState(false)
  const [miembros, setMiembros] = useState([])
  const [licencias, setLicencias] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorLista, setErrorLista] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [enviando, setEnviando] = useState(false)
  const [mensajeForm, setMensajeForm] = useState({ tipo: '', texto: '' })

  const emailSesion = String(user?.email || '').toLowerCase()
  const empresaSesion =
    Number(user?.empresa_id) > 0
      ? Number(user.empresa_id)
      : (emailSesion.endsWith('@viajestabora.com') ? 1 : DEFAULT_EMPRESA_ID)

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorLista('')
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      setAuthReady(false)
      setMiembros([])
      setLicencias(null)
      setCargando(false)
      return
    }

    setAuthReady(true)

    const [listRes, licRes] = await Promise.all([
      supabase
        .from('empleados')
        .select('id, email, nombre, created_at, empresa_id')
        .eq('empresa_id', empresaSesion)
        .order('created_at', { ascending: false }),
      supabase.rpc('licencias_equipo_resumen'),
    ])

    if (listRes.error) {
      setMiembros([])
      setErrorLista(
        listRes.error.code === '42501' || /solo_admin/i.test(listRes.error.message)
          ? 'Solo los administradores pueden ver el listado de empleados en Supabase.'
          : listRes.error.message || 'No se pudo cargar el equipo.'
      )
    } else {
      setMiembros(Array.isArray(listRes.data) ? listRes.data : [])
      setErrorLista('')
    }

    if (!licRes.error && licRes.data) {
      setLicencias(licRes.data)
    } else {
      setLicencias(null)
    }

    setCargando(false)
  }, [empresaSesion])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrirModal = () => {
    setForm(emptyForm())
    setMensajeForm({ tipo: '', texto: '' })
    setModalOpen(true)
  }

  const cerrarModal = () => {
    if (enviando) return
    setModalOpen(false)
  }

  const onSubmitMiembro = async (e) => {
    e.preventDefault()
    setMensajeForm({ tipo: '', texto: '' })
    const emailNormalizado = String(form.email || '').trim().toLowerCase()
    if (!emailNormalizado) {
      setMensajeForm({ tipo: 'err', texto: 'El email es obligatorio.' })
      return
    }
    setEnviando(true)
    try {
      const nivel = normalizarNivelAccesoParaServidor(form.nivel_acceso)
      if (!nivel) {
        setMensajeForm({ tipo: 'err', texto: 'El rol debe ser ADMIN, STAFF o GESTORIA (mayúsculas).' })
        setEnviando(false)
        return
      }

      const resultado = await verificarLicenciasYRegistrarMiembro(supabase, {
        email: emailNormalizado,
        password: form.password,
        nivel_acceso: nivel,
      })

      if (!resultado.ok) {
        const esLimite =
          resultado.code === 'LIMITE' ||
          resultado.code === 'SIN_LICENCIAS' ||
          resultado.message === MENSAJE_SIN_LICENCIAS
        setMensajeForm({
          tipo: 'err',
          texto: esLimite ? MENSAJE_SIN_LICENCIAS : resultado.message,
        })
        setEnviando(false)
        return
      }

      setMensajeForm({ tipo: 'ok', texto: resultado.message })
      setForm(emptyForm())
      await cargar()
      setTimeout(() => {
        setModalOpen(false)
        setMensajeForm({ tipo: '', texto: '' })
      }, 1200)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-sky-600" size={28} />
            Gestión de Equipo
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            Empresa asociada a tu sesión: <span className="font-semibold text-slate-800">#{empresaSesion}</span>
            {' · '}
            Los nuevos miembros heredan el <span className="font-semibold">empresa_id</span> del administrador en
            Supabase (no se envía desde el formulario).
          </p>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {!authReady && !cargando && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm mb-6">
          <p className="font-medium">Inicia sesión con Supabase para usar esta sección</p>
          <p className="mt-1 text-amber-800">
            El listado y el alta de miembros usan tu token de Supabase y el <code className="text-xs bg-amber-100 px-1 rounded">empresa_id</code> de{' '}
            <code className="text-xs bg-amber-100 px-1 rounded">app_metadata</code>. Si entras solo con la contraseña maestra del ERP, crea también
            una cuenta en Auth o enlaza la sesión según la política de tu organización.
          </p>
        </div>
      )}

      {licencias && !licencias.error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Licencias usadas</p>
            <p className="text-2xl font-bold text-slate-900">{licencias.usados ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Máximo contratado</p>
            <p className="text-2xl font-bold text-slate-900">{licencias.max ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Disponibles</p>
            <p className="text-2xl font-bold text-emerald-700">{licencias.disponibles ?? '—'}</p>
          </div>
        </div>
      )}

      {licencias?.error === 'sin_perfil' && authReady && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm mb-6">
          No hay fila en <code className="text-xs bg-rose-100 px-1 rounded">public.profiles</code> para tu usuario.
          Tras aplicar la migración <code className="text-xs">gestion-equipo-licencias.sql</code>, inserta tu perfil o
          vuelve a registrarte para generarlo con el trigger.
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={abrirModal}
          disabled={!authReady || !!errorLista}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UserPlus size={20} />
          Añadir miembro
        </button>
      </div>

      {errorLista && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm mb-4">{errorLista}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Shield size={18} className="text-slate-600" />
          <span className="font-semibold text-slate-800">Miembros</span>
        </div>
        {cargando ? (
          <div className="p-8 text-center text-slate-500">Cargando…</div>
        ) : miembros.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No hay miembros para mostrar o aún no tienes permisos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Alta</th>
                </tr>
              </thead>
              <tbody>
                {miembros.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-slate-800">{m.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{m.nombre || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {m.created_at
                        ? new Date(m.created_at).toLocaleString('es-ES', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Añadir miembro</h2>
              <button
                type="button"
                onClick={cerrarModal}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>
            <form onSubmit={onSubmitMiembro} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña inicial</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Rol</label>
                <select
                  value={form.nivel_acceso}
                  onChange={(e) => setForm((f) => ({ ...f, nivel_acceso: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                >
                  {NIVELES_ACCESO.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {mensajeForm.texto && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    mensajeForm.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
                  }`}
                >
                  {mensajeForm.texto}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={enviando}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-50"
                >
                  {enviando ? 'Guardando…' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default GestionEquipo
