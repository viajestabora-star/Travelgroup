import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabase'
import { UserPlus, Users, RefreshCw, Shield, X, Pencil, Trash2, Building2, Lock } from 'lucide-react'
import { normalizarNivelAccesoParaServidor } from '../utils/nivelAcceso'
import { verificarLicenciasYRegistrarMiembro, MENSAJE_SIN_LICENCIAS } from '../utils/gestionEquipoRegistration'
import { esUsuarioAdmin } from '../utils/userRoles'
import { obtenerEmpresaIdTenantDesdePerfil, empresaIdDesdeJwtUsuario } from '../utils/tenantEmpresa'
import { obtenerResumenLicenciasEmpresa } from '../utils/licenciasEmpresa'
import { resolverLogoAccesible } from '../utils/datosEmisorEmpresa'
import CambioContraseñaForm from '../components/CambioContraseñaForm'

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

const PROFILE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `profiles.id` coincide con `auth.users.id` (UUID). Rechaza números y strings cortos tipo `"1"` (p. ej. empresa_id mal mapeado). */
function esProfileUserIdValido(val) {
  if (val == null) return false
  if (typeof val === 'number') return false
  const s = String(val).trim()
  if (s.length < 32) return false
  return PROFILE_UUID_RE.test(s)
}

/** Si la RPC devuelve `id` equivocado (p. ej. empresa_id numérico en columna id), intentar otros campos. `id` va al final para no confundir con INTEGER/Text corto. */
function resolverProfileUuidDesdeFila(row) {
  if (!row || typeof row !== 'object') return null
  const keys = ['user_id', 'profile_id', 'usuario_id', 'auth_user_id', 'id']
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'number') continue
    if (typeof v === 'string' && /^[0-9]+$/.test(v.trim())) continue
    if (esProfileUserIdValido(v)) return String(v).trim()
  }
  return null
}

/** Asegura `profiles.id` (UUID) y `empresa_id` en cada fila para borrar/editar con el tenant correcto. */
function normalizarMiembrosEquipo(rows, empresaFallback = null) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const uuid = resolverProfileUuidDesdeFila(row)
    const empRaw = row?.empresa_id != null ? Number(row.empresa_id) : empresaFallback
    const empresa_id = Number.isFinite(empRaw) && empRaw > 0 ? empRaw : null

    if (uuid && String(row.id) !== uuid) {
      console.warn('[GestionEquipo] id de fila no es UUID de perfil; usando UUID corregido.', {
        idRpc: row.id,
        uuidPerfil: uuid,
        email: row.email,
      })
    }
    const base = uuid ? { ...row, id: uuid } : { ...row }
    return empresa_id != null ? { ...base, empresa_id } : base
  })
}

/** Para updates/deletes: empresa del perfil en pantalla si viene informada; si no, sesión activa. */
function empresaIdObjetivoMiembro(miembro, empresaSesion) {
  const deFila = Number(miembro?.empresa_id)
  if (Number.isFinite(deFila) && deFila > 0) return deFila
  const ses = Number(empresaSesion)
  return Number.isFinite(ses) && ses > 0 ? ses : null
}

const GestionEquipo = ({ user }) => {
  const isAdmin = esUsuarioAdmin(user)
  const canManageTeam = isAdmin
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

  const [tenantCfgRep, setTenantCfgRep] = useState('21')
  const [tenantCfgSop, setTenantCfgSop] = useState('21')
  const [tenantCfgLogo, setTenantCfgLogo] = useState('')
  const [cargandoCfgTenant, setCargandoCfgTenant] = useState(false)
  const [guardandoCfgTenant, setGuardandoCfgTenant] = useState(false)
  const [mensajeCfgTenant, setMensajeCfgTenant] = useState({ tipo: '', texto: '' })
  const [pestana, setPestana] = useState('equipo')
  const [logoPreviewSrc, setLogoPreviewSrc] = useState('')

  const [empresaSesion, setEmpresaSesion] = useState(() => {
    const id = Number(user?.empresa_id)
    return id > 0 ? id : null
  })

  /** Solo filas cuyo empresa_id coincide con el tenant activo (defensa tras la query explícita .eq). */
  const miembrosVisibles = useMemo(() => {
    if (!empresaSesion) return []
    const tid = Number(empresaSesion)
    return miembros.filter((m) => Number(m?.empresa_id) === tid)
  }, [miembros, empresaSesion])

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorLista('')

    // ── 1. Tenant determinista: primero sesión de aplicación (user), luego JWT, último perfil propio acotado.
    let currentTenantId = null
    const fromSession = Number(user?.empresa_id)
    if (Number.isFinite(fromSession) && fromSession > 0) {
      currentTenantId = fromSession
    }

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!currentTenantId && authUser) {
        const jwtE = empresaIdDesdeJwtUsuario(authUser)
        if (jwtE) currentTenantId = jwtE
      }

      if (!currentTenantId && authUser?.id) {
        let miPerfil = null
        const jwtE = empresaIdDesdeJwtUsuario(authUser)
        if (jwtE) {
          const { data } = await supabase
            .from('profiles')
            .select('empresa_id')
            .eq('id', authUser.id)
            .eq('empresa_id', jwtE)
            .maybeSingle()
          miPerfil = data
        } else {
          let lsHint = 0
          try {
            const raw = localStorage.getItem('sesion_tabora')
            if (raw) lsHint = Number(JSON.parse(raw).empresa_id) || 0
          } catch (_) {}
          let q2 = supabase.from('profiles').select('empresa_id').eq('id', authUser.id)
          if (lsHint > 0) q2 = q2.eq('empresa_id', lsHint)
          const { data } = await q2.maybeSingle()
          miPerfil = data
        }

        const detectado =
          (Number(miPerfil?.empresa_id) > 0 ? Number(miPerfil.empresa_id) : 0) ||
          empresaIdDesdeJwtUsuario(authUser) ||
          Number(authUser.app_metadata?.empresa_id) ||
          Number(authUser.user_metadata?.empresa_id) ||
          0
        if (detectado > 0) currentTenantId = detectado
      }
    } catch (_) { /* silencioso */ }

    if (!currentTenantId || currentTenantId <= 0) {
      setCargando(false)
      setMiembros([])
      setErrorLista('No se pudo determinar tu empresa. Espera a que cargue la sesión o vuelve a iniciar sesión.')
      return
    }

    setEmpresaSesion(currentTenantId)

    try {
      // ── 2. Equipo: orden por email/id (PK en UUID); nunca por created_at si la columna no existe en BD.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('empresa_id', currentTenantId)
        .order('id', { ascending: true })

      if (error) {
        setErrorLista(error.message || 'No se pudo cargar el equipo.')
        setMiembros([])
      } else {
        const rows = normalizarMiembrosEquipo(Array.isArray(data) ? data : [], currentTenantId)
        setMiembros(rows)
        setErrorLista('')
      }

      const lic = await obtenerResumenLicenciasEmpresa(supabase, currentTenantId)
      if (lic.ok && lic.resumen) {
        setLicencias(lic.resumen)
      } else {
        setLicencias({ error: 'carga', detalle: lic.error || '' })
      }
    } catch (_) {
      setErrorLista('No se pudo completar la carga del equipo.')
      setMiembros([])
      setLicencias({ error: 'carga', detalle: '' })
    } finally {
      setCargando(false)
    }
  }, [user])

  const cargarConfiguracionTenantEmpresa = useCallback(async () => {
    setCargandoCfgTenant(true)
    setMensajeCfgTenant({ tipo: '', texto: '' })
    try {
      let empresaIdNum = Number(user?.empresa_id)
      if (!Number.isFinite(empresaIdNum) || empresaIdNum <= 0) {
        const res = await obtenerEmpresaIdTenantDesdePerfil(supabase)
        empresaIdNum = Number(res.empresaId)
      }
      if (!Number.isFinite(empresaIdNum) || empresaIdNum <= 0) {
        setTenantCfgRep('21')
        setTenantCfgSop('21')
        setTenantCfgLogo('')
        return
      }

      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', empresaIdNum)
        .single()

      if (error || !data) {
        setTenantCfgRep('21')
        setTenantCfgSop('21')
        setTenantCfgLogo('')
        return
      }

      setTenantCfgRep(
        data?.config_iva_repercutido != null && data.config_iva_repercutido !== ''
          ? String(data.config_iva_repercutido)
          : '21'
      )
      setTenantCfgSop(
        data?.config_iva_soportado != null && data.config_iva_soportado !== ''
          ? String(data.config_iva_soportado)
          : '21'
      )
      setTenantCfgLogo(String(data?.logo_url || '').trim())
    } catch (_) {
      setTenantCfgRep('21')
      setTenantCfgSop('21')
      setTenantCfgLogo('')
    } finally {
      setCargandoCfgTenant(false)
    }
  }, [user])

  const guardarConfiguracionTenantEmpresa = async (e) => {
    e.preventDefault()
    if (!canManageTeam) return
    setMensajeCfgTenant({ tipo: '', texto: '' })
    setGuardandoCfgTenant(true)
    try {
      let empresaId = Number(user?.empresa_id)
      if (!Number.isFinite(empresaId) || empresaId <= 0) {
        const res = await obtenerEmpresaIdTenantDesdePerfil(supabase)
        if (res.error || !res.empresaId) {
          setMensajeCfgTenant({
            tipo: 'err',
            texto: res.error || 'No se pudo identificar tu agencia; no se guardaron los cambios.',
          })
          return
        }
        empresaId = Number(res.empresaId)
      }
      const rep = parseFloat(String(tenantCfgRep || '').replace(',', '.'))
      const sop = parseFloat(String(tenantCfgSop || '').replace(',', '.'))
      if (
        !Number.isFinite(rep) ||
        rep < 0 ||
        rep > 100 ||
        !Number.isFinite(sop) ||
        sop < 0 ||
        sop > 100
      ) {
        setMensajeCfgTenant({
          tipo: 'err',
          texto: 'Los porcentajes de IVA deben ser números entre 0 y 100.',
        })
        return
      }
      const { error: upErr } = await supabase
        .from('empresas')
        .update({
          config_iva_repercutido: rep,
          config_iva_soportado: sop,
          logo_url: tenantCfgLogo.trim() === '' ? null : tenantCfgLogo.trim(),
        })
        .eq('id', empresaId)

      if (upErr) {
        setMensajeCfgTenant({ tipo: 'err', texto: upErr.message || 'Error al guardar.' })
        return
      }
      setMensajeCfgTenant({ tipo: 'ok', texto: 'Configuración del tenant guardada correctamente.' })
    } catch (_) {
      setMensajeCfgTenant({ tipo: 'err', texto: 'No se pudo guardar la configuración. Inténtalo de nuevo.' })
    } finally {
      setGuardandoCfgTenant(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    cargarConfiguracionTenantEmpresa()
  }, [cargarConfiguracionTenantEmpresa])

  useEffect(() => {
    const raw = String(tenantCfgLogo || '').trim()
    if (!raw) {
      setLogoPreviewSrc('')
      return
    }
    let cancelled = false
    resolverLogoAccesible(raw)
      .then((url) => {
        if (!cancelled) setLogoPreviewSrc(url || raw)
      })
      .catch(() => {
        if (!cancelled) setLogoPreviewSrc(raw)
      })
    return () => {
      cancelled = true
    }
  }, [tenantCfgLogo])

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
    if (!esProfileUserIdValido(miembro.id)) {
      console.error('[GestionEquipo] Edición abortada: se esperaba UUID de profiles; valor recibido:', miembro.id, miembro)
      setErrorLista('No se puede editar: identificador de usuario inválido. Recarga la página.')
      return
    }
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
    if (!esProfileUserIdValido(miembro.id)) {
      console.error('[GestionEquipo] Borrado abortado: se esperaba UUID de profiles; valor recibido:', miembro.id, miembro)
      setErrorLista('No se puede borrar: identificador de usuario inválido. Recarga la página.')
      return
    }
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
    const profileId = miembroObjetivo?.id
    const profileIdStr = String(profileId ?? '').trim()
    if (profileIdStr.length < 30) {
      console.error('ID no es UUID válido', profileIdStr)
      setMensajeAccion({
        tipo: 'err',
        texto: 'Identificador de usuario inválido; no se envió la petición.',
      })
      return
    }
    if (!esProfileUserIdValido(profileId)) {
      console.error('[GestionEquipo] Actualización abortada: user.id debe ser UUID de profiles; recibido:', profileId, miembroObjetivo)
      setMensajeAccion({
        tipo: 'err',
        texto: 'Identificador de usuario inválido; no se envió la petición.',
      })
      return
    }
    setMensajeAccion({ tipo: '', texto: '' })
    setGuardandoEdicion(true)
    try {
      const nivel = normalizarNivelAccesoParaServidor(rolUiANivel[rolEdit] || rolEdit)
      if (!nivel) {
        setMensajeAccion({ tipo: 'err', texto: 'Selecciona un rol válido.' })
        return
      }
      const empresaFila = empresaIdObjetivoMiembro(miembroObjetivo, empresaSesion)
      if (!empresaFila) {
        setMensajeAccion({ tipo: 'err', texto: 'No se pudo determinar la empresa del miembro.' })
        return
      }

      const nombreFinal = String(nombreEdit || '').trim()
      const { error } = await supabase
        .from('profiles')
        .update({ nivel_acceso: nivel, nombre: nombreFinal || null })
        .eq('id', profileIdStr)
        .eq('empresa_id', empresaFila)

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
    const userIdPerfil = miembroObjetivo?.id
    const id = String(userIdPerfil ?? '').trim()
    if (id.length < 30) {
      console.error('ID no es UUID válido', id)
      setMensajeAccion({
        tipo: 'err',
        texto: 'Identificador de usuario inválido; no se envió la petición.',
      })
      return
    }
    if (!esProfileUserIdValido(userIdPerfil)) {
      console.error('[GestionEquipo] RPC eliminar abortada: user_id_to_delete debe ser UUID de profiles; recibido:', userIdPerfil, miembroObjetivo)
      setMensajeAccion({
        tipo: 'err',
        texto: 'Identificador de usuario inválido; no se envió la petición.',
      })
      return
    }
    const targetEmpresaId = empresaIdObjetivoMiembro(miembroObjetivo, empresaSesion)
    if (!targetEmpresaId) {
      console.error('[GestionEquipo] Sin empresa destino para borrado:', miembroObjetivo)
      setMensajeAccion({ tipo: 'err', texto: 'No se pudo determinar la empresa del usuario a borrar.' })
      return
    }
    setMensajeAccion({ tipo: '', texto: '' })
    setBorrandoMiembro(true)
    try {
      const { error } = await supabase.rpc('eliminar_miembro_equipo', {
        user_id_to_delete: id,
        target_empresa_id: targetEmpresaId,
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
        </div>
        <button
          type="button"
          onClick={() => {
            cargar()
            cargarConfiguracionTenantEmpresa()
          }}
          disabled={cargando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setPestana('equipo')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors ${
            pestana === 'equipo'
              ? 'bg-white border-slate-200 text-sky-700 -mb-px'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Users size={18} />
            Equipo
          </span>
        </button>
        <button
          type="button"
          onClick={() => setPestana('seguridad')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors ${
            pestana === 'seguridad'
              ? 'bg-white border-slate-200 text-sky-700 -mb-px'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Lock size={18} />
            Seguridad
          </span>
        </button>
      </div>

      {pestana === 'seguridad' && (
        <div className="max-w-xl mb-8">
          <CambioContraseñaForm />
        </div>
      )}

      {pestana === 'equipo' && (
      <>
      {licencias && !licencias.error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Contratadas</p>
            <p className="text-2xl font-bold text-slate-900">{licencias.contratadas ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Usadas</p>
            <p className="text-2xl font-bold text-slate-900">{licencias.usados ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Disponibles</p>
            <p className="text-2xl font-bold text-emerald-700">{licencias.disponibles ?? '—'}</p>
          </div>
        </div>
      )}

      {licencias?.error === 'carga' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm mb-6">
          No se pudieron cargar las licencias.{licencias.detalle ? ` ${licencias.detalle}` : ''}
        </div>
      )}

      {(() => {
        // Límite: usadas >= contratadas (max_usuarios)
        const cupoContratado = Number(licencias?.contratadas)
        const usadosLic = Number(licencias?.usados)
        const limiteAlcanzado =
          licencias != null &&
          !licencias.error &&
          Number.isFinite(cupoContratado) &&
          Number.isFinite(usadosLic) &&
          usadosLic >= cupoContratado
        return (
          <>
            {limiteAlcanzado && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm mb-4 flex items-center gap-2">
                <Shield size={16} className="shrink-0 text-amber-600" />
                Has alcanzado el límite de <strong className="mx-1">{cupoContratado}</strong> licencias contratadas.
                Contacta con el administrador para ampliar tu plan.
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
                  title={limiteAlcanzado ? `Límite de ${cupoContratado} licencias alcanzado` : undefined}
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

      {canManageTeam && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <Building2 size={18} className="text-slate-600" />
            <span className="font-semibold text-slate-800">Configuración de la agencia</span>
          </div>
          <div className="p-4 md:p-5 space-y-4">
            {cargandoCfgTenant ? (
              <div className="text-sm text-slate-500">Cargando configuración fiscal…</div>
            ) : (
              <form onSubmit={guardarConfiguracionTenantEmpresa} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    IVA repercutido (% por defecto)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tenantCfgRep}
                    onChange={(e) => setTenantCfgRep(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    IVA soportado (% por defecto)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tenantCfgSop}
                    onChange={(e) => setTenantCfgSop(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    URL del logo (empresa)
                  </label>
                  <input
                    type="text"
                    placeholder="URL pública o ruta de almacenamiento"
                    value={tenantCfgLogo}
                    onChange={(e) => setTenantCfgLogo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  />
                  {logoPreviewSrc !== '' && (
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs text-slate-500">Vista previa:</span>
                      <img
                        key={logoPreviewSrc}
                        src={logoPreviewSrc}
                        alt="Logo de la agencia"
                        className="h-10 max-w-[160px] object-contain border border-slate-200 rounded bg-white p-1"
                        onError={(ev) => {
                          ev.currentTarget.style.display = 'none'
                        }}
                      />
                    </div>
                  )}
                </div>

                {mensajeCfgTenant.texto && (
                  <div
                    className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${
                      mensajeCfgTenant.tipo === 'ok'
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'bg-rose-50 text-rose-900'
                    }`}
                  >
                    {mensajeCfgTenant.texto}
                  </div>
                )}

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={guardandoCfgTenant || cargandoCfgTenant}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white font-semibold hover:bg-slate-900 disabled:opacity-50"
                  >
                    {guardandoCfgTenant ? 'Guardando…' : 'Guardar configuración del tenant'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Shield size={18} className="text-slate-600" />
          <span className="font-semibold text-slate-800">Miembros</span>
        </div>
        {cargando ? (
          <div className="p-8 text-center text-slate-500">Cargando…</div>
        ) : miembrosVisibles.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No hay miembros registrados.</div>
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
                {miembrosVisibles.map((m, idx) => (
                  <tr
                    key={esProfileUserIdValido(m.id) ? m.id : `${String(m.email || '')}-${idx}`}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                  >
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
                            disabled={!esProfileUserIdValido(m.id)}
                            title={!esProfileUserIdValido(m.id) ? 'Identificador de usuario no válido para editar' : undefined}
                            onClick={() => abrirModalEdicion(m)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <Pencil size={14} />
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={!esProfileUserIdValido(m.id)}
                            title={!esProfileUserIdValido(m.id) ? 'Identificador de usuario no válido para borrar' : undefined}
                            onClick={() => abrirModalBorrado(m)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:pointer-events-none"
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
                ¿Estás seguro de borrar a{' '}
                <span className="font-semibold">
                  {String(miembroObjetivo?.nombre || '').trim() ||
                    miembroObjetivo?.email ||
                    'este usuario'}
                </span>
                ?
              </p>
              <p className="text-xs text-slate-500">Esta acción es definitiva.</p>

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
      </>
      )}
    </div>
  )
}

export default GestionEquipo
