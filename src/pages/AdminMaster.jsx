import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2, RefreshCw, Pencil, X, Save, ShieldAlert,
  Calculator, Euro, Users, Mail, Phone, MapPin, FileText,
  UserCog, Check, AlertCircle, UserPlus, KeyRound, PlusCircle, Trash2,
} from 'lucide-react'
import { supabase } from '../supabase'
import { useSaasManagement } from '../hooks/useSaasManagement'
import { normalizarNivelAccesoParaServidor } from '../utils/nivelAcceso'
import { MASTER_EMPRESA_ID } from '../utils/adminMasterAccess'
import { portalConsultarTieneAuth } from '../utils/portalAuthEmail'

// ─── Constantes ──────────────────────────────────────────────────────────────
const PLANES     = ['basic', 'professional', 'enterprise']
const ROLES_UI   = ['Admin', 'Staff', 'Gestoria']
const rolUiANivel = { Admin: 'ADMIN', Staff: 'STAFF', Gestoria: 'GESTORIA' }
const nivelAUi    = { ADMIN: 'Admin', STAFF: 'Staff', GESTORIA: 'Gestoria' }

// ─── Helpers de resolución (lectura desde la vista) ──────────────────────────

const resolveId      = (row) => row?.id ?? row?.empresa_id ?? null
const resolveNombre  = (row) => row?.nombre_comercial || row?.saas_razon_social || row?.nombre || '—'
const resolveCif     = (row) => row?.cif || row?.saas_nif || row?.nif || '—'
const resolvePlan    = (row) => row?.plan_tipo || row?.tipo_plan || row?.saas_nombre_plan || '—'
const resolveMaxU    = (row) => row?.max_usuarios ?? row?.saas_max_usuarios ?? row?.limite_usuarios_staff ?? '—'
const resolveFecha   = (row) => {
  const v = row?.fecha_expiracion ?? row?.saas_fecha_expiracion
  if (!v) return '—'
  try { return String(v).slice(0, 10) } catch { return '—' }
}
const resolveSuscripcion = (row) => {
  const v = row?.suscripcion_activa ?? row?.saas_suscripcion_activa
  if (typeof v === 'boolean') return v ? 'Activa' : 'Inactiva'
  return row?.estado_suscripcion || '—'
}
const resolvePrecioBase  = (row) => row?.saas_precio_pack_base     ?? 60
const resolvePrecioExtra = (row) => row?.saas_precio_usuario_extra ?? 12

// ─── Cálculo de coste mensual ─────────────────────────────────────────────────
// · empresa_id === MASTER_EMPRESA_ID (Integer, empresa raíz) → 0 €
// · max_usuarios ≤ 3 → saas_precio_pack_base
// · max_usuarios > 3 → saas_precio_pack_base + (max_usuarios - 3) * saas_precio_usuario_extra

const calcCoste = (precioBase, precioExtra, maxUsuarios, esMatriz = false) => {
  if (esMatriz) return 0
  const base  = Number(precioBase)  || 0
  const extra = Number(precioExtra) || 0
  const users = Math.max(0, Number(maxUsuarios) || 0)
  if (users <= 3) return base
  return base + (users - 3) * extra
}

// ─── Estado inicial del formulario ───────────────────────────────────────────

const buildForm = (row) => ({
  nombre_comercial:          row?.nombre_comercial   || '',
  plan_tipo:                 row?.plan_tipo          || row?.tipo_plan || '',
  max_usuarios:              Number(row?.max_usuarios ?? row?.saas_max_usuarios ?? row?.limite_usuarios_staff ?? 1),
  suscripcion_activa:        typeof (row?.suscripcion_activa ?? row?.saas_suscripcion_activa) === 'boolean'
                               ? (row?.suscripcion_activa ?? row?.saas_suscripcion_activa)
                               : true,
  fecha_expiracion:          (row?.fecha_expiracion ?? row?.saas_fecha_expiracion)
                               ? String(row?.fecha_expiracion ?? row?.saas_fecha_expiracion).slice(0, 10)
                               : '',
  saas_razon_social:         row?.saas_razon_social       || '',
  saas_nif:                  row?.saas_nif                || '',
  saas_email_facturacion:    row?.saas_email_facturacion  || '',
  saas_telefono:             row?.saas_telefono           || '',
  saas_direccion:            row?.saas_direccion          || '',
  saas_precio_pack_base:     Number(row?.saas_precio_pack_base     ?? 60),
  saas_precio_usuario_extra: Number(row?.saas_precio_usuario_extra ?? 12),
})

// ─── Micro-componentes de formulario ─────────────────────────────────────────

const Seccion = ({ titulo, children }) => (
  <fieldset className="rounded-lg border border-slate-200 p-4 space-y-3">
    <legend className="px-1 text-xs font-bold text-slate-500 uppercase tracking-wider">{titulo}</legend>
    {children}
  </fieldset>
)

const Campo = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
)

const inputCls         = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 outline-none text-sm'
const inputDisabledCls = 'w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-400 cursor-not-allowed text-sm'

// ─── Pestaña: Datos de la empresa ─────────────────────────────────────────────

const EmpresaTab = ({ row, esMatriz, onSave, onClose }) => {
  const [form, setForm]       = useState(buildForm(row))
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState({ tipo: '', texto: '' })

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const costeEstimado = useMemo(
    () => calcCoste(form.saas_precio_pack_base, form.saas_precio_usuario_extra, form.max_usuarios, esMatriz),
    [form.saas_precio_pack_base, form.saas_precio_usuario_extra, form.max_usuarios, esMatriz],
  )
  const usuariosExtra = Math.max(0, form.max_usuarios - 3)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaveMsg({ tipo: '', texto: '' })
    setSaving(true)
    const changes = {
      nombre_comercial:          form.nombre_comercial.trim()     || null,
      suscripcion_activa:        form.suscripcion_activa,
      fecha_expiracion:          form.fecha_expiracion            || null,
      max_usuarios:              Math.max(1, parseInt(form.max_usuarios, 10) || 1),
      ...(esMatriz ? {} : { plan_tipo: form.plan_tipo.trim() || null }),
      saas_razon_social:         form.saas_razon_social.trim()        || null,
      saas_nif:                  form.saas_nif.trim()                  || null,
      saas_email_facturacion:    form.saas_email_facturacion.trim()    || null,
      saas_telefono:             form.saas_telefono.trim()             || null,
      saas_direccion:            form.saas_direccion.trim()            || null,
      saas_precio_pack_base:     Number(form.saas_precio_pack_base)    || 60,
      saas_precio_usuario_extra: Number(form.saas_precio_usuario_extra) || 12,
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
    <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">

      <Seccion titulo="Datos operativos">
        <Campo label="Nombre comercial">
          <input type="text" value={form.nombre_comercial}
            onChange={(e) => set('nombre_comercial', e.target.value)}
            className={inputCls} placeholder="Nombre de la empresa" />
        </Campo>

        <Campo label={<>Plan{esMatriz && <span className="ml-2 text-amber-600 font-normal">(protegido)</span>}</>}>
          {esMatriz ? (
            <input type="text" value={resolvePlan(row)} disabled className={inputDisabledCls} />
          ) : (
            <select value={form.plan_tipo} onChange={(e) => set('plan_tipo', e.target.value)}
              className={`${inputCls} bg-white`}>
              <option value="">— Sin plan asignado —</option>
              {PLANES.map((p) => <option key={p} value={p}>{p}</option>)}
              {form.plan_tipo && !PLANES.includes(form.plan_tipo) && (
                <option value={form.plan_tipo}>{form.plan_tipo}</option>
              )}
            </select>
          )}
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Estado suscripción">
            <select value={form.suscripcion_activa ? 'true' : 'false'}
              onChange={(e) => set('suscripcion_activa', e.target.value === 'true')}
              className={`${inputCls} bg-white`}>
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
          </Campo>
          <Campo label="Fecha de expiración">
            <input type="date" value={form.fecha_expiracion}
              onChange={(e) => set('fecha_expiracion', e.target.value)}
              className={inputCls} />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Datos fiscales y de contacto">
        <div className="grid grid-cols-2 gap-3">
          <Campo label={<span className="flex items-center gap-1"><FileText size={12} />Razón social</span>}>
            <input type="text" value={form.saas_razon_social}
              onChange={(e) => set('saas_razon_social', e.target.value)}
              className={inputCls} placeholder="saas_razon_social" />
          </Campo>
          <Campo label={<><span className="flex items-center gap-1"><FileText size={12} />NIF / CIF</span>
            {esMatriz && <span className="ml-2 text-amber-600 font-normal">(protegido)</span>}</>}>
            <input type="text" value={form.saas_nif}
              onChange={(e) => set('saas_nif', e.target.value)}
              disabled={esMatriz}
              className={esMatriz ? inputDisabledCls : inputCls}
              placeholder="saas_nif" />
          </Campo>
        </div>

        <Campo label={<span className="flex items-center gap-1"><Mail size={12} />Email de facturación</span>}>
          <input type="email" value={form.saas_email_facturacion}
            onChange={(e) => set('saas_email_facturacion', e.target.value)}
            className={inputCls} placeholder="saas_email_facturacion" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label={<span className="flex items-center gap-1"><Phone size={12} />Teléfono</span>}>
            <input type="tel" value={form.saas_telefono}
              onChange={(e) => set('saas_telefono', e.target.value)}
              className={inputCls} placeholder="saas_telefono" />
          </Campo>
          <Campo label={<span className="flex items-center gap-1"><MapPin size={12} />Dirección</span>}>
            <input type="text" value={form.saas_direccion}
              onChange={(e) => set('saas_direccion', e.target.value)}
              className={inputCls} placeholder="saas_direccion" />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Precios y licencias">
        <div className="grid grid-cols-3 gap-3 items-end">
          <Campo label={<span className="flex items-center gap-1"><Euro size={12} />Precio pack base</span>} hint="saas_precio_pack_base">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
              <input type="number" min={0} step={0.01} value={form.saas_precio_pack_base}
                onChange={(e) => set('saas_precio_pack_base', parseFloat(e.target.value) || 0)}
                className={`${inputCls} pl-7`} />
            </div>
          </Campo>
          <Campo label={<span className="flex items-center gap-1"><Users size={12} />Precio usuario extra</span>} hint="saas_precio_usuario_extra">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
              <input type="number" min={0} step={0.01} value={form.saas_precio_usuario_extra}
                onChange={(e) => set('saas_precio_usuario_extra', parseFloat(e.target.value) || 0)}
                className={`${inputCls} pl-7`} />
            </div>
          </Campo>
          <Campo label={<span className="flex items-center gap-1"><Users size={12} />Máx. usuarios</span>}>
            <input type="number" min={1} step={1} value={form.max_usuarios}
              onChange={(e) => set('max_usuarios', Math.max(1, parseInt(e.target.value, 10) || 1))}
              className={inputCls} />
          </Campo>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 mt-1">
          <Calculator size={18} className="text-violet-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-violet-900 space-y-0.5">
            <div>
              <span className="font-semibold">Coste mensual estimado: </span>
              <span className="font-bold text-violet-700 text-base">{costeEstimado.toFixed(2)} €</span>
            </div>
            <div className="text-xs text-violet-600">
              {esMatriz ? 'Empresa matriz — facturación interna: 0 €'
                : form.max_usuarios <= 3
                  ? `${form.saas_precio_pack_base} € pack base (3 licencias incluidas, ${form.max_usuarios} utilizadas)`
                  : <>{form.saas_precio_pack_base} € pack base{' + '}{usuariosExtra} usuario{usuariosExtra !== 1 ? 's' : ''} extra{' × '}{form.saas_precio_usuario_extra} € = {(usuariosExtra * form.saas_precio_usuario_extra).toFixed(2)} €</>
              }
            </div>
          </div>
        </div>
      </Seccion>

      {saveMsg.texto && (
        <div className={`rounded-lg px-3 py-2 text-sm border ${
          saveMsg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>{saveMsg.texto}</div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} disabled={saving}
          className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-50 text-sm">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 text-sm">
          <Save size={16} />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

// ─── Pestaña: Usuarios de la agencia ─────────────────────────────────────────

const UsuariosTab = ({ empresaId }) => {
  // ── Estado lista de usuarios ─────────────────────────────────────────────
  const [usuarios, setUsuarios]     = useState([])
  const [loadingU, setLoadingU]     = useState(true)
  const [errorU, setErrorU]         = useState('')
  const [editingId, setEditingId]   = useState(null)
  const [editNombre, setEditNombre] = useState('')
  const [editRol, setEditRol]       = useState('Staff')
  const [savingId, setSavingId]     = useState(null)
  const [userMsg, setUserMsg]       = useState({ id: null, tipo: '', texto: '' })

  // ── Estado formulario creación admin ────────────────────────────────────
  const [crearOpen, setCrearOpen]       = useState(false)
  const [crearEmail, setCrearEmail]     = useState('')
  const [crearPass, setCrearPass]       = useState('')
  const [creando, setCreando]           = useState(false)
  const [crearMsg, setCrearMsg]         = useState({ tipo: '', texto: '' })

  // ── Carga de usuarios ────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!empresaId) return
    setLoadingU(true)
    setErrorU('')
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, nombre, nivel_acceso, created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true })
    setLoadingU(false)
    if (err) {
      setErrorU(err.message || 'No se pudieron cargar los usuarios.')
      setUsuarios([])
    } else {
      setUsuarios(Array.isArray(data) ? data : [])
    }
  }, [empresaId])

  useEffect(() => { cargar() }, [cargar])

  // ── Edición de usuario existente ─────────────────────────────────────────
  const abrirEdicion = (u) => {
    setEditingId(u.id)
    setEditNombre(u.nombre || '')
    const rolUi = Object.entries(rolUiANivel).find(([, v]) => v === String(u.nivel_acceso || '').toUpperCase())?.[0] || 'Staff'
    setEditRol(rolUi)
    setUserMsg({ id: null, tipo: '', texto: '' })
  }

  const cancelarEdicion = () => {
    setEditingId(null)
    setUserMsg({ id: null, tipo: '', texto: '' })
  }

  const guardarUsuario = async (u) => {
    const nivel = normalizarNivelAccesoParaServidor(rolUiANivel[editRol] || editRol)
    if (!nivel) {
      setUserMsg({ id: u.id, tipo: 'err', texto: 'Rol no válido.' })
      return
    }
    setSavingId(u.id)
    setUserMsg({ id: null, tipo: '', texto: '' })
    const { error: err } = await supabase
      .from('profiles')
      .update({ nombre: editNombre.trim() || null, nivel_acceso: nivel })
      .eq('id', u.id)
      .eq('empresa_id', empresaId)
    setSavingId(null)
    if (err) {
      setUserMsg({ id: u.id, tipo: 'err', texto: err.message || 'No se pudo guardar.' })
      return
    }
    setUserMsg({ id: u.id, tipo: 'ok', texto: 'Guardado.' })
    setUsuarios((prev) => prev.map((x) => x.id === u.id ? { ...x, nombre: editNombre.trim() || null, nivel_acceso: nivel } : x))
    setTimeout(() => {
      setEditingId(null)
      setUserMsg({ id: null, tipo: '', texto: '' })
    }, 800)
  }

  // ── Creación de administrador inicial ────────────────────────────────────
  const crearAdmin = async (e) => {
    e.preventDefault()
    const emailNorm = crearEmail.trim().toLowerCase()
    if (!emailNorm) {
      setCrearMsg({ tipo: 'err', texto: 'El email es obligatorio.' })
      return
    }
    if (crearPass.length < 6) {
      setCrearMsg({ tipo: 'err', texto: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }

    setCreando(true)
    setCrearMsg({ tipo: '', texto: '' })

    const empresaIdNum = Number(empresaId) || 0
    if (!empresaIdNum) {
      setCrearMsg({ tipo: 'err', texto: 'No se pudo resolver empresa_id de la agencia.' })
      setCreando(false)
      return
    }
    const empresaConfirmada = await waitForEmpresaConfirmada(empresaIdNum)
    if (!empresaConfirmada) {
      setCrearMsg({
        tipo: 'err',
        texto: `La empresa (${empresaIdNum}) aún no está confirmada en BD. Reintenta en unos segundos.`,
      })
      setCreando(false)
      return
    }

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: emailNorm,
      password: crearPass,
      options: {
        data: { empresa_id: empresaIdNum, nivel_acceso: 'ADMIN' },
      },
    })

    if (authErr) {
      setCrearMsg({ tipo: 'err', texto: authErr.message || 'No se pudo crear el usuario en Auth.' })
      setCreando(false)
      return
    }

    const userId = authData?.user?.id
    if (!userId) {
      // signUp puede devolver user null si ya existe (Supabase lo silencia)
      setCrearMsg({ tipo: 'err', texto: 'El email ya tiene una cuenta registrada, o bien necesita confirmación de email. Comprueba en Supabase.' })
      setCreando(false)
      return
    }

    // 2. Asegurar/crear perfil en profiles con empresa_id y nivel ADMIN
    const { error: profErr } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, email: emailNorm, empresa_id: empresaIdNum, nivel_acceso: 'ADMIN' },
        { onConflict: 'id' },
      )

    setCreando(false)

    if (profErr) {
      setCrearMsg({
        tipo: 'err',
        texto: `Auth creado (${userId}) pero el perfil falló: ${profErr.message}. Actualiza el perfil manualmente.`,
      })
      return
    }

    setCrearMsg({ tipo: 'ok', texto: `Admin creado: ${emailNorm}. Entrega el email y contraseña al cliente.` })
    setCrearEmail('')
    setCrearPass('')
    await cargar()
    setTimeout(() => {
      setCrearOpen(false)
      setCrearMsg({ tipo: '', texto: '' })
    }, 2500)
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loadingU) return <div className="flex-1 p-8 text-center text-slate-500">Cargando usuarios…</div>

  return (
    <div className="overflow-y-auto flex-1 p-5 space-y-3">

      {/* ── Panel: Crear administrador inicial ── */}
      <div className="rounded-lg border border-emerald-200 overflow-hidden">
        <button
          type="button"
          onClick={() => { setCrearOpen((o) => !o); setCrearMsg({ tipo: '', texto: '' }) }}
          className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-sm font-semibold text-emerald-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            <UserPlus size={16} />
            Crear administrador inicial
          </span>
          <span className="text-emerald-500 text-xs">{crearOpen ? '▲ Ocultar' : '▼ Mostrar'}</span>
        </button>

        {crearOpen && (
          <form onSubmit={crearAdmin} className="px-4 pb-4 pt-3 space-y-3 bg-white border-t border-emerald-100">
            <p className="text-xs text-slate-500">
              Crea el primer acceso Admin para esta agencia. El cliente podrá iniciar sesión directamente
              en el ERP con estas credenciales.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  <span className="flex items-center gap-1"><Mail size={11} />Email</span>
                </label>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={crearEmail}
                  onChange={(e) => setCrearEmail(e.target.value)}
                  placeholder="admin@agencia.com"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  <span className="flex items-center gap-1"><KeyRound size={11} />Contraseña temporal</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={crearPass}
                  onChange={(e) => setCrearPass(e.target.value)}
                  placeholder="Mín. 6 caracteres"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                />
              </div>
            </div>

            {crearMsg.texto && (
              <div className={`rounded-lg px-3 py-2 text-xs flex items-start gap-1.5 ${
                crearMsg.tipo === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {crearMsg.tipo === 'ok' ? <Check size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
                {crearMsg.texto}
              </div>
            )}

            <button
              type="submit"
              disabled={creando}
              className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserPlus size={15} />
              {creando ? 'Creando cuenta…' : 'Crear Administrador'}
            </button>
          </form>
        )}
      </div>

      {/* ── Error carga lista ── */}
      {errorU && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle size={15} className="shrink-0" />{errorU}
        </div>
      )}

      {/* ── Lista vacía ── */}
      {usuarios.length === 0 && !errorU && (
        <div className="py-8 text-center text-slate-400 text-sm">
          Esta agencia aún no tiene usuarios. Usa el panel de arriba para crear el primer administrador.
        </div>
      )}

      {/* ── Tarjetas de usuarios ── */}
      {usuarios.map((u) => {
        const isEditing = editingId === u.id
        const isSaving  = savingId  === u.id
        const msg       = userMsg.id === u.id ? userMsg : null

        return (
          <div key={u.id} className={`rounded-lg border p-3 text-sm transition-colors ${
            isEditing ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'
          }`}>
            {isEditing ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-500 font-mono">{u.email}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                    <input type="text" value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 text-sm focus:ring-2 focus:ring-violet-400 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Rol</label>
                    <select value={editRol} onChange={(e) => setEditRol(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-900 bg-white text-sm focus:ring-2 focus:ring-violet-400 outline-none">
                      {ROLES_UI.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                {msg && (
                  <div className={`rounded px-2 py-1 text-xs flex items-center gap-1 ${
                    msg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                  }`}>
                    {msg.tipo === 'ok' ? <Check size={12} /> : <AlertCircle size={12} />}
                    {msg.texto}
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={cancelarEdicion} disabled={isSaving}
                    className="flex-1 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => guardarUsuario(u)} disabled={isSaving}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50">
                    <Save size={13} />
                    {isSaving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{u.nombre || <span className="text-slate-400 italic">Sin nombre</span>}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    u.nivel_acceso === 'ADMIN'    ? 'bg-violet-100 text-violet-700'
                    : u.nivel_acceso === 'STAFF'  ? 'bg-sky-100 text-sky-700'
                    : 'bg-slate-100 text-slate-600'
                  }`}>
                    {nivelAUi[u.nivel_acceso] || u.nivel_acceso || '—'}
                  </span>
                  <button type="button" onClick={() => abrirEdicion(u)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs">
                    <Pencil size={12} />Editar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Modal de edición (con pestañas) ─────────────────────────────────────────

const EditModal = ({ row, onClose, onSave }) => {
  // Se identifica la empresa raíz por su ID numérico (Integer), no por el CIF (String).
  const esMatriz    = Number(resolveId(row)) === MASTER_EMPRESA_ID
  const empresaId   = resolveId(row)
  const [activeTab, setActiveTab] = useState('empresa')

  const TAB_CLS_ACTIVE   = 'border-b-2 border-violet-600 text-violet-700 font-semibold'
  const TAB_CLS_INACTIVE = 'text-slate-500 hover:text-slate-800'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-slate-200 flex flex-col max-h-[90vh]">

        {/* Cabecera */}
        <div className="px-5 pt-4 pb-0 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Pencil size={18} className="text-violet-600" />
              <h2 className="text-lg font-bold text-slate-900">Editar empresa</h2>
              {esMatriz && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <ShieldAlert size={12} /> Matriz
                </span>
              )}
            </div>
            <button type="button" onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Cerrar">
              <X size={22} />
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-6 text-sm">
            <button type="button"
              onClick={() => setActiveTab('empresa')}
              className={`pb-2.5 ${activeTab === 'empresa' ? TAB_CLS_ACTIVE : TAB_CLS_INACTIVE}`}>
              <span className="flex items-center gap-1.5"><Building2 size={14} />Empresa</span>
            </button>
            <button type="button"
              onClick={() => setActiveTab('usuarios')}
              className={`pb-2.5 ${activeTab === 'usuarios' ? TAB_CLS_ACTIVE : TAB_CLS_INACTIVE}`}>
              <span className="flex items-center gap-1.5"><UserCog size={14} />Usuarios de la agencia</span>
            </button>
          </div>
        </div>

        {/* Aviso matriz — solo en pestaña empresa */}
        {esMatriz && activeTab === 'empresa' && (
          <div className="mx-5 mt-4 shrink-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <span>Empresa matriz (CIF <strong>{resolveCif(row)}</strong>).
              Los campos <strong>CIF</strong> y <strong>Plan</strong> están protegidos.</span>
          </div>
        )}

        {/* Contenido de pestaña */}
        {activeTab === 'empresa' ? (
          <EmpresaTab row={row} esMatriz={esMatriz} onSave={onSave} onClose={onClose} />
        ) : (
          <UsuariosTab empresaId={empresaId} />
        )}
      </div>
    </div>
  )
}

// ─── Panel de creación de nueva empresa (Ficha Completa) ─────────────────────
// `empresas` no está en ERP_TABLES → el proxy de tenant NO añade filtros aquí.
// Supabase auto-incrementa `id` → empresa_id exclusivo para el nuevo Tenant.
//
// Flujo creación tenant (orden estricto):
//  1. INSERT en empresas → .select() devuelve el id (empresa_id del tenant).
//  2. waitForEmpresaConfirmada(id) — la fila debe ser visible antes del signUp.
//  3. signUp del administrador con options.data: { empresa_id, nivel_acceso }.
//     El perfil en public.profiles lo inserta el trigger AFTER INSERT en auth.users
//     (handle_new_user_profile), leyendo raw_user_meta_data / raw_app_meta_data;
//     no se hace upsert desde el cliente (evita duplicar lógica y depender de RLS
//     del Master sobre filas de otros usuarios).
//  4. Guardar sesión Master antes del signUp y restaurarla después: signUp puede
//     cambiar la sesión activa si no hay confirmación por email.

const NUEVO_FORM_VACIO = () => ({
  // Datos operativos
  nombre_comercial:          '',
  plan_tipo:                 'basic',
  max_usuarios:              3,
  // Datos fiscales
  saas_razon_social:         '',
  saas_nif:                  '',
  saas_email_facturacion:    '',
  saas_telefono:             '',
  saas_direccion:            '',
  // Precios
  saas_precio_pack_base:     60,
  saas_precio_usuario_extra: 12,
  // Acceso inicial (opcional)
  admin_email:    '',
  admin_password: '',
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Para `.ilike('nombre_comercial', …)` como igualdad sin que `%` o `_` del nombre actúen como comodines. */
const escapeForIlikeExact = (s) =>
  String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')

/**
 * Auth: correo ya dado de alta (signUp rechazado) o respuesta típica de usuario duplicado.
 */
const isAuthUserAlreadyRegistered = (authError, authData) => {
  const msg = String(authError?.message || '').toLowerCase()
  const status = authError?.status
  if (status === 422) return true
  if (/already registered|already exists|already been registered|user already|duplicate/i.test(msg)) return true
  const user = authData?.user
  if (user && Array.isArray(user.identities) && user.identities.length === 0) return true
  return false
}

/**
 * Master: vincula un email existente en Auth a una empresa (profiles + app_metadata + roles).
 * Requiere la RPC `master_vincular_perfil_admin_empresa` en la base de datos.
 */
const masterVincularPerfilAdminEmpresa = async (emailNorm, empresaIdNum) => {
  const { data, error } = await supabase.rpc('master_vincular_perfil_admin_empresa', {
    p_email:      emailNorm,
    p_empresa_id: empresaIdNum,
  })
  if (error) {
    return { ok: false, error: error.message, code: error.code }
  }
  if (data && typeof data === 'object' && data.ok === false) {
    const code = data.code
    return {
      ok:    false,
      code,
      error: code === 'usuario_no_en_auth'
        ? 'No hay usuario en Auth con ese correo.'
        : 'La RPC devolvió error al vincular el perfil.',
    }
  }
  return { ok: true, userId: data?.user_id }
}

// Espera activa corta para asegurar que la empresa recién creada ya es consultable.
const waitForEmpresaConfirmada = async (empresaId, maxIntentos = 4, esperaMs = 250) => {
  for (let intento = 1; intento <= maxIntentos; intento += 1) {
    const { data, error } = await supabase
      .from('empresas')
      .select('id, nombre_comercial')
      .eq('id', empresaId)
      .maybeSingle()
    if (!error && data?.id === empresaId) return true
    if (intento < maxIntentos) await sleep(esperaMs)
  }
  return false
}

const NuevaEmpresaPanel = ({ onCreate }) => {
  const [open, setOpen]               = useState(false)
  const [form, setForm]               = useState(NUEVO_FORM_VACIO)
  const [saving, setSaving]           = useState(false)
  const [pasoActual, setPasoActual]   = useState('')
  const [msg, setMsg]                 = useState({ tipo: '', texto: '' })
  // null = verificando | true = Master confirmado | false = no autorizado o sin sesión
  const [masterVerificado, setMasterVerificado] = useState(null)
  /** Tras crear la empresa, si falla Auth/vinculación: reintento solo usuario (sin insert otra vez). */
  const [faseVinculacionPendiente, setFaseVinculacionPendiente] = useState(null)

  // Verificación de identidad Master en mount — no bloquea la UI, solo inhabilita el botón.
  // Forzamos refreshSession() para obtener claims frescos del servidor (evita JWT cacheado).
  // Solo confiamos en app_metadata (servidor). user_metadata es editable por el cliente.
  useEffect(() => {
    const verificarMasterEnMount = async () => {
      // Renovar JWT antes de leer claims para evitar app_metadata desactualizado
      await supabase.auth.refreshSession().catch(() => {})

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.error('[Panel Master] getUser() en mount falló:', authError?.message)
        setMasterVerificado(false)
        return
      }

      // Solo app_metadata (controlado por Postgres/trigger) — nunca user_metadata
      let eId = Number(user.app_metadata?.empresa_id ?? 0)

      // Si JWT no trae empresa_id en app_metadata, resolver desde profiles
      if (!(eId > 0)) {
        const { data: perfil } = await supabase
          .from('profiles')
          .select('empresa_id, nivel_acceso')
          .eq('id', user.id)
          .eq('empresa_id', MASTER_EMPRESA_ID)
          .maybeSingle()
        eId = Number(perfil?.empresa_id) || 0
      }

      const esMaster = eId === MASTER_EMPRESA_ID
      setMasterVerificado(esMaster)
      if (!esMaster) {
        console.error('[Panel Master] Usuario en mount NO es Master (empresa_id resuelto:', eId, ')')
      }
    }

    verificarMasterEnMount()
  }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const costeEstimado = useMemo(
    () => calcCoste(form.saas_precio_pack_base, form.saas_precio_usuario_extra, form.max_usuarios, false),
    [form.saas_precio_pack_base, form.saas_precio_usuario_extra, form.max_usuarios],
  )
  const usuariosExtra = Math.max(0, form.max_usuarios - 3)

  const resetPanel = () => {
    setOpen(false)
    setForm(NUEVO_FORM_VACIO)
    setMsg({ tipo: '', texto: '' })
    setPasoActual('')
    setFaseVinculacionPendiente(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const esSoloReintentoUsuario = Boolean(faseVinculacionPendiente)
    if (!form.nombre_comercial.trim() && !esSoloReintentoUsuario) {
      setMsg({ tipo: 'err', texto: 'El nombre comercial es obligatorio.' })
      return
    }
    const tieneEmail    = Boolean(form.admin_email.trim())
    const tienePassword = Boolean(form.admin_password.trim())
    if (tieneEmail !== tienePassword) {
      setMsg({ tipo: 'err', texto: 'Introduce email Y contraseña para el administrador inicial, o deja ambos en blanco.' })
      return
    }
    if (tienePassword && form.admin_password.length < 6) {
      setMsg({ tipo: 'err', texto: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }

    setSaving(true)
    setMsg({ tipo: '', texto: '' })

    const precheckEmailAdmin = async (emailNorm) => {
      const probe = await portalConsultarTieneAuth(supabase, emailNorm)
      if (!probe.ok) {
        return { adminYaEnAuth: null, probeError: probe.error }
      }
      return { adminYaEnAuth: probe.tieneAuth === true ? true : false, probeError: null }
    }

    const precheckAdministradorGlobal = async (emailNorm) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('empresa_id, nivel_acceso')
        .eq('email', emailNorm)
        .eq('empresa_id', MASTER_EMPRESA_ID)
        .eq('nivel_acceso', 'ADMIN')
        .limit(1)

      if (error) return { ok: false, isGlobalAdmin: false }
      return { ok: true, isGlobalAdmin: Array.isArray(data) && data.length > 0 }
    }

    /**
     * Admin del tenant: signUp con options.data.empresa_id si el correo no está en Auth;
     * si ya está (precheck o carrera), solo RPC Master (sesión actual = Master).
     */
    const faseUsuarioAdministrador = async ({
      newEmpresaId,
      nombreComercialDisplay,
      emailNorm,
      password,
      adminYaEnAuthPrecheck,
    }) => {
      setPasoActual('Guardando sesión Master…')
      const { data: { session: adminSession } } = await supabase.auth.getSession()

      let adminYaEnAuth = adminYaEnAuthPrecheck
      if (adminYaEnAuth == null && emailNorm) {
        const pre = await precheckEmailAdmin(emailNorm)
        adminYaEnAuth = pre.adminYaEnAuth === true ? true : pre.adminYaEnAuth === false ? false : null
      }

      if (adminYaEnAuth === true) {
        setPasoActual(`Vinculando cuenta existente ${emailNorm} (sin signUp)…`)
        if (adminSession?.access_token) {
          await supabase.auth.setSession({
            access_token:  adminSession.access_token,
            refresh_token: adminSession.refresh_token,
          })
        }
        const link = await masterVincularPerfilAdminEmpresa(emailNorm, newEmpresaId)
        if (link.ok) {
          setFaseVinculacionPendiente(null)
          setMsg({
            tipo:  'ok',
            texto:
              `✓ Empresa «${nombreComercialDisplay}» (empresa_id: ${newEmpresaId}). El correo "${emailNorm}" ya estaba en Auth; `
              + `vinculado como ADMIN. Usuario: ${link.userId || '—'}.`,
          })
          setForm(NUEVO_FORM_VACIO)
          setPasoActual('')
          setTimeout(resetPanel, 3000)
          return
        }
        setFaseVinculacionPendiente({ empresaId: newEmpresaId, nombreComercial: nombreComercialDisplay })
        setMsg({
          tipo:  'warn',
          texto:
            `Empresa «${nombreComercialDisplay}» (id ${newEmpresaId}) ya está creada. No se pudo vincular la cuenta existente: ${link.error || 'error desconocido'}. `
            + 'Pulsa de nuevo el botón principal para reintentar solo la vinculación (no se crea otra empresa).',
        })
        setPasoActual('')
        return
      }

      setPasoActual(`Registrando ${emailNorm} en Auth…`)
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email:    emailNorm,
        password,
        options: { data: { empresa_id: newEmpresaId, nivel_acceso: 'ADMIN' } },
      })

      if (adminSession?.access_token) {
        setPasoActual('Restaurando sesión Master…')
        await supabase.auth.setSession({
          access_token:  adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        })
      }

      const newUserId = authData?.user?.id
      const duplicadoAuth = isAuthUserAlreadyRegistered(authErr, authData)
      const intentarVincular = duplicadoAuth || (!newUserId && !authErr)

      if (!authErr && newUserId) {
        setFaseVinculacionPendiente(null)
        setMsg({
          tipo:  'ok',
          texto:
            `✓ Empresa «${nombreComercialDisplay}» (empresa_id: ${newEmpresaId}). Admin "${emailNorm}" dado de alta en Auth; `
            + `perfil vía trigger. Usuario: ${newUserId}.`,
        })
        setForm(NUEVO_FORM_VACIO)
        setPasoActual('')
        setTimeout(resetPanel, 3000)
        return
      }

      if (intentarVincular) {
        setPasoActual('Correo ya en Auth; vinculando con sesión Master…')
        const link = await masterVincularPerfilAdminEmpresa(emailNorm, newEmpresaId)
        if (link.ok) {
          setFaseVinculacionPendiente(null)
          setMsg({
            tipo:  'ok',
            texto:
              `✓ Empresa «${nombreComercialDisplay}» (empresa_id: ${newEmpresaId}). Correo ya en Auth; vinculado como ADMIN. Usuario: ${link.userId || '—'}.`,
          })
          setForm(NUEVO_FORM_VACIO)
          setPasoActual('')
          setTimeout(resetPanel, 3000)
          return
        }
        setFaseVinculacionPendiente({ empresaId: newEmpresaId, nombreComercial: nombreComercialDisplay })
        setMsg({
          tipo:  'warn',
          texto:
            `Empresa «${nombreComercialDisplay}» (id ${newEmpresaId}) creada. Vinculación fallida: ${link.error || 'error'}. `
            + 'Reintenta con el mismo botón (solo vinculación).',
        })
        setPasoActual('')
        return
      }

      setFaseVinculacionPendiente({ empresaId: newEmpresaId, nombreComercial: nombreComercialDisplay })
      setMsg({
        tipo:  'warn',
        texto:
          `Empresa «${nombreComercialDisplay}» (id ${newEmpresaId}) creada. Auth: ${authErr?.message || 'error desconocido'}. `
          + 'Reintenta la vinculación con el mismo botón o usa Usuarios de la agencia.',
      })
      setPasoActual('')
    }

    try {
      setPasoActual('Renovando sesión…')
      const { data: refreshData0, error: refreshErr0 } = await supabase.auth.refreshSession()
      let session = refreshData0?.session ?? null
      if (!session?.access_token && refreshErr0) {
        const { data: sessionData } = await supabase.auth.getSession()
        session = sessionData?.session ?? null
      }

      if (!session?.access_token) {
        window.location.href = '/login'
        return
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      let empresaIdAuth = Number(user?.app_metadata?.empresa_id ?? 0)
      if (user && !(empresaIdAuth > 0)) {
        const { data: perfil } = await supabase
          .from('profiles')
          .select('empresa_id, nivel_acceso')
          .eq('id', user.id)
          .eq('empresa_id', MASTER_EMPRESA_ID)
          .maybeSingle()
        empresaIdAuth = Number(perfil?.empresa_id) || 0
      }
      if (authError || !user || empresaIdAuth !== MASTER_EMPRESA_ID) {
        alert('Tu sesión ha expirado o no tienes permisos de Master. Por favor, cierra sesión y vuelve a entrar.')
        return
      }
      setMasterVerificado(true)

      if (esSoloReintentoUsuario) {
        const { empresaId, nombreComercial: nombreGuardado } = faseVinculacionPendiente
        if (!tieneEmail) {
          setMsg({ tipo: 'err', texto: 'Introduce email y contraseña del administrador para reintentar la vinculación.' })
          return
        }
        setPasoActual('Comprobando empresa (nombre_comercial)…')
        const { data: empRow, error: empErr } = await supabase
          .from('empresas')
          .select('id, nombre_comercial')
          .eq('id', empresaId)
          .maybeSingle()
        if (empErr || !empRow?.id) {
          setMsg({ tipo: 'err', texto: 'No se encontró la empresa pendiente. Descarta y crea de nuevo si hace falta.' })
          setFaseVinculacionPendiente(null)
          return
        }
        const emailNorm = form.admin_email.trim().toLowerCase()
        const probe = await precheckEmailAdmin(emailNorm)
        const yaAuth = probe.adminYaEnAuth === true ? true : probe.adminYaEnAuth === false ? false : null
        await faseUsuarioAdministrador({
          newEmpresaId:          empresaId,
          nombreComercialDisplay: empRow.nombre_comercial || nombreGuardado || String(empresaId),
          emailNorm,
          password:              form.admin_password,
          adminYaEnAuthPrecheck: yaAuth,
        })
        return
      }

      const nombreComercialTrim = form.nombre_comercial.trim()
      setPasoActual('Comprobando nombre comercial único (empresas.nombre_comercial)…')
      const { data: dupNombreRows, error: dupNombreErr } = await supabase
        .from('empresas')
        .select('id, nombre_comercial')
        .ilike('nombre_comercial', escapeForIlikeExact(nombreComercialTrim))
        .limit(5)

      if (dupNombreErr) {
        throw new Error(dupNombreErr.message || 'No se pudo validar el nombre comercial.')
      }
      if (dupNombreRows?.length) {
        const otro = dupNombreRows[0]
        setMsg({
          tipo:  'err',
          texto: `Ya existe una empresa con el nombre comercial «${otro.nombre_comercial || nombreComercialTrim}». Usa otro nombre.`,
        })
        setPasoActual('')
        return
      }

      const emailNormPrecheck = form.admin_email.trim().toLowerCase()
      let adminPrecheck = { adminYaEnAuth: null, probeError: null, globalAdmin: false }
      if (emailNormPrecheck && form.admin_password.trim()) {
        setPasoActual('Comprobando correo del administrador en Auth (antes de crear empresa)…')
        adminPrecheck = await precheckEmailAdmin(emailNormPrecheck)

        if (adminPrecheck.probeError) {
          setMsg({
            tipo:  'warn',
            texto: `No se pudo comprobar si el correo existe (${adminPrecheck.probeError}). Se continúa; si falla Auth podrás reintentar la vinculación.`,
          })
        }

        if (adminPrecheck.adminYaEnAuth === true) {
          const globalProbe = await precheckAdministradorGlobal(emailNormPrecheck)
          adminPrecheck.globalAdmin = globalProbe.isGlobalAdmin === true

          if (!adminPrecheck.globalAdmin) {
            setMsg({
              tipo:  'err',
              texto:
                `El correo "${emailNormPrecheck}" ya existe en Auth y no es un administrador global de Tabora. `
                + 'Usa otro email para crear el tenant o vincúlalo desde una empresa ya existente.',
            })
            setPasoActual('')
            return
          }
        }
      }

      const sesionEmail = session.user?.email ?? 'Superadmin'
      setPasoActual(`Creando empresa como ${sesionEmail}…`)
      const newRow       = await onCreate(form)
      const newEmpresaId = Number(newRow?.id) || 0
      if (!newEmpresaId) {
        throw new Error('No se pudo resolver empresa_id tras crear la empresa.')
      }

      setPasoActual('Confirmando empresa en base de datos…')
      if (!(await waitForEmpresaConfirmada(newEmpresaId))) {
        throw new Error(
          `La empresa (empresa_id: ${newEmpresaId}) aún no está confirmada en BD. Reintenta en unos segundos.`,
        )
      }

      const nombreDisplay = newRow?.nombre_comercial || nombreComercialTrim

      if (tieneEmail) {
        const yaAuthPrecheck =
          adminPrecheck.adminYaEnAuth === true ? true
            : adminPrecheck.adminYaEnAuth === false ? false
              : null
        await faseUsuarioAdministrador({
          newEmpresaId:          newEmpresaId,
          nombreComercialDisplay: nombreDisplay,
          emailNorm:             emailNormPrecheck,
          password:              form.admin_password,
          adminYaEnAuthPrecheck: yaAuthPrecheck,
        })
        return
      }

      setMsg({
        tipo:  'ok',
        texto: `✓ Empresa «${nombreDisplay}» creada (empresa_id: ${newEmpresaId}). Usa el modal de edición para crear el primer administrador.`,
      })
      setForm(NUEVO_FORM_VACIO)
      setPasoActual('')
      setTimeout(resetPanel, 3000)
    } catch (err) {
      console.error('[Panel Master] Error en creación de empresa:', err)
      setMsg({ tipo: 'err', texto: err?.message || 'Error desconocido.' })
      setPasoActual('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── Cabecera collapsible ── */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setMsg({ tipo: '', texto: '' }); setPasoActual('') }}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-800 border-b border-slate-200 transition-colors"
      >
        <span className="flex items-center gap-2">
          <PlusCircle size={16} className="text-violet-600" />
          Nueva empresa (Tenant)
        </span>
        <span className="text-slate-400 text-xs">{open ? 'Colapsar ▲' : 'Expandir ▼'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Aviso aislamiento */}
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-sky-500" />
            <span>
              Supabase asignará un <strong>empresa_id único auto-incremental</strong>.
              Los datos del nuevo Tenant quedan <strong>completamente aislados</strong>:
              nunca verá información de otras empresas.
            </span>
          </div>

          {/* ─ Datos operativos ─ */}
          <Seccion titulo="Datos operativos">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nombre comercial *">
                <input type="text" value={form.nombre_comercial}
                  onChange={(e) => set('nombre_comercial', e.target.value)}
                  className={inputCls} placeholder="Nombre de la agencia" required />
              </Campo>
              <Campo label="Plan">
                <select value={form.plan_tipo}
                  onChange={(e) => set('plan_tipo', e.target.value)}
                  className={`${inputCls} bg-white`}>
                  {PLANES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
            </div>
          </Seccion>

          {/* ─ Datos fiscales y de contacto ─ */}
          <Seccion titulo="Datos fiscales y de contacto">
            <div className="grid grid-cols-2 gap-3">
              <Campo label={<span className="flex items-center gap-1"><FileText size={12} />Razón social</span>}>
                <input type="text" value={form.saas_razon_social}
                  onChange={(e) => set('saas_razon_social', e.target.value)}
                  className={inputCls} placeholder="saas_razon_social" />
              </Campo>
              <Campo label={<span className="flex items-center gap-1"><FileText size={12} />NIF / CIF</span>}>
                <input type="text" value={form.saas_nif}
                  onChange={(e) => set('saas_nif', e.target.value)}
                  className={inputCls} placeholder="Ej. B12345678" />
              </Campo>
            </div>
            <Campo label={<span className="flex items-center gap-1"><Mail size={12} />Email de facturación</span>}>
              <input type="email" value={form.saas_email_facturacion}
                onChange={(e) => set('saas_email_facturacion', e.target.value)}
                className={inputCls} placeholder="facturacion@empresa.com" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label={<span className="flex items-center gap-1"><Phone size={12} />Teléfono</span>}>
                <input type="tel" value={form.saas_telefono}
                  onChange={(e) => set('saas_telefono', e.target.value)}
                  className={inputCls} placeholder="+34 600 000 000" />
              </Campo>
              <Campo label={<span className="flex items-center gap-1"><MapPin size={12} />Dirección</span>}>
                <input type="text" value={form.saas_direccion}
                  onChange={(e) => set('saas_direccion', e.target.value)}
                  className={inputCls} placeholder="Calle, número, ciudad" />
              </Campo>
            </div>
          </Seccion>

          {/* ─ Precios y licencias ─ */}
          <Seccion titulo="Precios y licencias">
            <div className="grid grid-cols-3 gap-3 items-end">
              <Campo label={<span className="flex items-center gap-1"><Euro size={12} />Precio pack base</span>} hint="saas_precio_pack_base">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                  <input type="number" min={0} step={0.01} value={form.saas_precio_pack_base}
                    onChange={(e) => set('saas_precio_pack_base', parseFloat(e.target.value) || 0)}
                    className={`${inputCls} pl-7`} />
                </div>
              </Campo>
              <Campo label={<span className="flex items-center gap-1"><Users size={12} />Precio usuario extra</span>} hint="saas_precio_usuario_extra">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                  <input type="number" min={0} step={0.01} value={form.saas_precio_usuario_extra}
                    onChange={(e) => set('saas_precio_usuario_extra', parseFloat(e.target.value) || 0)}
                    className={`${inputCls} pl-7`} />
                </div>
              </Campo>
              <Campo label={<span className="flex items-center gap-1"><Users size={12} />Máx. usuarios</span>}>
                <input type="number" min={1} step={1} value={form.max_usuarios}
                  onChange={(e) => set('max_usuarios', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={inputCls} />
              </Campo>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 mt-1">
              <Calculator size={18} className="text-violet-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-violet-900 space-y-0.5">
                <div>
                  <span className="font-semibold">Coste mensual estimado: </span>
                  <span className="font-bold text-violet-700 text-base">{costeEstimado.toFixed(2)} €</span>
                </div>
                <div className="text-xs text-violet-600">
                  {form.max_usuarios <= 3
                    ? `${form.saas_precio_pack_base} € pack base (3 licencias incluidas, ${form.max_usuarios} utilizadas)`
                    : <>{form.saas_precio_pack_base} € pack base{' + '}{usuariosExtra} usuario{usuariosExtra !== 1 ? 's' : ''} extra{' × '}{form.saas_precio_usuario_extra} € = {(usuariosExtra * form.saas_precio_usuario_extra).toFixed(2)} €</>
                  }
                </div>
              </div>
            </div>
          </Seccion>

          {/* ─ Acceso inicial: Administrador (opcional) ─ */}
          <Seccion titulo="Acceso inicial — Administrador (opcional)">
            <p className="text-xs text-slate-500">
              Crea el primer usuario administrador para esta agencia. Si lo dejas en blanco, podrás
              crearlo después desde el modal de edición → pestaña <strong>"Usuarios de la agencia"</strong>.
              Antes de crear la empresa se comprueba si el correo ya existe en Auth: si existe, no se hace{' '}
              <code className="text-[10px] bg-slate-100 px-0.5 rounded">signUp</code>
              ; se vincula como ADMIN con la sesión Master. Tras crear la empresa, si falla el paso de usuario,
              el botón principal pasa a <strong>reintentar solo la vinculación</strong> (no se inserta otra empresa).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label={<span className="flex items-center gap-1"><Mail size={12} />Email de acceso</span>}>
                <input type="email" value={form.admin_email}
                  onChange={(e) => set('admin_email', e.target.value)}
                  className={inputCls} placeholder="admin@agencia.com"
                  autoComplete="new-email" />
              </Campo>
              <Campo label={<span className="flex items-center gap-1"><KeyRound size={12} />Contraseña temporal</span>}>
                <input type="password" value={form.admin_password}
                  onChange={(e) => set('admin_password', e.target.value)}
                  className={inputCls} placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password" />
              </Campo>
            </div>
          </Seccion>

          {faseVinculacionPendiente && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>Vinculación pendiente:</strong> empresa id <code className="text-[10px] bg-amber-100 px-1 rounded">{faseVinculacionPendiente.empresaId}</code>
                {' '}({faseVinculacionPendiente.nombreComercial}). Corrige email/contraseña si hace falta y pulsa{' '}
                <strong>Reintentar vinculación</strong> (no se vuelve a ejecutar el alta de empresa).
              </span>
            </div>
          )}

          {/* Indicador de progreso por pasos */}
          {pasoActual && (
            <div className="flex items-center gap-2 text-sm text-violet-700 font-medium">
              <RefreshCw size={14} className="animate-spin shrink-0" />
              {pasoActual}
            </div>
          )}

          {/* Mensaje resultado — ok: verde | warn: ámbar | err: rojo */}
          {msg.texto && (
            <div className={`rounded-lg px-3 py-2.5 text-sm border flex items-start gap-2 ${
              msg.tipo === 'ok'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : msg.tipo === 'warn'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}>
              {msg.tipo === 'ok'
                ? <Check size={15} className="shrink-0 mt-0.5" />
                : <AlertCircle size={15} className={`shrink-0 mt-0.5 ${msg.tipo === 'warn' ? 'text-amber-500' : ''}`} />}
              <span>{msg.texto}</span>
            </div>
          )}

          {/* Aviso de sesión no verificada */}
          {masterVerificado === false && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-500" />
              <span>
                Sesión no verificada como Master (empresa_id=1). Cierra sesión y vuelve a entrar
                como administrador de Tabora para habilitar la creación de empresas.
              </span>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={resetPanel} disabled={saving}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-50 text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || masterVerificado === false}
              title={masterVerificado === false ? 'Sesión no verificada como Master — cierra sesión y vuelve a entrar' : undefined}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
              <PlusCircle size={15} />
              {saving
                ? 'Procesando…'
                : masterVerificado === null
                  ? 'Verificando sesión…'
                  : faseVinculacionPendiente
                    ? 'Reintentar vinculación'
                    : 'Crear empresa'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Modal de confirmación de borrado ────────────────────────────────────────

const ConfirmarEliminar = ({ row, onCancel, onConfirm, deleting }) => {
  const nombre = resolveNombre(row)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-rose-100">

        {/* Cabecera */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
            <Trash2 size={20} className="text-rose-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Eliminar empresa</h2>
            <p className="text-xs text-slate-500 mt-0.5">Esta acción no se puede deshacer</p>
          </div>
          <button type="button" onClick={onCancel} disabled={deleting}
            className="ml-auto p-1 rounded-lg hover:bg-slate-100 text-slate-400 disabled:opacity-40">
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-700 leading-relaxed">
            ¿Estás seguro de que quieres eliminar la empresa{' '}
            <span className="font-semibold text-slate-900">"{nombre}"</span>?
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-rose-500" />
            <span>
              Esta acción borrará <strong>todos los perfiles de usuario</strong> asociados y la empresa de la base de datos.{' '}
              <strong>No se puede deshacer.</strong>
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 px-6 pb-5">
          <button type="button" onClick={onCancel} disabled={deleting}
            className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-40 text-sm transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={deleting}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50 text-sm transition-colors">
            {deleting
              ? <><RefreshCw size={14} className="animate-spin" />Eliminando…</>
              : <><Trash2 size={14} />Sí, eliminar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

const AdminMaster = () => {
  const { rows, loading, error, reload, updateEmpresa, createEmpresa, deleteEmpresa } = useSaasManagement()
  const [editingRow, setEditingRow]   = useState(null)
  const [deletingRow, setDeletingRow] = useState(null)   // fila seleccionada para borrar
  const [deleting, setDeleting]       = useState(false)  // petición en curso
  const [deleteMsg, setDeleteMsg]     = useState('')     // mensaje de éxito tras borrar

  const handleDelete = async () => {
    if (!deletingRow) return
    setDeleting(true)
    try {
      await deleteEmpresa(resolveId(deletingRow))
      setDeleteMsg(`Empresa "${resolveNombre(deletingRow)}" eliminada correctamente.`)
      setDeletingRow(null)
      setTimeout(() => setDeleteMsg(''), 5000)
    } catch (err) {
      // El error se muestra dentro del modal — lo relanzamos para que el modal lo capture
      alert(`Error al eliminar: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="text-violet-600" size={28} />
            Panel Master
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            Gestión SaaS — fuente:{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">vista_gestion_saas</code>.
            Escritura directa sobre tabla{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">empresas</code>.
          </p>
        </div>
        <button type="button" onClick={reload} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">{error}</div>
      )}

      {deleteMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 px-4 py-3 text-sm">
          <Check size={16} className="shrink-0 text-emerald-600" />
          {deleteMsg}
        </div>
      )}

      {/* ── Formulario de creación de nuevo Tenant ── */}
      <NuevaEmpresaPanel onCreate={createEmpresa} />

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
                  <th className="px-4 py-3 font-medium">CIF / NIF</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium text-center">Usuarios</th>
                  <th className="px-4 py-3 font-medium">Suscripción</th>
                  <th className="px-4 py-3 font-medium">Expira</th>
                  <th className="px-4 py-3 font-medium text-right">Coste/mes</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  // Empresa raíz identificada por Integer empresa_id, no por CIF.
                  const esMatriz = Number(resolveId(row)) === MASTER_EMPRESA_ID
                  const costeRow = calcCoste(resolvePrecioBase(row), resolvePrecioExtra(row), resolveMaxU(row), esMatriz)
                  return (
                    <tr key={resolveId(row) ?? idx} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        <div className="flex items-center gap-1.5">
                          {esMatriz && <ShieldAlert size={14} className="text-amber-500 shrink-0" title="Empresa matriz" />}
                          {resolveNombre(row)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">{resolveCif(row)}</td>
                      <td className="px-4 py-3 text-slate-700">{resolvePlan(row)}</td>
                      <td className="px-4 py-3 text-slate-700 text-center">{resolveMaxU(row)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                          (row?.suscripcion_activa ?? row?.saas_suscripcion_activa)
                            ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {resolveSuscripcion(row)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">{resolveFecha(row)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-violet-700 text-xs">
                        {Number.isFinite(costeRow) ? `${costeRow.toFixed(2)} €` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setEditingRow(row)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium transition-colors">
                            <Pencil size={13} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDeleteMsg(''); setDeletingRow(row) }}
                            disabled={esMatriz}
                            title={esMatriz ? 'La empresa matriz no puede eliminarse' : `Eliminar ${resolveNombre(row)}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors">
                            <Trash2 size={13} />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingRow && (
        <EditModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSave={updateEmpresa}
        />
      )}

      {deletingRow && (
        <ConfirmarEliminar
          row={deletingRow}
          onCancel={() => { if (!deleting) setDeletingRow(null) }}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  )
}

export default AdminMaster
