// src/components/ServicioRow.jsx
import React, { useState, useEffect, useRef, memo } from 'react';
import { Trash2 } from 'lucide-react';

// Componente memoizado para evitar re-renders innecesarios
const ServicioRow = memo(({ 
  servicio, 
  index, 
  proveedores,
  paxPago,
  totalPax,
  onUpdate,
  onDelete,
  onBlur
}) => {
  // Estados locales para edición SIN CAUSAR RE-RENDERS DEL PADRE
  const [localCoste, setLocalCoste] = useState(servicio.coste_unitario || '');
  const [localTotalManual, setLocalTotalManual] = useState(servicio.total_servicio_manual || '');
  const [localProveedor, setLocalProveedor] = useState(servicio.proveedorId || '');
  const [localNombreEspecifico, setLocalNombreEspecifico] = useState(servicio.nombreEspecifico || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // Refs para evitar actualizaciones mientras se escribe
  const timeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  // Sincronizar cuando cambia la prop del padre (solo si no estamos escribiendo)
  useEffect(() => {
    if (!isTypingRef.current) {
      setLocalCoste(servicio.coste_unitario || '');
      setLocalTotalManual(servicio.total_servicio_manual || '');
      setLocalProveedor(servicio.proveedorId || '');
      setLocalNombreEspecifico(servicio.nombreEspecifico || '');
    }
  }, [servicio]);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCosteChange = (e) => {
    isTypingRef.current = true;
    setLocalCoste(e.target.value);
    
    // Debounce para guardar cuando deje de escribir
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      if (localCoste !== servicio.coste_unitario) {
        onUpdate(servicio.id, { coste_unitario: parseFloat(e.target.value) || 0 });
      }
    }, 800);
  };

  const handleTotalManualChange = (e) => {
    isTypingRef.current = true;
    setLocalTotalManual(e.target.value);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      if (localTotalManual !== servicio.total_servicio_manual) {
        onUpdate(servicio.id, { total_servicio_manual: parseFloat(e.target.value) || 0 });
      }
    }, 800);
  };

  const handleProveedorChange = (e) => {
    const nuevoProveedorId = e.target.value;
    setLocalProveedor(nuevoProveedorId);
    // Guardar inmediatamente en blur, no mientras escribe
  };

  const handleBlur = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    isTypingRef.current = false;
    
    const updates = {};
    if (localCoste !== servicio.coste_unitario) {
      updates.coste_unitario = parseFloat(localCoste) || 0;
    }
    if (localTotalManual !== servicio.total_servicio_manual) {
      updates.total_servicio_manual = parseFloat(localTotalManual) || 0;
    }
    if (localProveedor !== servicio.proveedorId) {
      updates.proveedorId = localProveedor;
    }
    if (localNombreEspecifico !== servicio.nombreEspecifico) {
      updates.nombreEspecifico = localNombreEspecifico;
    }
    
    if (Object.keys(updates).length > 0) {
      onBlur(servicio.id, updates);
    }
  };

  const tipoServicio = servicio.tipo_servicio || servicio.tipo || 'Hotel';
  const esPorGrupo = servicio.tipo_calculo === 'porGrupo' || servicio.tipo_calculo === 'Total a dividir';

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100">
      <td className="p-2">
        <select
          value={localProveedor}
          onChange={handleProveedorChange}
          onBlur={handleBlur}
          className="w-full p-2 border rounded text-sm"
        >
          <option value="">Sin proveedor</option>
          {proveedores.map(p => (
            <option key={p.id} value={p.id}>{p.nombreComercial}</option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <input
          type="text"
          value={tipoServicio}
          readOnly
          className="w-full p-2 bg-gray-100 rounded text-sm"
        />
      </td>
      <td className="p-2">
        <input
          type="text"
          value={localNombreEspecifico}
          onChange={(e) => setLocalNombreEspecifico(e.target.value)}
          onBlur={handleBlur}
          className="w-full p-2 border rounded text-sm"
          placeholder="Especificación"
        />
      </td>
      <td className="p-2">
        {esPorGrupo ? (
          <input
            type="number"
            value={localTotalManual}
            onChange={handleTotalManualChange}
            onBlur={handleBlur}
            className="w-full p-2 border rounded text-sm"
            placeholder="Total grupo"
            step="0.01"
            min="0"
          />
        ) : (
          <input
            type="number"
            value={localCoste}
            onChange={handleCosteChange}
            onBlur={handleBlur}
            className="w-full p-2 border rounded text-sm"
            placeholder="Coste unitario"
            step="0.01"
            min="0"
          />
        )}
      </td>
      <td className="p-2 text-right font-medium">
        {calcularTotalServicio(servicio, paxPago, totalPax)}€
      </td>
      <td className="p-2 text-center">
        <button
          onClick={() => onDelete(servicio.id)}
          className="text-red-600 hover:text-red-800 p-1"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
});

// Helper fuera del componente para evitar recreación
const calcularTotalServicio = (servicio, paxPago, totalPax) => {
  if (!servicio) return '0.00';
  
  const tipoNorm = (servicio.tipo_servicio || servicio.tipo || '').toLowerCase();
  const esPorGrupo = servicio.tipo_calculo === 'porGrupo' || servicio.tipo_calculo === 'Total a dividir';
  const coste = parseFloat(servicio.coste_unitario) || 0;
  const manual = parseFloat(servicio.total_servicio_manual) || 0;
  
  if (tipoNorm.includes('guia') || tipoNorm === 'g') {
    const cantidad = Math.max(1, parseFloat(servicio.cantidad) || parseFloat(servicio.dias_guia) || 1);
    return (coste * cantidad).toFixed(2);
  }
  
  if (esPorGrupo) {
    return (manual || coste).toFixed(2);
  }
  
  const factor = tipoNorm.includes('hotel') ? (parseFloat(servicio.noches) || 1) : 1;
  return (coste * factor * totalPax).toFixed(2);
};

ServicioRow.displayName = 'ServicioRow';
export default ServicioRow;