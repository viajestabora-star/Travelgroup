import React, { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase (mismo proyecto que el resto de la app)
const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Función helper para normalizar tipos: minúsculas + sin tildes
// Ejemplo: 'Autobús' -> 'autobus', 'Restaurante' -> 'restaurante'
const normalizarTipo = (tipo) => {
  if (!tipo) return ''

  return tipo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * ProveedorForm
 * Formulario reutilizable para crear proveedores en Supabase.
 *
 * Props:
 * - initialData: datos iniciales del formulario (nombre_comercial, tipo, etc.)
 * - onSaved(proveedorMapeado): callback cuando se ha guardado correctamente
 * - onCancel(): callback para cerrar el modal sin guardar
 * - submitLabel: texto del botón de envío
 */
const ProveedorForm = ({
  initialData = {},
  onSaved,
  onCancel,
  submitLabel = 'Sincronizar Proveedor'
}) => {
  const [formData, setFormData] = useState({
    nombre_comercial: initialData.nombre_comercial || '',
    tipo: initialData.tipo || 'hotel',
    cif: initialData.cif || '',
    persona_contacto: initialData.persona_contacto || '',
    telefono: initialData.telefono || '',
    email: initialData.email || '',
    movil: initialData.movil || '',
    direccion: initialData.direccion || '',
    poblacion: initialData.poblacion || '',
    provincia: initialData.provincia || '',
    iban: initialData.iban || '',
    observaciones: initialData.observaciones || ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      // Normalizar el tipo antes de guardar: minúsculas + sin tildes
      const datosParaGuardar = {
        ...formData,
        tipo: normalizarTipo(formData.tipo)
      }

      const { data: nuevoProveedor, error } = await supabase
        .from('proveedores')
        .insert([datosParaGuardar])
        .select()
        .single()

      if (error) {
        alert('Error al guardar proveedor: ' + error.message)
        return
      }

      // Mapear proveedor al formato usado en ExpedienteDetalle
      const proveedorMapeado = {
        id: nuevoProveedor.id,
        nombreComercial: nuevoProveedor.nombre_comercial || nuevoProveedor.nombreComercial || '',
        nombreFiscal: nuevoProveedor.nombre_fiscal || nuevoProveedor.nombreFiscal || nuevoProveedor.nombre_comercial || '',
        tipo: nuevoProveedor.tipo || '',
        telefono: nuevoProveedor.telefono || nuevoProveedor.movil || '',
        email: nuevoProveedor.email || '',
        direccion: nuevoProveedor.direccion || '',
        poblacion: nuevoProveedor.poblacion || '',
        cif: nuevoProveedor.cif || ''
      }

      if (onSaved) {
        onSaved(proveedorMapeado)
      }
    } catch (error) {
      console.error('Error al guardar proveedor:', error)
      alert('Error al guardar proveedor. Revisa la consola.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
          Nombre Comercial *
        </label>
        <input
          required
          className="w-full p-6 bg-slate-50 rounded-2xl font-black text-2xl border-none outline-none focus:ring-4 focus:ring-blue-100"
          value={formData.nombre_comercial}
          onChange={e => setFormData({ ...formData, nombre_comercial: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
          Servicio
        </label>
        <select
          className="w-full p-6 bg-slate-50 rounded-2xl font-black text-lg border-none"
          value={formData.tipo}
          onChange={e => setFormData({ ...formData, tipo: e.target.value })}
        >
          <option value="hotel">HOTEL</option>
          <option value="restaurante">RESTAURANTE</option>
          <option value="autobus">AUTOBÚS</option>
          <option value="guia">GUÍA</option>
          <option value="guialocal">GUÍA LOCAL</option>
          <option value="entradas">TICKETS</option>
          <option value="seguro">SEGURO</option>
          <option value="otros">OTRO</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Persona Contacto
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.persona_contacto}
          onChange={e => setFormData({ ...formData, persona_contacto: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Email Reservas
        </label>
        <input
          type="email"
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Móvil WhatsApp
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.movil}
          onChange={e => setFormData({ ...formData, movil: e.target.value })}
        />
      </div>

      <div className="md:col-span-3 space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Dirección
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.direccion}
          onChange={e => setFormData({ ...formData, direccion: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Población
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.poblacion}
          onChange={e => setFormData({ ...formData, poblacion: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Provincia
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.provincia}
          onChange={e => setFormData({ ...formData, provincia: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          CIF
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.cif}
          onChange={e => setFormData({ ...formData, cif: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Teléfono
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none"
          value={formData.telefono}
          onChange={e => setFormData({ ...formData, telefono: e.target.value })}
        />
      </div>
      <div className="md:col-span-2 space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          IBAN
        </label>
        <input
          className="w-full p-5 bg-slate-50 rounded-2xl font-mono border-none outline-none"
          value={formData.iban}
          onChange={e => setFormData({ ...formData, iban: e.target.value })}
        />
      </div>

      <div className="md:col-span-3 space-y-2">
        <label className="text-xs font-black text-slate-400 uppercase">
          Observaciones
        </label>
        <textarea
          className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none min-h-[100px]"
          value={formData.observaciones}
          onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
        />
      </div>

      <div className="md:col-span-3 flex gap-4 pt-10">
        <button
          type="submit"
          className="flex-[2] bg-slate-900 text-white py-8 rounded-[2rem] font-black italic uppercase text-2xl tracking-tighter shadow-2xl hover:bg-blue-600 transition-all"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-slate-100 text-slate-400 py-8 rounded-[2rem] font-black uppercase italic"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default ProveedorForm

