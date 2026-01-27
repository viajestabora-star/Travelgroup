import React, { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Building2 } from 'lucide-react'

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
    <div 
      style={{ 
        background: 'white', 
        padding: '32px', 
        borderRadius: '24px', 
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)',
        border: '1px solid #f1f5f9'
      }}
    >
      {/* Header con icono azul */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-full">
          <Building2 className="text-blue-600" size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-navy-900">Información del Proveedor</h2>
          <p className="text-gray-600 text-sm">Datos del proveedor y contacto</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tarjeta: Información Principal */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Nombre Comercial *
              </label>
              <input
                required
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.nombre_comercial}
                onChange={e => setFormData({ ...formData, nombre_comercial: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Servicio
              </label>
              <select
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.tipo}
                onChange={e => setFormData({ ...formData, tipo: e.target.value })}
              >
                <option value="hotel">Hotel</option>
                <option value="restaurante">Restaurante</option>
                <option value="autobus">Autobús</option>
                <option value="guia">Guía</option>
                <option value="guialocal">Guía Local</option>
                <option value="entradas">Tickets</option>
                <option value="seguro">Seguro</option>
                <option value="otros">Otro</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tarjeta: Datos de Contacto */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
          <h3 className="text-lg font-semibold text-navy-900 mb-4">Datos de Contacto</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Persona Contacto
              </label>
              <input
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.persona_contacto}
                onChange={e => setFormData({ ...formData, persona_contacto: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email Reservas
              </label>
              <input
                type="email"
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Móvil WhatsApp
              </label>
              <input
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.movil}
                onChange={e => setFormData({ ...formData, movil: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Teléfono
              </label>
              <input
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.telefono}
                onChange={e => setFormData({ ...formData, telefono: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Tarjeta: Dirección */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
          <h3 className="text-lg font-semibold text-navy-900 mb-4">Dirección</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-3">
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Dirección
              </label>
              <input
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.direccion}
                onChange={e => setFormData({ ...formData, direccion: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Población
              </label>
              <input
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.poblacion}
                onChange={e => setFormData({ ...formData, poblacion: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Provincia
              </label>
              <input
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.provincia}
                onChange={e => setFormData({ ...formData, provincia: e.target.value })}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                CIF
              </label>
              <input
                className="w-full p-4 transition-all"
                style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3b82f6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.boxShadow = 'none'
                }}
                value={formData.cif}
                onChange={e => setFormData({ ...formData, cif: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Tarjeta: Información Bancaria */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
          <h3 className="text-lg font-semibold text-navy-900 mb-4">Información Bancaria</h3>
          <div>
            <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              IBAN
            </label>
            <input
              className="w-full p-4 transition-all font-mono"
              style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6'
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e2e8f0'
                e.target.style.boxShadow = 'none'
              }}
              value={formData.iban}
              onChange={e => setFormData({ ...formData, iban: e.target.value })}
            />
          </div>
        </div>

        {/* Tarjeta: Observaciones */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
          <h3 className="text-lg font-semibold text-navy-900 mb-4">Observaciones</h3>
          <div>
            <label className="block mb-2" style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Observaciones
            </label>
            <textarea
              className="w-full p-4 transition-all min-h-[100px]"
              style={{ backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '16px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0' }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6'
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e2e8f0'
                e.target.style.boxShadow = 'none'
              }}
              value={formData.observaciones}
              onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
            />
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md"
          >
            {submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export default ProveedorForm

