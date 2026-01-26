import React, { useState } from 'react'
import { FileText, Save, X } from 'lucide-react'

const Composer = () => {
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')

  const handleGuardar = () => {
    // Lógica para guardar el contenido
    console.log('Guardando:', { titulo, contenido })
    alert('Contenido guardado')
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-navy-900 flex items-center gap-2">
              <FileText className="text-navy-600" size={28} />
              Composer
            </h1>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                placeholder="Escribe un título..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contenido
              </label>
              <textarea
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent min-h-[400px]"
                placeholder="Escribe tu contenido aquí..."
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleGuardar}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={18} />
                Guardar
              </button>
              <button
                onClick={() => {
                  setTitulo('')
                  setContenido('')
                }}
                className="btn-secondary flex items-center gap-2"
              >
                <X size={18} />
                Limpiar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Composer
