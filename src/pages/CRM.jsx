import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, RefreshCw, ChevronLeft, ChevronRight, Edit3, Calendar, UserPlus } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0])
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0]
  })

  const cargarDatos = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('prospectos').select('*').order('id', { ascending: false })
    if (!error) setProspectos(data || [])
    setLoading(false)
  }

  useEffect(() => { cargarDatos() }, [])

  const pasarACliente = async (prospecto) => {
    if (window.confirm(`¿Estás seguro de que quieres convertir a "${prospecto.grupo}" en Cliente oficial?`)) {
      try {
        const { error: errorIns } = await supabase.from('clientes').insert([{
          nombre: prospecto.grupo, contacto: prospecto.contacto, telefono: prospecto.telefono, notas: prospecto.notas
        }])
        if (errorIns) throw errorIns
        await supabase.from('prospectos').delete().eq('id', prospecto.id)
        alert("✅ Movido a Clientes"); cargarDatos()
      } catch (err) { alert("Error: " + err.message) }
    }
  }

  const eliminarVisita = async (id, nombre) => {
    // Aplicando regla personalizada: Confirmación de borrado
    if (window.confirm(`¿Estás seguro de que quieres eliminar la visita de "${nombre}"? Esta acción no se puede deshacer.`)) {
      const { error } = await supabase.from('prospectos').delete().eq('id', id)
      if (error) alert("Error al eliminar"); else cargarDatos()
    }
  }

  const prospectosFiltrados = prospectos.filter(p => {
    const coincideBusqueda = (p.grupo || "").toLowerCase().includes(busqueda.toLowerCase())
    const coincideFecha = p.fecha === fechaSeleccionada
    return busqueda ? coincideBusqueda : coincideFecha
  })

  const esEnero2026 = currentDate.getMonth() === 0 && currentDate.getFullYear() === 2026

  const renderCalendar = () => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(<div key={`e-${i}`} className="h-12"></div>)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const esSel = dateStr === fechaSeleccionada
      const tieneVisita = prospectos.some(p => p.fecha === dateStr)
      cells.push(
        <button key={day} onClick={() => setFechaSeleccionada(dateStr)}
          className={`h-12 w-full flex flex-col items-center justify-center rounded-2xl relative ${esSel ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-700'}`}>
          <span className="text-sm font-bold">{day}</span>
          {tieneVisita && <div className={`w-1 h-1 rounded-full mt-1 ${esSel ? 'bg-white' : 'bg-orange-500'}`}></div>}
        </button>
      )
    }
    return cells
  }

  const guardarCambios = async (e) => {
    e.preventDefault()
    const res = editandoId ? await supabase.from('prospectos').update(nuevo).eq('id', editandoId) : await supabase.from('prospectos').insert([nuevo])
    if (!res.error) { cerrarModal(); cargarDatos() }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0] })
    setEditandoId(null); setShowModal(false)
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-28 font-sans">
      <div className="flex justify-between items-center mb-6 px-2">
        <h1 className="text-3xl font-black italic text-slate-900">TABORA</h1>
        <button onClick={() => setShowModal(true)} className="bg-slate-900 text-white p-4 rounded-3xl shadow-xl"><Plus size={24}/></button>
      </div>

      <div className="bg-white rounded-[2.5rem] p-6 shadow-xl mb-6 border border-white">
        <div className="flex justify-between items-center mb-6 uppercase italic font-black text-slate-800">
          <h2>{currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</h2>
          <div className="flex gap-2 text-slate-400">
            <button onClick={() => !esEnero2026 && setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className={esEnero2026 ? 'opacity-10' : ''}><ChevronLeft/></button>
            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}><ChevronRight/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text