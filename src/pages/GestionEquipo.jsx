import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { UserPlus, Users, RefreshCw, Shield, X, Pencil, Trash2 } from 'lucide-react'
import { normalizarNivelAccesoParaServidor } from '../utils/nivelAcceso'
import { verificarLicenciasYRegistrarMiembro, MENSAJE_SIN_LICENCIAS } from '../utils/gestionEquipoRegistration'
import { DEFAULT_EMPRESA_ID } from '../config/empresa'
import { esUsuarioAdmin } from '../utils/userRoles'

const emptyForm = () => ({
  email: '',
  password: '',
  rol: 'Staff',
})

const ROLES_UI = ['Admin', 'Staff', 'Gestoria']
const rolUiANivel = {
  Admin: 'ADMIN',
  Staff: 'STAFF',
  Gestoria: 'GESTORIA',
}

const GestionEquipo = ({ user }) => {
  const isAdmin = esUsuarioAdmin(user)
  const canManageTeam = isAdmin
  console.log('[GestionEquipo] user.nivel_acceso:', user?.nivel_acceso, '| canManageTeam:', canManageTeam)
  const [miembros, setMiembros] = useState([])
  const [licencias, setLicencias] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorLista, setErrorLista] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [enviando, setEnviando] = useState(false)
  const [mensajeForm, setMensajeForm] = useState({ tipo: '', texto: '' })
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [miembroObjetivo, setMiembroObjetivo] = useState(null)
  const [rolEdit, setRolEdit] = useState('Staff')
  const [nombreEdit, setNombreEdit] = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [borrandoMiembro, setBorrandoMiembro] = useState(false)
  const [mensajeAccion, setMensajeAccion] = useState({ tipo: '', texto: '' })

  const [empresaSesion, setEmpresaSesion] = useState(() => {
    const emailSesion = String(user?.email || '').toLowerCase()
    if (Number(user?.empresa_id) > 0) return Number(user.empresa_id)
    return emailSesion.endsWith('@viajestabora.com') ? 1 : DEFAULT_EMPRESA_ID
  })

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorLista('')

    // ── 1. Detectar empresa_id (no bloquea la carga si falla) ─────────────────
    let idABuscar = 1  // Hardcode de seguridad: Tabora id=1
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const { data: miPerfil } = await supabase
          .from('profiles')
          .select('empresa_id')
          .eq('id', authUser.id)
          .maybeSingle()

        let detectado = Number(miPerfil?.empresa_id)
        if (!detectado || detectado <= 0) detectado = Number(authUser.user_metadata?.empresa_id) || 0
        if (!detectado || detectado <= 0) detectado = Number(authUser.app_metadata?.empresa_id) || 0
        if (!detectado || detectado <= 0) {
          detectado = String(authUser.email || '').toLowerCase().endsWith('@viajestabora.com') ? 1 : 0
        }
        if (detectado > 0) idABuscar = detectado
      }
    } catch (_) { /* silencioso: usa el hardcode */ }

    console.log('ID enviado a RPC:', idABuscar)
    setEmpresaSesion(idABuscar)

    // ── 2. Cargar miembros (llamada directa, no bloqueada por auth) ───────────
    const { data, error } = await supabase.rpc('listar_equipo_mi_empresa', { p_empresa_id: idABuscar })
    console.log("Resultado Directo:", data, error)

    if (error) {
      console.error('[GestionEquipo] Error RPC:', error)
      setErrorLista(error.message || 'No se pudo cargar el equipo.')
      setMiembros([])
    } else {
      setMiembros(Array.isArray(data) ? data : [])
      setErrorLista('')
    }

    // ── 3. Licencias ──────────────────────────────────────────────────────────
    const { data: licData, error: licErr } = await supabase.rpc('licencias_equipo_resumen', {
      p_empresa_id: idABuscar,
    })
    if (!licErr && licData) {
      setLicencias(licData)
    } else {
      setLicencias(null)
    }

    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrirModal = () => {
    if (!canManageTeam) return
    setForm(emptyForm())
    setMensajeForm({ tipo: '', texto: '' })
    setModalOpen(true)
  }

  const cerrarModal = () => {
    if (enviando) return
    setModalOpen(false)
  }

  const abrirModalEdicion = (miembro) => {
    if (!canManageTeam) return
    if (!miembro) return
    setMiembroObjetivo(miembro)
    const rolUiActual = ROLES_UI.find((r) => rolUiANivel[r] === String(miembro?.nivel_acceso || '').toUpperCase()) || 'Staff'
    setRolEdit(rolUiActual)
    setNombreEdit(miembro?.nombre || '')
    setMensajeAccion({ tipo: '', texto: '' })
    setEditOpen(true)
  }

  const cerrarModalEdicion = () => {
    if (guardandoEdicion) return
    setEditOpen(false)
    setMiembroObjetivo(null)
  }

  const abrirModalBorrado = (miembro) => {
    if (!canManageTeam) return
    if (!miembro) return
    setMiembroObjetivo(miembro)
    setMensajeAccion({ tipo: '', texto: '' })
    setDeleteOpen(true)
  }

  const cerrarModalBorrado = () => {
    if (borrandoMiembro) return
    setDeleteOpen(false)
    setMiembroObjetivo(null)
  }

  const guardarEdicionMiembro = async (e) => {
    e.preventDefault()
    if (!miembroObjetivo?.id) return
    setMensajeAccion({ tipo: '', texto: '' })
    setGuardandoEdicion(true)
    try {
      const nivel = normalizarNivelAccesoParaServidor(rolUiANivel[rolEdit] || rolEdit)
      if (!nivel) {
        setMensajeAccion({ tipo: 'err', texto: 'Selecciona un rol válido.' })
        return
      }
      const nombreFinal = String(nombreEdit || '').trim()
      const { error } = await supabase
        .from('profiles')
        .update({ nivel_acceso: nivel, nombre: nombreFinal || null })
        .eq('id', miembroObjetivo.id)
        .eq('empresa_id', empresaSesion)

      if (error) {
        setMensajeAccion({ tipo: 'err', texto: error.message || 'No se pudo actualizar el miembro.' })
        return
      }
      setMensajeAccion({ tipo: 'ok', texto: 'Miembro actualizado correctamente.' })
      await cargar()
      setTimeout(() => {
        setEditOpen(false)
        setMiembroObjetivo(null)
        setMensajeAccion({ tipo: '', texto: '' })
      }, 900)
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const confirmarBorradoMiembro = async () => {
    if (!miembroObjetivo?.id) return
    setMensajeAccion({ tipo: '', texto: '' })
    setBorrandoMiembro(true)
    try {
      const { error } = await supabase.rpc('eliminar_miembro_equipo', {
        user_id_to_delete: miembroObjetivo.id,
        target_empresa_id: empresaSesion,
      })

      if (error) {
        setMensajeAccion({ tipo: 'err', texto: error.message || 'No se pudo eliminar el miembro.' })
        return
      }
      setMensajeAccion({ tipo: 'ok', texto: 'Miembro eliminado correctamente.' })
      await cargar()
      setTimeout(() => {
        setDeleteOpen(false)
        setMiembroObjetivo(null)
        setMensajeAccion({ tipo: '', texto: '' })
      }, 900)
    } finally {
      setBorrandoMiembro(false)
    }
  }

  const onSubmitMiembro = async (e) => {
    e.preventDefault()
    setMensajeForm({ tipo: '', texto: '' })
    const emailNormalizado = String(form.email || '').trim().toLowerCase()
    if (!emailNormalizado) {
      setMensajeForm({ tipo: 'err', texto: 'El email es obligatorio.' })
      return
    }
    const disponiblesRpc = Number(licencias?.disponibles)
    if (licencias && Number.isFinite(disponiblesRpc) && disponiblesRpc <= 0) {
      setMensajeForm({ tipo: 'err', texto: MENSAJE_SIN_LICENCIAS })
      return
    }

    setEnviando(true)
    try {
      const nivel = normalizarNivelAccesoParaServidor(rolUiANivel[form.rol] || form.rol)
      if (!nivel) {
        setMensajeForm({ tipo: 'err', texto: 'Selecciona un Rol de Acceso válido (Admin, Staff o Gestoria).' })
        setEnviando(false)
        return
      }

      // Flujo: Auth.signUp → insert en empleados (todo en el helper, sin Edge Function)
      const resultado = await verificarLicenciasYRegistrarMiembro(supabase, {
        email: emailNormalizado,
        password: form.password,
        nivel_acceso: nivel,
        rol_ui: form.rol,
        empresa_id: empresaSesion,
        permitirSinConteo: isAdmin,
      })

      if (!resultado.ok) {
        const esLimite = resultado.code === 'SIN_LICENCIAS' || resultado.message === MENSAJE_SIN_LICENCIAS
        setMensajeForm({
          tipo: 'err',
          texto: esLimite ? MENSAJE_SIN_LICENCIAS : resultado.message,
        })
        setEnviando(false)
        return
      }

      setMensajeForm({ tipo: 'ok', texto: 'Usuario creado correctamente' })
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

      {licencias?.error === 'sin_perfil' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm mb-6">
          No hay fila en <code className="text-xs bg-rose-100 px-1 rounded">public.profiles</code> para tu usuario.
          Tras aplicar la migración <code className="text-xs">gestion-equipo-licencias.sql</code>, inserta tu perfil o
          vuelve a registrarte para generarlo con el trigger.
        </div>
      )}

      {(() => {
        // Límite de licencias: se bloquea cuando los miembros actuales alcanzan max_usuarios
        const maxLic    = Number(licencias?.max)
        const limiteAlcanzado = licencias != null && Number.isFinite(maxLic) && miembros.length >= maxLic
        return (
          <>
            {limiteAlcanzado && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm mb-4 flex items-center gap-2">
                <Shield size={16} className="shrink-0 text-amber-600" />
                Has alcanzado el límite de <strong className="mx-1">{maxLic}</strong> licencias contratadas.
                Contacta con Tabora para ampliar tu plan.
              </div>
            )}
            {!limiteAlcanzado && licencias && Number.isFinite(Number(licencias?.disponibles)) && Number(licencias.disponibles) <= 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm mb-4">
                Cupo de licencias agotado para esta agencia.
              </div>
            )}
            <div className="flex justify-end mb-4">
              {canManageTeam && (
                <button
                  type="button"
                  onClick={abrirModal}
                  disabled={!!errorLista || limiteAlcanzado}
                  title={limiteAlcanzado ? `Límite de ${maxLic} licencias alcanzado` : undefined}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <UserPlus size={20} />
                  Añadir miembro
                </button>
              )}
            </div>
          </>
        )
      })()}

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
          <div className="p-8 text-center text-slate-500">
            No hay miembros registrados en la empresa #{empresaSesion}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Alta</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {miembros.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-slate-800">{m.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{m.nombre || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{m.nivel_acceso || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {m.created_at
                        ? new Date(m.created_at).toLocaleString('es-ES', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {canManageTeam && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => abrirModalEdicion(m)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
                          >
                            <Pencil size={14} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirModalBorrado(m)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 size={14} />
                            Borrar
                          </button>
                        </div>
                      )}
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Rol de Acceso</label>
                <select
                  required
                  value={form.rol}
                  onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                >
                  {ROLES_UI.map((rol) => (
                    <option key={rol} value={rol}>
                      {rol}
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
                  disabled={
                    enviando ||
                    (licencias && Number.isFinite(Number(licencias?.disponibles)) && Number(licencias.disponibles) <= 0)
                  }
                  className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-50"
                >
                  {enviando ? 'Guardando…' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Editar miembro</h2>
              <button
                type="button"
                onClick={cerrarModalEdicion}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>
            <form onSubmit={guardarEdicionMiembro} className="p-5 space-y-4">
              <div className="text-sm text-slate-700">
                Email: <span className="font-semibold">{miembroObjetivo?.email || '—'}</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                <input
                  type="text"
                  value={nombreEdit}
                  onChange={(e) => setNombreEdit(e.target.value)}
                  placeholder="Nombre del miembro"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nivel de Acceso</label>
                <select
                  required
                  value={rolEdit}
                  onChange={(e) => setRolEdit(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                >
                  {ROLES_UI.map((rol) => (
                    <option key={rol} value={rol}>
                      {rol}
                    </option>
                  ))}
                </select>
              </div>

              {mensajeAccion.texto && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    mensajeAccion.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
                  }`}
                >
                  {mensajeAccion.texto}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrarModalEdicion}
                  disabled={guardandoEdicion}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-50"
                >
                  {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Confirmar borrado</h2>
              <button
                type="button"
                onClick={cerrarModalBorrado}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-700">
                ¿Estás seguro de que deseas eliminar a{' '}
                <span className="font-semibold">
                  {miembroObjetivo?.nombre || miembroObjetivo?.email || '—'}
                </span>
                ? Esta acción es definitiva.
              </p>

              {mensajeAccion.texto && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    mensajeAccion.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
                  }`}
                >
                  {mensajeAccion.texto}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={cerrarModalBorrado}
                  disabled={borrandoMiembro}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarBorradoMiembro}
                  disabled={borrandoMiembro}
                  className="flex-1 py-2.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50"
                >
                  {borrandoMiembro ? 'Eliminando…' : 'Eliminar miembro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GestionEquipo
