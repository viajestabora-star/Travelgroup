import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabase'
import { X, Phone, Navigation, MoreVertical } from 'lucide-react'
import { asegurarVinculacionEmpleado, resolverActorCrm } from '../utils/empleadosVinculacion'
import { useEmpresa } from '../context/EmpresaContext'
import { isRlsError } from '../utils/supabaseWriteGuards'
import {
  assertFilaPersistida,
  empresaIdNumericoOThrow,
  getEmpresaIdNumerico,
  toIsoDateOnly,
} from '../utils/supabasePersistenciaCerteza'

/**
 * Función maestra de refresco: obtiene prospectos, visitas y clientes de Supabase
 * y actualiza el estado mediante los setters proporcionados.
 * @param {Function} setProspectos - Setter del estado de prospectos
 * @param {Function} setVisitas - Setter del estado de visitas
 * @param {Function} setClientes - Setter del estado de clientes
 */
const fetchCrmData = async (setProspectos, setVisitas, setClientes) => {
  try {
    const [prospectosRes, clientesRes, visitasRes] = await Promise.all([
      supabase.from('prospectos').select('*').order('grupo', { ascending: true }),
      supabase.from('clientes').select('*').order('nombre', { ascending: true }),
      supabase.from('visitas').select('*').order('fecha', { ascending: false })
    ])
    const prospectosData = prospectosRes.error ? [] : (prospectosRes.data || [])
    const clientesData = clientesRes.error ? [] : (clientesRes.data || [])
    const visitasData = visitasRes.error ? [] : (visitasRes.data || [])
    setProspectos(prospectosData)
    setClientes(clientesData)
    setVisitas(visitasData)
    return { prospectosData, clientesData, visitasData }
  } catch (err) {
    console.error('Error al cargar datos CRM:', err)
    return { prospectosData: [], clientesData: [], visitasData: [] }
  }
}

const CRM = ({ user = null }) => {
  const { empresaId } = useEmpresa()
  const getMensajeErrorBd = (error, accion) => {
    if (isRlsError(error)) {
      return `No ha sido posible ${accion}. Tu usuario no tiene permisos de escritura para este tenant (RLS).`
    }
    const detalle = error?.message || 'No se pudo completar la operación.'
    return `No ha sido posible ${accion}. Revisa los datos e inténtalo de nuevo. Detalle: ${detalle}`
  }
  // Estados principales
  const [activeTab, setActiveTab] = useState('prospectos') // prospectos | calendario | proximas | historial | estadisticas | embudo
  const [prospectos, setProspectos] = useState([])
  const [clientes, setClientes] = useState([])
  const [visitas, setVisitas] = useState([])
  const [loading, setLoading] = useState(true)
  const [actorCrm, setActorCrm] = useState({ actorId: null, fuente: null })

  // Estados del panel lateral
  const [prospectoSelected, setProspectoSelected] = useState(null)
  const [showPanel, setShowPanel] = useState(false)
  const [fichaTab, setFichaTab] = useState('datos') // datos | historial | programas
  
  // Estados del calendario
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showAgendaModal, setShowAgendaModal] = useState(false)
  const [fechaSeleccionada, setFechaSeleccionada] = useState('')
  
  // Estados del modal de agenda
  const [agendaProspectoId, setAgendaProspectoId] = useState('')
  const [agendaComentario, setAgendaComentario] = useState('')
  const [agendaNombreContacto, setAgendaNombreContacto] = useState('')
  const [isSubmittingAgendaVisita, setIsSubmittingAgendaVisita] = useState(false)
  
  // Estados para nueva visita en panel
  const [nuevaVisita, setNuevaVisita] = useState({
    fecha: new Date().toISOString().split('T')[0],
    comentario: '',
    nombre_contacto_externo: ''
  })
  const [isSubmittingVisitaPanel, setIsSubmittingVisitaPanel] = useState(false)
  
  // Visitas del prospecto seleccionado
  const [visitasProspecto, setVisitasProspecto] = useState([])

  // Modal Gestionar Visita (editar fecha / eliminar)
  const [showGestionVisitaModal, setShowGestionVisitaModal] = useState(false)
  const [visitaGestionSelected, setVisitaGestionSelected] = useState(null)
  const [showInputFechaVisita, setShowInputFechaVisita] = useState(false)
  const [nuevaFechaVisita, setNuevaFechaVisita] = useState('')

  // Filtro por disponibilidad (Dashboard Prospectos): L, M, X, J, V
  const [diasFiltroActivos, setDiasFiltroActivos] = useState([])

  // Modal Registrar Visita - Nuevo Prospecto (mapeo exacto CSV)
  const [showVisitaModal, setShowVisitaModal] = useState(false)
  const [guardandoProspectoModal, setGuardandoProspectoModal] = useState(false)
  const [guardandoFichaProspecto, setGuardandoFichaProspecto] = useState(false)

  const [formProspecto, setFormProspecto] = useState({
    grupo: '',
    cif: '',
    responsable: '',
    email: '',
    telefono: '',
    poblacion: '',
    provincia: '',
    direccion: '',
    interes: '',
    nivel_interes: '',
    proxima_visita: '',
    status: '',
    notas_comerciales: '',
    dias_visita: '',
    horario_visita_inicio: '',
    horario_visita_fin: ''
  })

  // Función local de refresco: invoca la función maestra y sincroniza el panel del prospecto seleccionado
  const refrescarDatos = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const { prospectosData, visitasData } = await fetchCrmData(setProspectos, setVisitas, setClientes)
      if (prospectoSelected?.id) {
        setVisitasProspecto(visitasData.filter(v => v.prospecto_id === prospectoSelected.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')))
        const prospectoActualizado = prospectosData.find(p => p.id === prospectoSelected.id)
        if (prospectoActualizado) {
          setProspectoSelected({ ...prospectoActualizado, programas_presentados: Array.isArray(prospectoActualizado.programas_presentados) ? prospectoActualizado.programas_presentados : [] })
        }
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [prospectoSelected?.id])

  const invalidarYRefrescarCRM = useCallback(async () => {
    await refrescarDatos({ silent: true })
  }, [refrescarDatos])

  // Carga inicial
  useEffect(() => {
    fetchCrmData(setProspectos, setVisitas, setClientes).finally(() => setLoading(false))
  }, [])

  // Validación de acceso CRM móvil basada en empleados/profiles (sin bloquear sesión autenticada).
  useEffect(() => {
    const sincronizarActorCrm = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const authUser = session?.user
      if (!authUser?.id) return
      await asegurarVinculacionEmpleado({ authUser, appUser: user }).catch(() => {})
      const actor = await resolverActorCrm({ authUser, appUser: user }).catch(() => ({ actorId: null, fuente: null }))
      setActorCrm(actor || { actorId: null, fuente: null })
    }
    sincronizarActorCrm()
  }, [user?.id, user?.email, user?.empresa_id])

  // Comprobar si un prospecto existe ya como cliente (por nombre/grupo)
  const esCliente = useMemo(() => {
    const nombresClientes = new Set(
      (clientes || []).map(c => String(c.nombre || '').trim().toLowerCase()).filter(Boolean)
    )
    return (prospecto) => {
      const grupo = String(prospecto?.grupo || '').trim().toLowerCase()
      return grupo && nombresClientes.has(grupo)
    }
  }, [clientes])

  // Lista unificada para el desplegable: clientes + prospectos
  const listadoUnificado = useMemo(() => {
    const items = []
    ;(clientes || []).forEach(c => {
      items.push({
        tipo: 'cliente',
        id: c.id,
        value: `cliente-${c.id}`,
        nombre: c.nombre || 'Sin nombre',
        poblacion: c.poblacion || c.provincia || ''
      })
    })
    ;(prospectos || []).forEach(p => {
      items.push({
        tipo: 'prospecto',
        id: p.id,
        value: `prospecto-${p.id}`,
        nombre: p.grupo || 'Sin nombre',
        poblacion: p.poblacion || p.provincia || ''
      })
    })
    return items.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [clientes, prospectos])

  // Filtrar prospectos según pestaña activa
  const hoyStr = new Date().toISOString().split('T')[0]
  
  const prospectosFiltrados = useMemo(() => {
    if (activeTab === 'proximas') {
      return prospectos.filter(p => {
        const fecha = p.proxima_visita || p.fecha
        return fecha && fecha >= hoyStr
      }).sort((a, b) => {
        const fechaA = a.proxima_visita || a.fecha || ''
        const fechaB = b.proxima_visita || b.fecha || ''
        return fechaA.localeCompare(fechaB)
      })
    } else if (activeTab === 'historial') {
      return prospectos.filter(p => {
        const fecha = p.ultima_visita_realizada || p.fecha
        return fecha && fecha < hoyStr
      }).sort((a, b) => {
        const fechaA = a.ultima_visita_realizada || a.fecha || ''
        const fechaB = b.ultima_visita_realizada || b.fecha || ''
        return fechaB.localeCompare(fechaA)
      })
    }
    return []
  }, [prospectos, activeTab, hoyStr])

  // Prospectos para el embudo: excluir Ganado y Perdido
  const EMBUDO_COLUMNAS = ['Lead', 'Contactado', 'Propuesta', 'Negociación']
  const prospectosEnEmbudo = useMemo(() => {
    return prospectos.filter(p => {
      const estado = (p.estado_comercial || 'Lead').trim()
      return estado !== 'Ganado' && estado !== 'Perdido'
    })
  }, [prospectos])

  // Dashboard Prospectos: filtrar por días de disponibilidad (ilike equivalente client-side)
  const prospectosParaListado = useMemo(() => {
    let lista = [...(prospectos || [])].sort((a, b) => (a.grupo || '').localeCompare(b.grupo || ''))
    if (diasFiltroActivos.length > 0) {
      lista = lista.filter(p => {
        const dias = (p.dias_visita || '').trim()
        if (!dias) return false
        return diasFiltroActivos.some(dia => dias.toLowerCase().includes(dia.toLowerCase()))
      })
    }
    return lista
  }, [prospectos, diasFiltroActivos])

  // Lógica "Disponible ahora": día actual coincide con dias_visita Y hora dentro de horario
  const esDisponibleAhora = (p) => {
    const now = new Date()
    const diaActual = now.getDay() // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sab
    const DIAS_A_LETRA = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' }
    const letraHoy = DIAS_A_LETRA[diaActual]
    const dias = (p?.dias_visita || '').split(',').map(d => d.trim()).filter(Boolean)
    if (!dias.includes(letraHoy)) return false
    const inicio = (p?.horario_visita_inicio || '').trim()
    const fin = (p?.horario_visita_fin || '').trim()
    if (!inicio && !fin) return true // Sin horario = disponible todo el día
    const [hNow, mNow] = [now.getHours(), now.getMinutes()]
    const minNow = hNow * 60 + mNow
    if (inicio) {
      const [hi, mi] = inicio.split(':').map(Number)
      const minInicio = (hi || 0) * 60 + (mi || 0)
      if (minNow < minInicio) return false
    }
    if (fin) {
      const [hf, mf] = fin.split(':').map(Number)
      const minFin = (hf || 0) * 60 + (mf || 0)
      if (minNow > minFin) return false
    }
    return true
  }

  const toggleDiaFiltro = (dia) => {
    setDiasFiltroActivos(prev => {
      const idx = prev.indexOf(dia)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [...prev, dia].sort((a, b) => ['L', 'M', 'X', 'J', 'V'].indexOf(a) - ['L', 'M', 'X', 'J', 'V'].indexOf(b))
    })
  }

  const guardarProspectoDesdeModal = async () => {
    if (guardandoProspectoModal) return
    setGuardandoProspectoModal(true)
    try {
      let empresaIdNum
      try {
        empresaIdNum = empresaIdNumericoOThrow(empresaId)
      } catch (e) {
        alert(e?.message || 'No hay empresa en sesión.')
        return
      }
      const proxima = formProspecto.proxima_visita ? toIsoDateOnly(formProspecto.proxima_visita) : null
      const result = await supabase
        .from('prospectos')
        .insert({
          grupo: formProspecto.grupo || null,
          cif: formProspecto.cif || null,
          responsable: formProspecto.responsable || null,
          email: formProspecto.email || null,
          telefono: formProspecto.telefono || null,
          poblacion: formProspecto.poblacion || null,
          provincia: formProspecto.provincia || null,
          direccion: formProspecto.direccion || null,
          interes: formProspecto.interes || null,
          nivel_interes: formProspecto.nivel_interes || null,
          proxima_visita: proxima,
          status: formProspecto.status || null,
          notas_comerciales: formProspecto.notas_comerciales || null,
          dias_visita: formProspecto.dias_visita || null,
          horario_visita_inicio: formProspecto.horario_visita_inicio || null,
          horario_visita_fin: formProspecto.horario_visita_fin || null,
          es_cliente: false,
          estado_comercial: 'POTENCIAL',
          empresa_id: empresaIdNum,
        })
        .select()
        .single()
      try {
        assertFilaPersistida(result)
      } catch (err) {
        alert(getMensajeErrorBd(err, 'registrar el prospecto'))
        return
      }
      setShowVisitaModal(false)
      setFormProspecto(resetFormProspecto())
      await refrescarDatos()
      alert('Prospecto registrado con éxito')
    } finally {
      setGuardandoProspectoModal(false)
    }
  }

  const resetFormProspecto = () => ({
    grupo: '', cif: '', responsable: '', email: '', telefono: '', poblacion: '', provincia: '', direccion: '',
    interes: '', nivel_interes: '', proxima_visita: '', status: '', notas_comerciales: '',
    dias_visita: '', horario_visita_inicio: '', horario_visita_fin: ''
  })

  const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const getDisponibilidadTexto = (p) => {
    const dias = (p?.dias_visita || '').trim()
    const inicio = (p?.horario_visita_inicio || '').trim()
    const fin = (p?.horario_visita_fin || '').trim()
    if (!dias && !inicio && !fin) return null
    const parts = []
    if (dias) parts.push(dias.replace(/,/g, ' '))
    if (inicio && fin) parts.push(`${inicio}-${fin}`)
    else if (inicio) parts.push(`desde ${inicio}`)
    else if (fin) parts.push(`hasta ${fin}`)
    return parts.join(' • ')
  }
  const toggleDiaVisita = (diasStr, dia) => {
    const arr = (diasStr || '').split(',').map(d => d.trim()).filter(Boolean)
    const idx = arr.indexOf(dia)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(dia)
    return arr.sort((a, b) => DIAS_SEMANA.indexOf(a) - DIAS_SEMANA.indexOf(b)).join(',')
  }

  // Abrir ficha del prospecto
  const abrirFicha = async (prospecto) => {
    if (!prospecto?.id) {
      alert('Error: Prospecto sin ID')
        return
      }

    const normalizado = {
      ...prospecto,
      programas_presentados: Array.isArray(prospecto.programas_presentados)
        ? prospecto.programas_presentados
        : []
    }

    setProspectoSelected(normalizado)
    setFichaTab('datos')
    setShowPanel(true)
    setVisitasProspecto(visitas.filter(v => v.prospecto_id === prospecto.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')))
  }

  const cerrarFicha = () => {
    setShowPanel(false)
    setProspectoSelected(null)
    setVisitasProspecto([])
  }

  // Guardar cambios del prospecto
  const handleSave = async () => {
    if (!prospectoSelected) {
      alert('Error: No hay prospecto seleccionado')
      return
    }
    if (guardandoFichaProspecto) return
    setGuardandoFichaProspecto(true)
    try {
      let empresaIdNum
      try {
        empresaIdNum = empresaIdNumericoOThrow(empresaId)
      } catch (e) {
        alert(e?.message || 'No hay empresa en sesión.')
        return
      }

      // Si es un prospecto nuevo (sin ID), hacer INSERT
      if (!prospectoSelected.id) {
        const resto = { ...prospectoSelected }
        delete resto.id
        const result = await supabase
          .from('prospectos')
          .insert({ ...resto, empresa_id: empresaIdNum })
          .select()
          .single()
        try {
          assertFilaPersistida(result)
        } catch (err) {
          alert(getMensajeErrorBd(err, 'crear el prospecto'))
          return
        }
        const data = result.data
        alert('¡Prospecto creado con éxito!')
        await refrescarDatos()
        setProspectoSelected({
          ...data,
          programas_presentados: Array.isArray(data.programas_presentados) ? data.programas_presentados : []
        })
      } else {
        const result = await supabase
          .from('prospectos')
          .update(prospectoSelected)
          .eq('id', prospectoSelected.id)
          .select()
          .single()
        try {
          assertFilaPersistida(result)
        } catch (err) {
          alert(getMensajeErrorBd(err, 'guardar el prospecto'))
          return
        }
        const data = result.data
        alert('¡Guardado con éxito!')
        await refrescarDatos()
        setProspectoSelected({
          ...data,
          programas_presentados: Array.isArray(data.programas_presentados) ? data.programas_presentados : []
        })
      }
    } finally {
      setGuardandoFichaProspecto(false)
    }
  }

  // Actualizar campo del prospecto
  const updateField = (field, value) => {
    setProspectoSelected(prev => prev ? { ...prev, [field]: value } : prev)
  }

  // Recalcular puntuación lead (cálculo en frontend)
  const recalcularPuntuacionLead = async (prospectoId) => {
    if (!prospectoId) return

    const { data: visitasData } = await supabase.from('visitas').select('*').eq('prospecto_id', prospectoId)
    const visitas = visitasData || []

    const { data: prospectoData } = await supabase.from('prospectos').select('estado_comercial').eq('id', prospectoId).single()
    const estado = (prospectoData?.estado_comercial || '').trim()

    let puntuacion = visitas.length * 10
    if (estado === 'Propuesta') puntuacion += 20
    if (estado === 'Negociación') puntuacion += 30
    if (visitas.length > 1) {
      const visitasOrdenadas = [...visitas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
      const ultimaFecha = visitasOrdenadas[0]?.fecha
      if (ultimaFecha) {
        const fechaUltima = new Date(ultimaFecha)
        const hace30Dias = new Date()
        hace30Dias.setDate(hace30Dias.getDate() - 30)
        if (fechaUltima < hace30Dias) puntuacion -= 15
      }
    }
    puntuacion = Math.max(0, puntuacion)

    await supabase.from('prospectos').update({ puntuacion_lead: puntuacion }).eq('id', prospectoId)

    await refrescarDatos({ silent: true })
    if (prospectoSelected?.id === prospectoId) {
      const { data } = await supabase.from('prospectos').select('*').eq('id', prospectoId).single()
      if (data) setProspectoSelected({ ...data, programas_presentados: Array.isArray(data.programas_presentados) ? data.programas_presentados : [] })
    }
  }

  // Actualizar estado_comercial en Supabase inmediatamente (para el selector del panel)
  const actualizarEstadoComercial = async (nuevoEstado) => {
    if (!prospectoSelected?.id) return
    const result = await supabase
      .from('prospectos')
      .update({ estado_comercial: nuevoEstado })
      .eq('id', prospectoSelected.id)
      .select()
      .single()
    try {
      assertFilaPersistida(result)
    } catch (err) {
      alert(getMensajeErrorBd(err, 'actualizar el estado comercial'))
      return
    }
    setProspectoSelected(prev => prev ? { ...prev, estado_comercial: nuevoEstado } : prev)
    setProspectos(prev => prev.map(p => p.id === prospectoSelected.id ? { ...p, estado_comercial: nuevoEstado } : p))
    await recalcularPuntuacionLead(prospectoSelected.id)
  }

  // Registrar nueva visita desde panel
  const registrarVisita = async () => {
    if (isSubmittingVisitaPanel) return
    const prospectoId = prospectoSelected?.id || null
    const nombreContacto = String(nuevaVisita.nombre_contacto_externo || '').trim()
    if (!prospectoId && !nombreContacto) {
      alert('Debes indicar un prospecto o escribir el nombre del contacto.')
      return
    }

    setIsSubmittingVisitaPanel(true)
    try {
      const empresaIdNum = getEmpresaIdNumerico(empresaId)
      if (!empresaIdNum) {
        alert('No se pudo resolver el empresa_id del tenant actual. Vuelve a iniciar sesión.')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const actor = await resolverActorCrm({ authUser: session.user, appUser: user }).catch(() => actorCrm)
        if (actor?.actorId) setActorCrm(actor)
      }

      const fechaIso = toIsoDateOnly(nuevaVisita.fecha)
      if (!fechaIso) {
        alert('La fecha de la visita no es válida.')
        return
      }

      const payloadVisita = {
        fecha: fechaIso,
        prospecto_id: prospectoId,
        comentario: nuevaVisita.comentario,
        nombre_contacto_externo: nombreContacto || null,
        empresa_id: empresaIdNum,
      }
      const resultVisita = await supabase
        .from('visitas')
        .insert(payloadVisita)
        .select('*')
        .single()
      let visitaNueva
      try {
        visitaNueva = assertFilaPersistida(resultVisita)
      } catch (err) {
        alert(getMensajeErrorBd(err, 'registrar la visita'))
        return
      }

      setVisitas(prev => [visitaNueva, ...prev])
      setNuevaVisita({ fecha: new Date().toISOString().split('T')[0], comentario: '', nombre_contacto_externo: '' })
      if (prospectoId) await recalcularPuntuacionLead(prospectoId)
      await invalidarYRefrescarCRM()
      alert('Visita registrada con éxito')
    } finally {
      setIsSubmittingVisitaPanel(false)
    }
  }

  // Abrir modal de gestión de visita
  const abrirModalGestionVisita = (visita) => {
    setVisitaGestionSelected(visita)
    setShowInputFechaVisita(false)
    setNuevaFechaVisita(visita?.fecha || '')
    setShowGestionVisitaModal(true)
  }

  // Recalcular y actualizar proxima_visita en prospectos: la visita futura con fecha más cercana
  const actualizarProximaVisitaProspecto = async (prospectoId) => {
    if (!prospectoId) return
    const hoyStr = new Date().toISOString().split('T')[0]
    const { data: visitasRestantes } = await supabase
      .from('visitas')
      .select('fecha')
      .eq('prospecto_id', prospectoId)
      .gte('fecha', hoyStr)
      .order('fecha', { ascending: true })
    const nuevaProximaVisita = visitasRestantes?.length ? visitasRestantes[0].fecha : null
    await supabase.from('prospectos').update({ proxima_visita: nuevaProximaVisita }).eq('id', prospectoId)
  }

  // Eliminar visita desde modal
  const eliminarVisitaDesdeModal = async () => {
    if (!visitaGestionSelected?.id) return
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta visita?')) return

    const prospectoId = visitaGestionSelected.prospecto_id
    const { error } = await supabase.from('visitas').delete().eq('id', visitaGestionSelected.id)
    if (error) {
      alert('Error al eliminar visita: ' + error.message)
    } else {
      await actualizarProximaVisitaProspecto(prospectoId)
      alert('Visita eliminada con éxito')
      setShowGestionVisitaModal(false)
      setVisitaGestionSelected(null)
      await recalcularPuntuacionLead(prospectoId)
      await refrescarDatos()
    }
  }

  // Guardar nueva fecha de visita desde modal
  const guardarFechaVisitaDesdeModal = async () => {
    if (!visitaGestionSelected?.id || !nuevaFechaVisita) return

    const prospectoId = visitaGestionSelected.prospecto_id
    const rawFecha = String(nuevaFechaVisita || '').trim()
    const fechaNorm = /^\d{4}-\d{2}-\d{2}$/.test(rawFecha) ? rawFecha : (toIsoDateOnly(nuevaFechaVisita) || rawFecha)
    const result = await supabase
      .from('visitas')
      .update({ fecha: fechaNorm })
      .eq('id', visitaGestionSelected.id)
      .select()
      .single()
    try {
      assertFilaPersistida(result)
    } catch (err) {
      alert(getMensajeErrorBd(err, 'actualizar la fecha de la visita'))
      return
    }
    await actualizarProximaVisitaProspecto(prospectoId)
    alert('Fecha actualizada con éxito')
    setShowInputFechaVisita(false)
    setShowGestionVisitaModal(false)
    setVisitaGestionSelected(null)
    await recalcularPuntuacionLead(prospectoId)
    await refrescarDatos()
  }

  // Agendar visita desde calendario
  const abrirAgendaModal = (fecha) => {
    setFechaSeleccionada(fecha)
    setAgendaProspectoId('')
    setAgendaComentario('')
    setAgendaNombreContacto('')
    setShowAgendaModal(true)
  }

  const handleProspectoChange = (value) => {
    if (value === 'nuevo') {
      setShowAgendaModal(false)
      setProspectoSelected({
        grupo: '',
        cif: '',
        telefono: '',
        responsable: '',
        direccion: '',
        poblacion: '',
        provincia: '',
        ubicacion: '',
        notas: '',
        notas_comerciales: '',
        estado_comercial: 'POTENCIAL',
        es_cliente: false,
        proxima_visita: fechaSeleccionada,
        fecha: fechaSeleccionada,
        programas_presentados: [],
        dias_visita: '',
        horario_visita_inicio: '',
        horario_visita_fin: ''
      })
      setFichaTab('datos')
      setShowPanel(true)
      setVisitasProspecto([])
    } else {
      setAgendaProspectoId(value)
    }
  }

  const guardarVisitaDesdeCalendario = async () => {
    if (isSubmittingAgendaVisita) return
    const nombreContacto = String(agendaNombreContacto || '').trim()
    if (!agendaProspectoId && !nombreContacto) {
      alert('Selecciona un prospecto/cliente o escribe el nombre del contacto.')
      return
    }

    setIsSubmittingAgendaVisita(true)
    try {
      const empresaIdNum = getEmpresaIdNumerico(empresaId)
      if (!empresaIdNum) {
        alert('No se pudo resolver el empresa_id del tenant actual. Vuelve a iniciar sesión.')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const actor = await resolverActorCrm({ authUser: session.user, appUser: user }).catch(() => actorCrm)
        if (actor?.actorId) setActorCrm(actor)
      }

      let prospectoIdFinal = null

      if (agendaProspectoId.startsWith('cliente-')) {
        // IDs son UUID — usar string comparison, nunca Number()
        const clienteId = agendaProspectoId.replace('cliente-', '')
        const cliente = clientes.find(c => String(c.id) === clienteId)
        if (!cliente) {
          alert('Cliente no encontrado')
          return
        }
        const nombreNorm = String(cliente.nombre || '').trim()
        const existente = prospectos.find(
          p => String(p.grupo || '').trim().toLowerCase() === nombreNorm.toLowerCase()
        )
        if (existente) {
          prospectoIdFinal = existente.id
        } else {
          const resPros = await supabase
            .from('prospectos')
            .insert({
              grupo: nombreNorm,
              telefono: cliente.movil || cliente.telefono || '',
              poblacion: cliente.poblacion || '',
              provincia: cliente.provincia || '',
              estado_comercial: 'CLIENTE',
              empresa_id: empresaIdNum,
            })
            .select()
            .single()
          let nuevoPros
          try {
            nuevoPros = assertFilaPersistida(resPros)
          } catch (err) {
            alert(getMensajeErrorBd(err, 'crear el prospecto desde cliente'))
            return
          }
          prospectoIdFinal = nuevoPros.id
          refrescarDatos({ silent: true })
        }
      } else if (agendaProspectoId.startsWith('prospecto-')) {
        // UUID — no convertir a Number
        prospectoIdFinal = agendaProspectoId.replace('prospecto-', '')
      } else {
        prospectoIdFinal = agendaProspectoId
      }

      const payloadVisita = {
        fecha: toIsoDateOnly(fechaSeleccionada),
        // Regla explícita: visitas se relaciona por prospecto_id (nunca cliente_id).
        prospecto_id: prospectoIdFinal || null,
        comentario: agendaComentario,
        nombre_contacto_externo: nombreContacto || null,
        empresa_id: empresaIdNum,
      }
      if (!payloadVisita.fecha) {
        alert('La fecha seleccionada no es válida.')
        return
      }
      const insertVisitaPromise = supabase
        .from('visitas')
        .insert(payloadVisita)
        .select('*')
        .single()

      // Cierre optimista: cerrar modal inmediatamente después de disparar el insert.
      setShowAgendaModal(false)
      setAgendaProspectoId('')
      setAgendaComentario('')
      setAgendaNombreContacto('')

      const resultVisita = await insertVisitaPromise
      let visitaNueva
      try {
        visitaNueva = assertFilaPersistida(resultVisita)
      } catch (err) {
        alert(getMensajeErrorBd(err, 'agendar la visita'))
        return
      }

      setVisitas(prev => [visitaNueva, ...prev])
      if (prospectoIdFinal) {
        await supabase
          .from('prospectos')
          .update({ proxima_visita: payloadVisita.fecha })
          .eq('id', prospectoIdFinal)
        await recalcularPuntuacionLead(prospectoIdFinal)
      }
      await invalidarYRefrescarCRM()
      alert('Visita agendada con éxito')
    } finally {
      setIsSubmittingAgendaVisita(false)
    }
  }

  // CRUD de programas
  const addPrograma = () => {
    setProspectoSelected(prev => {
      if (!prev) return prev
      const programas = Array.isArray(prev.programas_presentados) ? [...prev.programas_presentados] : []
      programas.push({ destino: '', fechas: '', estado: 'Pendiente', imagen: '', explicacion: '' })
      return { ...prev, programas_presentados: programas }
    })
  }

  const updatePrograma = (index, field, value) => {
    setProspectoSelected(prev => {
      if (!prev) return prev
      const programas = [...(prev.programas_presentados || [])]
      programas[index] = { ...programas[index], [field]: value }
      return { ...prev, programas_presentados: programas }
    })
  }

  const removePrograma = (index) => {
    setProspectoSelected(prev => {
      if (!prev) return prev
      const programas = [...(prev.programas_presentados || [])]
      programas.splice(index, 1)
      return { ...prev, programas_presentados: programas }
    })
  }

  // Renderizar calendario
  const renderCalendar = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells = []
    
    // Días vacíos al inicio
    for (let i = 0; i < offset; i++) {
      cells.push(<div key={`empty-${i}`} className="h-20" />)
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const visitasDia = visitas.filter(v => v.fecha === dateStr)
      const prospectosDia = prospectos.filter(p => p.proxima_visita === dateStr || p.fecha === dateStr)

      cells.push(
        <div
          key={day}
          className="min-h-[80px] p-2 rounded-xl border border-slate-200 bg-white hover:border-slate-400 cursor-pointer transition"
          onClick={() => abrirAgendaModal(dateStr)}
        >
          <div className="text-xs font-bold text-slate-700 mb-1">{day}</div>
          <div className="space-y-1">
            {prospectosDia.slice(0, 2).map(p => {
              const esClie = esCliente(p)
              const disp = getDisponibilidadTexto(p)
              return (
                <div
                  key={p.id}
                  className={`text-[9px] px-1.5 py-0.5 rounded truncate ${
                    esClie ? 'bg-blue-50 border border-blue-200' : 'bg-[#fffbeb] border border-[#fef3c7]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    abrirFicha(p)
                  }}
                  title={disp ? `Disponible: ${disp}` : undefined}
                >
                  {esClie ? '⭐ ' : '💼 '}{p.grupo || 'Sin nombre'}
                  {disp && <span className="text-emerald-600" title={disp}> 🕐</span>}
                </div>
              )
            })}
            {prospectosDia.length > 2 && (
              <div className="text-[9px] text-slate-400">+{prospectosDia.length - 2}</div>
            )}
          </div>
        </div>
      )
    }

    return cells
  }

  // Estadísticas
  const estadisticas = useMemo(() => {
    const totalProspectos = prospectos.length
    const visitasRealizadas = visitas.filter(v => v.fecha < hoyStr).length
    const visitasPendientes = visitas.filter(v => v.fecha >= hoyStr).length
    
    return { totalProspectos, visitasRealizadas, visitasPendientes }
  }, [prospectos, visitas, hoyStr])

  // Borrar prospecto
  const borrarProspecto = async () => {
    if (!prospectoSelected?.id) return
    if (!window.confirm('¿Estás seguro de que quieres borrar este prospecto? Esta acción no se puede deshacer.')) return

    const { error } = await supabase
      .from('prospectos')
      .delete()
      .eq('id', prospectoSelected.id)

    if (error) {
      alert('Error al borrar: ' + error.message)
    } else {
      cerrarFicha()
      await refrescarDatos()
      alert('Prospecto borrado con éxito')
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* PESTAÑAS PRINCIPALES */}
        <div className="flex gap-2 mb-6 items-center">
          <div className="flex gap-2 flex-1 bg-white p-2 rounded-2xl shadow-sm border">
            {[
              { key: 'prospectos', label: 'Prospectos' },
              { key: 'calendario', label: 'Calendario' },
              { key: 'proximas', label: 'Próximas' },
              { key: 'historial', label: 'Historial' },
              { key: 'embudo', label: 'Embudo' },
              { key: 'estadisticas', label: 'Estadísticas' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  activeTab === tab.key
                    ? 'bg-[#0f172a] text-white shadow-lg'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setFormProspecto(resetFormProspecto())
              setShowVisitaModal(true)
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-md flex items-center gap-2 transition-all"
            style={{ fontSize: '16px' }}
          >
            <span>➕</span> Registrar Visita
          </button>
        </div>

        {loading && (
          <div className="text-center py-12 text-slate-400">Cargando...</div>
        )}

        {/* VISTA: DASHBOARD PROSPECTOS */}
        {activeTab === 'prospectos' && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <div className="text-xs font-bold uppercase text-slate-400 mb-3">Filtrar por disponibilidad</div>
              <div className="flex flex-wrap gap-2">
                {['L', 'M', 'X', 'J', 'V'].map(dia => {
                  const activo = diasFiltroActivos.includes(dia)
                  return (
                    <button
                      key={dia}
                      type="button"
                      onClick={() => toggleDiaFiltro(dia)}
                      className={`min-w-[44px] h-11 px-3 rounded-xl text-sm font-bold border-2 transition-all ${
                        activo
                          ? 'bg-emerald-500 text-white border-emerald-600 shadow-md'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {dia}
                    </button>
                  )
                })}
                {diasFiltroActivos.length > 0 && (
                  <button
                    onClick={() => setDiasFiltroActivos([])}
                    className="h-11 px-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-4 px-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Nombre / Contacto</th>
                    <th className="text-left py-4 px-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Empresa</th>
                    <th className="text-left py-4 px-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Días visita</th>
                    <th className="text-left py-4 px-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Estado</th>
                    <th className="text-left py-4 px-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Disponibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {prospectosParaListado.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        {diasFiltroActivos.length > 0
                          ? 'No hay prospectos con disponibilidad en los días seleccionados'
                          : 'No hay prospectos registrados'}
                      </td>
                    </tr>
                  ) : (
                    prospectosParaListado.map(p => {
                      const esClie = esCliente(p)
                      const disp = getDisponibilidadTexto(p)
                      const disponibleAhora = esDisponibleAhora(p)
                      const diasArr = (p.dias_visita || '').split(',').map(d => d.trim()).filter(Boolean)
                      return (
                        <tr
                          key={p.id}
                          onClick={() => abrirFicha(p)}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group"
                        >
                          <td className="py-4 px-4">
                            <div className="font-bold text-slate-900">
                              {p.responsable || p.contacto_persona || p.grupo || 'Sin nombre'}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {p.poblacion || p.provincia || '—'}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-sm text-slate-700 font-medium">{esClie ? '⭐ ' : '💼 '}{p.grupo || '—'}</span>
                          </td>
                          <td className="py-4 px-4">
                            {diasArr.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {diasArr.map(d => (
                                  <span
                                    key={d}
                                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  >
                                    {d}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sin definir</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                              esClie ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}>
                              {esClie ? 'CLIENTE' : (p.estado_comercial || 'POTENCIAL')}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            {disponibleAhora ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-100 text-green-800 border border-green-300">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                Disponible ahora
                              </span>
                            ) : disp ? (
                              <span className="text-xs text-slate-600">{disp}</span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VISTA: CALENDARIO */}
        {activeTab === 'calendario' && !loading && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border">
            <div className="flex items-center justify-between mb-4">
                <div>
                <div className="text-xs font-bold uppercase text-slate-400">Calendario de Visitas</div>
                <div className="text-sm text-slate-700">
                  {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                  </div>
                  </div>
              <div className="flex gap-2">
                  <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                  >
                    ‹
                  </button>
                  <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                  >
                    ›
                  </button>
                </div>
              </div>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                <div key={d} className="text-center text-xs font-bold text-slate-400 py-2">
                    {d}
                  </div>
                ))}
              </div>
            <div className="grid grid-cols-7 gap-2">{renderCalendar()}</div>
                </div>
              )}

        {/* VISTA: PRÓXIMAS */}
        {activeTab === 'proximas' && !loading && (
          <div className="space-y-3">
            {prospectosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay visitas próximas</div>
            ) : (
              prospectosFiltrados.map(p => {
                const esClie = esCliente(p)
                return (
                  <button
                    key={p.id}
                    onClick={() => abrirFicha(p)}
                    className={`w-full text-left p-4 rounded-2xl hover:shadow-md transition flex items-center justify-between ${
                      esClie ? 'bg-blue-50 border border-blue-200' : 'bg-[#fffbeb] border border-[#fef3c7]'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {esClie ? '⭐ ' : '💼 '}{p.grupo || 'Sin nombre'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {p.proxima_visita || p.fecha} • {p.poblacion || p.provincia || 'Localidad no definida'}
                      </div>
                      {getDisponibilidadTexto(p) && (
                        <div className="text-[10px] font-semibold text-emerald-700 mt-1.5 bg-emerald-50 px-2 py-1 rounded-lg inline-block border border-emerald-200">
                          🕐 {getDisponibilidadTexto(p)}
                        </div>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                      esClie ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {esClie ? 'CLIENTE' : (p.estado_comercial || 'POTENCIAL')}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}

        {/* VISTA: HISTORIAL */}
        {activeTab === 'historial' && !loading && (
          <div className="space-y-3">
            {prospectosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay visitas en el historial</div>
            ) : (
              <>
                {prospectosFiltrados.map(p => {
                  const esClie = esCliente(p)
                  return (
                    <button
                      key={p.id}
                      onClick={() => abrirFicha(p)}
                      className={`w-full text-left p-4 rounded-2xl hover:shadow-md transition flex items-center justify-between ${
                        esClie ? 'bg-blue-50 border border-blue-200' : 'bg-[#fffbeb] border border-[#fef3c7]'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {esClie ? '⭐ ' : '💼 '}{p.grupo || 'Sin nombre'}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          {p.ultima_visita_realizada || p.fecha} • {p.poblacion || p.provincia || 'Localidad no definida'}
                        </div>
                        {getDisponibilidadTexto(p) && (
                          <div className="text-[10px] font-semibold text-emerald-700 mt-1.5 bg-emerald-50 px-2 py-1 rounded-lg inline-block border border-emerald-200">
                            🕐 {getDisponibilidadTexto(p)}
                          </div>
                        )}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                        esClie ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                        {esClie ? 'CLIENTE' : (p.estado_comercial || 'POTENCIAL')}
                      </span>
                    </button>
                  )
                })}
              </>
            )}
        </div>
        )}

        {/* VISTA: EMBUDO (Kanban) */}
        {activeTab === 'embudo' && !loading && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {EMBUDO_COLUMNAS.map(col => {
              const prospectosEnColumna = prospectosEnEmbudo.filter(p => {
                const estado = (p.estado_comercial || 'Lead').trim()
                const estadoNormalizado = EMBUDO_COLUMNAS.includes(estado) ? estado : 'Lead'
                return estadoNormalizado === col
              })
              return (
                <div key={col} className="flex-shrink-0 w-72 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{col}</h3>
                    <span className="text-xs text-slate-500">{prospectosEnColumna.length}</span>
                  </div>
                  <div className="p-3 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                    {prospectosEnColumna.length === 0 ? (
                      <div className="text-xs text-slate-400 italic py-4 text-center">Sin prospectos</div>
                    ) : (
                      prospectosEnColumna.map(p => (
                        <button
                          key={p.id}
                          onClick={() => abrirFicha(p)}
                          className="w-full text-left p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-bold text-slate-900 text-sm">{p.grupo || 'Sin nombre'}</div>
                            <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              🔥 {p.puntuacion_lead ?? 0}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            {p.contacto_persona || p.responsable || 'Sin contacto'}
                          </div>
                          {getDisponibilidadTexto(p) && (
                            <div className="text-[10px] font-semibold text-emerald-700 mt-1.5 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              🕐 {getDisponibilidadTexto(p)}
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* VISTA: ESTADÍSTICAS */}
        {activeTab === 'estadisticas' && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Total Prospectos</div>
              <div className="text-3xl font-black text-slate-900">{estadisticas.totalProspectos}</div>
                </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Visitas Realizadas</div>
              <div className="text-3xl font-black text-slate-900">{estadisticas.visitasRealizadas}</div>
              </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Visitas Pendientes</div>
              <div className="text-3xl font-black text-slate-900">{estadisticas.visitasPendientes}</div>
              </div>
            </div>
          )}
        </div>

      {/* SIDE DRAWER - Panel lateral con animación */}
      {showPanel && prospectoSelected && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/30 z-30 backdrop-blur-sm"
            onClick={cerrarFicha}
            aria-hidden="true"
          />
          <div className="fixed right-0 top-0 h-full w-full max-w-md border-l border-slate-200 bg-white flex flex-col shadow-2xl z-40 animate-slide-in-right">
          {/* HEADER */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-mono">
                {prospectoSelected.id ? `ID: ${prospectoSelected.id}` : 'NUEVO PROSPECTO'}
              </div>
              <h2 className="text-lg font-black text-slate-900">{prospectoSelected.grupo || 'Ficha de Prospecto'}</h2>
              {prospectoSelected.id != null && (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    🔥 Puntuación Lead: {prospectoSelected.puntuacion_lead ?? 0}
                  </span>
                </div>
              )}
              </div>
            <div className="flex gap-2">
              {prospectoSelected.id && (
                <button
                  onClick={borrarProspecto}
                  className="p-2 rounded-full hover:bg-red-50 text-red-500 border border-red-100"
                >
                  🗑
                </button>
              )}
              <button onClick={cerrarFicha} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                <X size={18} />
              </button>
                </div>
                </div>
                
          {/* SUB-PESTAÑAS */}
          <div className="flex gap-2 px-5 pt-4 border-b border-slate-200">
            {['datos', 'historial', 'programas'].map(tab => (
                        <button
                key={tab}
                onClick={() => setFichaTab(tab)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                  fichaTab === tab
                    ? 'bg-[#0f172a] text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab === 'datos' ? 'Datos' : tab === 'historial' ? 'Historial' : 'Programas'}
                        </button>
            ))}
                </div>
                
          {/* CONTENIDO DEL PANEL */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* PESTAÑA: DATOS */}
            {fichaTab === 'datos' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Grupo / Cliente</label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.grupo || ''}
                    onChange={(e) => updateField('grupo', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">CIF / NIF</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.cif || ''}
                      onChange={(e) => updateField('cif', e.target.value)}
                  />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.telefono || ''}
                      onChange={(e) => updateField('telefono', e.target.value)}
                  />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Responsable</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.responsable || ''}
                      onChange={(e) => updateField('responsable', e.target.value)}
                    />
                  </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                  <input 
                    type="email"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.email || ''}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Dirección</label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.direccion || ''}
                    onChange={(e) => updateField('direccion', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Población</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.poblacion || ''}
                      onChange={(e) => updateField('poblacion', e.target.value)}
                  />
          </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Provincia</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.provincia || ''}
                      onChange={(e) => updateField('provincia', e.target.value)}
                    />
        </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ubicación / Google Maps</label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.ubicacion || ''}
                    onChange={(e) => updateField('ubicacion', e.target.value)}
                  />
      </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Notas Comerciales</label>
                  <textarea 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                    value={prospectoSelected.notas || prospectoSelected.notas_comerciales || ''}
                    onChange={(e) => {
                      updateField('notas', e.target.value)
                      updateField('notas_comerciales', e.target.value)
                    }}
                  />
    </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Estado Comercial</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.estado_comercial || 'Lead'}
                    onChange={(e) => actualizarEstadoComercial(e.target.value)}
                  >
                    <option value="Lead">Lead</option>
                    <option value="Contactado">Contactado</option>
                    <option value="Propuesta">Propuesta</option>
                    <option value="Negociación">Negociación</option>
                    <option value="Ganado">Ganado</option>
                    <option value="Perdido">Perdido</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Próxima Visita</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.proxima_visita || ''}
                    onChange={(e) => updateField('proxima_visita', e.target.value)}
                  />
                </div>
                {/* DISPONIBILIDAD PARA VISITAS */}
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-bold uppercase text-slate-400 mb-3">Disponibilidad para visitas</h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {DIAS_SEMANA.map(dia => {
                      const diasArr = (prospectoSelected.dias_visita || '').split(',').map(d => d.trim()).filter(Boolean)
                      const activo = diasArr.includes(dia)
                      return (
                        <button
                          key={dia}
                          type="button"
                          onClick={() => updateField('dias_visita', toggleDiaVisita(prospectoSelected.dias_visita || '', dia))}
                          className={`w-9 h-9 rounded-lg text-xs font-bold border transition ${
                            activo ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {dia}
                        </button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Hora inicio</label>
                      <input
                        type="time"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                        value={prospectoSelected.horario_visita_inicio || ''}
                        onChange={(e) => updateField('horario_visita_inicio', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Hora fin</label>
                      <input
                        type="time"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                        value={prospectoSelected.horario_visita_fin || ''}
                        onChange={(e) => updateField('horario_visita_fin', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                {/* BOTONES DE ACCIÓN */}
                <div className="flex gap-2 pt-2">
                  {prospectoSelected.telefono && (
                    <a
                      href={`tel:${prospectoSelected.telefono}`}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#0f172a] text-white text-xs font-bold"
                    >
                      <Phone size={14} /> Llamar
                    </a>
                  )}
                  {prospectoSelected.ubicacion && (
                    <button
                      onClick={() => {
                        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(prospectoSelected.ubicacion)}`
                        window.open(url, '_blank')
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                    >
                      <Navigation size={14} /> Mapa
                    </button>
                    )}
                  </div>
                </div>
            )}
    
            {/* PESTAÑA: HISTORIAL */}
            {fichaTab === 'historial' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Registrar Nueva Visita</h3>
                    <button
                    onClick={registrarVisita}
                    disabled={isSubmittingVisitaPanel}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmittingVisitaPanel ? 'Guardando...' : '+ Registrar'}
                    </button>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha de Visita</label>
                    <input
                      type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={nuevaVisita.fecha}
                    onChange={(e) => setNuevaVisita(prev => ({ ...prev, fecha: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Comentario</label>
                  <textarea 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                    value={nuevaVisita.comentario}
                    onChange={(e) => setNuevaVisita(prev => ({ ...prev, comentario: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Contacto</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    placeholder="Escribe el contacto externo (opcional si ya hay prospecto)"
                    value={nuevaVisita.nombre_contacto_externo}
                    onChange={(e) => setNuevaVisita(prev => ({ ...prev, nombre_contacto_externo: e.target.value }))}
                  />
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-bold uppercase text-slate-400 mb-3">Visitas Registradas</h4>
                  {visitasProspecto.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No hay visitas registradas</div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {visitasProspecto.map(v => (
                        <div key={v.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono text-slate-500 mb-1">{v.fecha}</div>
                            <div className="text-xs text-slate-700 whitespace-pre-line">{v.comentario || 'Sin comentario'}</div>
                          </div>
                          <button
                            onClick={() => abrirModalGestionVisita(v)}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition flex-shrink-0"
                            title="Gestionar"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      ))}
      </div>
                  )}
    </div>
              </div>
            )}
    
            {/* PESTAÑA: PROGRAMAS */}
            {fichaTab === 'programas' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Programas Presentados</h3>
                <button
                  onClick={addPrograma}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white"
                >
                    + Añadir
                </button>
        </div>
                {(!prospectoSelected.programas_presentados || prospectoSelected.programas_presentados.length === 0) && (
                  <div className="text-xs text-slate-400 italic">No hay programas registrados</div>
                )}
              <div className="space-y-3">
                {Array.isArray(prospectoSelected.programas_presentados) &&
                  prospectoSelected.programas_presentados.map((prog, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Programa #{idx + 1}</span>
                        <button
                          onClick={() => removePrograma(idx)}
                            className="text-xs text-red-500 hover:text-red-700"
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
              <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Destino</label>
                <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.destino || ''}
                              onChange={(e) => updatePrograma(idx, 'destino', e.target.value)}
                />
              </div>
              <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Fechas</label>
                <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.fechas || ''}
                              onChange={(e) => updatePrograma(idx, 'fechas', e.target.value)}
                />
              </div>
                      </div>
              <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Estado</label>
                <select
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.estado || 'Pendiente'}
                            onChange={(e) => updatePrograma(idx, 'estado', e.target.value)}
                >
                  <option value="Pendiente">Pendiente</option>
                            <option value="Revisión">Revisión</option>
                  <option value="Confirmado">Confirmado</option>
                </select>
            </div>
            <div>
                          <label className="block text-[10px] text-slate-500 mb-1">URL Imagen</label>
                          <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.imagen || ''}
                            onChange={(e) => updatePrograma(idx, 'imagen', e.target.value)}
                          />
            </div>
            <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Explicación</label>
                        <textarea
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs min-h-[60px]"
                          value={prog.explicacion || ''}
                            onChange={(e) => updatePrograma(idx, 'explicacion', e.target.value)}
              />
            </div>
            </div>
                  ))}
        </div>
              </div>
            )}
              </div>

          {/* BOTÓN GUARDAR */}
          <div className="p-4 border-t border-slate-200">
        <button
              type="button"
              onClick={handleSave}
              disabled={guardandoFichaProspecto}
              className="w-full py-3 rounded-2xl bg-[#0f172a] text-white text-sm font-black tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
        >
              {guardandoFichaProspecto ? 'Guardando…' : 'Guardar Ficha Completa'}
        </button>
      </div>
        </div>
        </>
      )}

      {/* MODAL AGENDAR VISITA */}
      {showAgendaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Agendar Visita</h3>
              <button
                onClick={() => setShowAgendaModal(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
              <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Fecha</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                />
              </div>
              <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Prospecto / Cliente</label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  value={agendaProspectoId}
                  onChange={(e) => handleProspectoChange(e.target.value)}
                >
                <option value="">Selecciona prospecto o cliente...</option>
                <option value="nuevo" className="font-bold">+ Crear Nuevo Prospecto</option>
                {listadoUnificado.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.tipo === 'cliente' ? '⭐ ' : '💼 '}
                    {item.nombre}
                    {item.poblacion ? ` • ${item.poblacion}` : ''}
                  </option>
                ))}
                </select>
              </div>
              <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Comentario</label>
                <textarea
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                  value={agendaComentario}
                  onChange={(e) => setAgendaComentario(e.target.value)}
                />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Contacto</label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                placeholder="Si no seleccionas prospecto/cliente, indica el contacto"
                value={agendaNombreContacto}
                onChange={(e) => setAgendaNombreContacto(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAgendaModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={guardarVisitaDesdeCalendario}
                disabled={isSubmittingAgendaVisita}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmittingAgendaVisita ? 'Guardando...' : 'Guardar Visita'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIONAR VISITA */}
      {showGestionVisitaModal && visitaGestionSelected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Gestionar Visita</h3>
              <button
                onClick={() => { setShowGestionVisitaModal(false); setVisitaGestionSelected(null); setShowInputFechaVisita(false); }}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-mono text-slate-500 mb-1">Fecha: {visitaGestionSelected.fecha}</div>
              <div className="text-xs text-slate-700 whitespace-pre-line">{visitaGestionSelected.comentario || 'Sin comentario'}</div>
            </div>
            {showInputFechaVisita ? (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-500">Nueva fecha</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  value={nuevaFechaVisita}
                  onChange={(e) => setNuevaFechaVisita(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowInputFechaVisita(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={guardarFechaVisitaDesdeModal}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0f172a] text-white"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowInputFechaVisita(true); setNuevaFechaVisita(visitaGestionSelected.fecha || ''); }}
                  className="flex-1 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700"
                >
                  Cambiar Fecha
                </button>
                <button
                  onClick={eliminarVisitaDesdeModal}
                  className="flex-1 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700"
                >
                  Eliminar Visita
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR VISITA - Formulario completo CSV */}
      {showVisitaModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowVisitaModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()} style={{ fontSize: '16px' }}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h3 className="text-xl font-bold text-slate-900" style={{ fontSize: '16px' }}>Registrar Prospecto / Visita</h3>
              <button onClick={() => setShowVisitaModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* COLUMNA IZQUIERDA - Identificación */}
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-700 uppercase text-sm tracking-wider" style={{ fontSize: '16px' }}>Identificación</h4>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Grupo (Empresa)</label>
                    <input type="text" value={formProspecto.grupo} onChange={e => setFormProspecto(p => ({ ...p, grupo: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="Nombre de la empresa" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>CIF</label>
                    <input type="text" value={formProspecto.cif} onChange={e => setFormProspecto(p => ({ ...p, cif: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="CIF/NIF" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Responsable</label>
                    <input type="text" value={formProspecto.responsable} onChange={e => setFormProspecto(p => ({ ...p, responsable: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="Nombre del responsable" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Email</label>
                    <input type="email" value={formProspecto.email} onChange={e => setFormProspecto(p => ({ ...p, email: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="email@ejemplo.com" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Teléfono</label>
                    <input type="text" value={formProspecto.telefono} onChange={e => setFormProspecto(p => ({ ...p, telefono: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="Teléfono" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Población</label>
                    <input type="text" value={formProspecto.poblacion} onChange={e => setFormProspecto(p => ({ ...p, poblacion: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="Población" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Provincia</label>
                    <input type="text" value={formProspecto.provincia} onChange={e => setFormProspecto(p => ({ ...p, provincia: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="Provincia" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Dirección</label>
                    <input type="text" value={formProspecto.direccion} onChange={e => setFormProspecto(p => ({ ...p, direccion: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="Dirección" />
                  </div>
                </div>

                {/* COLUMNA DERECHA - Comercial */}
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-700 uppercase text-sm tracking-wider" style={{ fontSize: '16px' }}>Comercial</h4>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Interés (Destino/Viaje)</label>
                    <input type="text" value={formProspecto.interes} onChange={e => setFormProspecto(p => ({ ...p, interes: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} placeholder="Destino o tipo de viaje" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Nivel de Interés</label>
                    <select value={formProspecto.nivel_interes} onChange={e => setFormProspecto(p => ({ ...p, nivel_interes: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }}>
                      <option value="">Seleccionar...</option>
                      <option value="Bajo">Bajo</option>
                      <option value="Medio">Medio</option>
                      <option value="Alto">Alto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Próxima Visita (Fecha)</label>
                    <input type="date" value={formProspecto.proxima_visita} onChange={e => setFormProspecto(p => ({ ...p, proxima_visita: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Status (Selector de color)</label>
                    <select value={formProspecto.status} onChange={e => setFormProspecto(p => ({ ...p, status: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }}>
                      <option value="">Seleccionar...</option>
                      <option value="POTENCIAL" className="bg-amber-50">🟡 Potencial</option>
                      <option value="CONTACTADO" className="bg-blue-50">🔵 Contactado</option>
                      <option value="PROPUESTA" className="bg-green-50">🟢 Propuesta</option>
                      <option value="NEGOCIACION" className="bg-purple-50">🟣 Negociación</option>
                      <option value="CERRADO" className="bg-emerald-50">✅ Cerrado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Notas Comerciales</label>
                    <textarea value={formProspecto.notas_comerciales} onChange={e => setFormProspecto(p => ({ ...p, notas_comerciales: e.target.value }))} rows={5} className="w-full px-4 py-2 rounded-xl border border-slate-200 min-h-[120px]" style={{ fontSize: '16px' }} placeholder="Notas y observaciones comerciales..." />
                  </div>
                  {/* DISPONIBILIDAD PARA VISITAS */}
                  <div className="border-t border-slate-200 pt-4 mt-4">
                    <h4 className="font-bold text-slate-700 uppercase text-sm tracking-wider mb-3" style={{ fontSize: '16px' }}>Disponibilidad para visitas</h4>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {DIAS_SEMANA.map(dia => {
                        const diasArr = (formProspecto.dias_visita || '').split(',').map(d => d.trim()).filter(Boolean)
                        const activo = diasArr.includes(dia)
                        return (
                          <button
                            key={dia}
                            type="button"
                            onClick={() => setFormProspecto(p => ({ ...p, dias_visita: toggleDiaVisita(p.dias_visita || '', dia) }))}
                            className={`w-10 h-10 rounded-xl text-sm font-bold border transition ${
                              activo ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {dia}
                          </button>
                        )
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Hora inicio</label>
                        <input type="time" value={formProspecto.horario_visita_inicio} onChange={e => setFormProspecto(p => ({ ...p, horario_visita_inicio: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-600 mb-1" style={{ fontSize: '16px' }}>Hora fin</label>
                        <input type="time" value={formProspecto.horario_visita_fin} onChange={e => setFormProspecto(p => ({ ...p, horario_visita_fin: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-slate-200" style={{ fontSize: '16px' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
                <button onClick={() => setShowVisitaModal(false)} className="flex-1 py-3 px-4 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200" style={{ fontSize: '16px' }}>Cancelar</button>
                <button
                  type="button"
                  onClick={guardarProspectoDesdeModal}
                  disabled={guardandoProspectoModal}
                  className="flex-1 py-3 px-4 rounded-xl font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ fontSize: '16px' }}
                >
                  {guardandoProspectoModal ? 'Guardando…' : 'Guardar Prospecto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
  </div>
)
}

export default CRM
