import React, { useState, useEffect, useMemo, useRef } from 'react'
import { X, Users, Calculator, Bed, DollarSign, FileUp, TrendingUp, Save, Upload, Trash2, Plus, FileText, Pencil } from 'lucide-react'
import { storage } from '../utils/storage'
import { normalizarFechaEspañola, convertirEspañolAISO, convertirISOAEspañol } from '../utils/dateNormalizer'
import { createClient } from '@supabase/supabase-js'
import ProveedorForm from './ProveedorForm'
import jsPDF from 'jspdf'

// Cliente de Supabase para cargar proveedores
const supabase = createClient(
  'https://gtwyqxfkpdwpakmgrkbu.supabase.co',
  'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
)

// Función helper para normalizar tipos: minúsculas + sin tildes
// Ejemplo: 'Autobús' -> 'autobus', 'Restaurante' -> 'restaurante'
const normalizarTipo = (tipo) => {
  if (!tipo) return '';
  
  return tipo
    .toLowerCase()
    .normalize('NFD') // Normaliza caracteres con tildes
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (tildes)
    .trim();
}

// Función helper para normalizar texto: minúsculas + sin tildes (uso general)
// Usada para comparaciones robustas en filtros
const normalizarText = (text) => {
  if (!text) return '';
  
  return String(text)
    .toLowerCase()
    .normalize('NFD') // Normaliza caracteres con tildes
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (tildes)
    .trim();
}

// Generador sencillo de UUID v4 (para servicios de cotización locales y Supabase)
const generarUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * ============ FUNCIÓN ÚNICA DE LIMPIEZA DE NÚMEROS ============
 * Limpia todos los números: quita '€', cambia ',' por '.', elimina espacios y símbolos.
 * Ejemplo: "47,40€" -> 47.40 | "1.234,56 €" -> 1234.56 | "69 pax" -> 69
 * PRESERVA DECIMALES: Mantiene decimales correctamente para inputs numéricos
 */
const limpiarNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') {
    // Si ya es número, verificar que no sea NaN
    return isNaN(valor) ? 0 : valor;
  }
  
  // Convertir a string y limpiar
  let limpio = String(valor).trim();
  
  // Detectar formato: si tiene coma y punto, es formato europeo (1.234,56)
  // Si solo tiene punto o solo tiene coma, tratar como decimal
  const tienePunto = limpio.includes('.');
  const tieneComa = limpio.includes(',');
  
  if (tienePunto && tieneComa) {
    // Formato europeo: 1.234,56 -> eliminar punto de miles, convertir coma a punto
    limpio = limpio.replace(/\./g, ''); // Eliminar puntos de miles
    limpio = limpio.replace(/,/g, '.'); // Cambiar coma decimal por punto
  } else if (tieneComa && !tienePunto) {
    // Solo coma: formato europeo simple (66,50) -> convertir a punto
    limpio = limpio.replace(/,/g, '.');
  }
  // Si solo tiene punto o no tiene ninguno, mantenerlo (formato americano o entero)
  
  // Eliminar todo lo que no sea número, punto decimal o signo negativo
  limpio = limpio.replace(/[^0-9.-]+/g, "");
  
  // Parsear a float (PRESERVA DECIMALES)
  const resultado = parseFloat(limpio);
  
  // Verificar que sea un número válido
  return isNaN(resultado) ? 0 : resultado;
};

/**
 * ============ FUNCIÓN ESPECÍFICA PARA INPUTS NUMÉRICOS ============
 * Para inputs de tipo "number", preserva decimales directamente
 * Maneja tanto formato americano (66.50) como europeo (66,50)
 */
const limpiarInputNumerico = (valor) => {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number') {
    return valor;
  }
  
  let limpio = String(valor).trim();
  
  // Si tiene coma, convertirla a punto (formato europeo -> americano)
  if (limpio.includes(',') && !limpio.includes('.')) {
    limpio = limpio.replace(/,/g, '.');
  }
  
  // Eliminar solo símbolos no numéricos (preservar punto decimal y signo negativo)
  limpio = limpio.replace(/[^0-9.-]+/g, "");
  
  // Si está vacío después de limpiar, retornar string vacío para permitir edición
  if (limpio === '' || limpio === '-') return '';
  
  // Parsear y retornar (preserva decimales)
  const resultado = parseFloat(limpio);
  return isNaN(resultado) ? '' : resultado;
};

// Alias para compatibilidad con código existente
const soloNumeros = limpiarNumero;
const limpiarCosteUnitario = limpiarNumero;

const ExpedienteDetalle = ({ expediente, onClose, onUpdate, clientes = [] }) => {
  // ⚠️ BLINDAJE NIVEL 1: Verificar que expediente existe
  if (!expediente) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md">
          <h3 className="text-xl font-bold text-blue-600 mb-4">⏳ Cargando...</h3>
          <p className="text-gray-700">Cargando datos del expediente...</p>
          <button onClick={onClose} className="btn-primary mt-4 w-full">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  // Estados
  const [tab, setTab] = useState('grupo')
  const [editandoCliente, setEditandoCliente] = useState(false)
  
  // Ref para rastrear si ya se inicializaron los servicios automáticamente
  const serviciosInicializados = useRef(false)
  
  // Estados para Cotización (CON VALORES SEGUROS, sin usar columna JSON cotizacion)
  const [servicios, setServicios] = useState([]) // Se cargan desde servicios_cotizacion
  const [numTotalPasajeros, setNumTotalPasajeros] = useState(
    expediente?.total_pax || expediente?.pax_pago || 1
  )
  const [numGratuidades, setNumGratuidades] = useState(
    expediente?.gratuidades || 0
  )
  const [bonificacionPorPersona, setBonificacionPorPersona] = useState(0)
  const [precioVentaManual, setPrecioVentaManual] = useState(0) // Precio manual €/pax
  
  // Estados para Proveedores
  const [proveedores, setProveedores] = useState([])
  const [busquedaProveedor, setBusquedaProveedor] = useState({}) // { servicioId: 'texto búsqueda' }
  const [mostrarSugerencias, setMostrarSugerencias] = useState({}) // { servicioId: true/false }
  
  // Estado para Modal de Nuevo Proveedor (reutiliza ProveedorForm)
  const [showModal, setShowModal] = useState(false)
  const [nombreNuevoProveedor, setNombreNuevoProveedor] = useState('')
  const [tipoNuevoProveedor, setTipoNuevoProveedor] = useState('hotel')
  const [servicioIdParaProveedor, setServicioIdParaProveedor] = useState(null)
  
  // Función para cargar proveedores desde Supabase
  const cargarProveedores = async () => {
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre_comercial', { ascending: true });
      
      if (error) {
        console.error('Error cargando proveedores:', error)
        setProveedores([])
        return
      }
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        setProveedores([])
        return
      }
      
      // Mapear campos de Supabase a formato interno
      // IMPORTANTE: Los IDs de proveedores son int8 (números enteros: 1, 2, 3...)
      const proveedoresMapeados = data.map(p => ({
        id: typeof p.id === 'string' ? Number(p.id) : Number(p.id),
        nombreComercial: p.nombre_comercial || p.nombreComercial || '',
        nombreFiscal: p.nombre_fiscal || p.nombreFiscal || p.nombre_comercial || '',
        tipo: p.tipo || '',
        telefono: p.telefono || p.movil || '',
        email: p.email || '',
        direccion: p.direccion || '',
        poblacion: p.poblacion || '',
        cif: p.cif || ''
      }));
      
      setProveedores(proveedoresMapeados)
      
      try {
      storage.set('proveedores', proveedoresMapeados)
      } catch (storageError) {
        // Silenciar error de localStorage
      }
      
    } catch (error) {
      console.error('Error cargando proveedores:', error)
      setProveedores([])
    }
  };
  
  // Cargar proveedores desde Supabase al montar
  useEffect(() => {
    cargarProveedores();
  }, [])
  
  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.relative')) {
        setMostrarSugerencias({})
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // ============ ARQUITECTURA DE CARGA UNIFICADA ============
  // Función única que carga servicios y parámetros con sincronización de proveedores
  useEffect(() => {
    const cargarDatosCompletos = async () => {
      const expedienteId = expediente?.id
      if (!expedienteId || proveedores.length === 0) return

      try {
        // Cargar servicios y parámetros en paralelo
        const [serviciosResponse, parametrosResponse] = await Promise.all([
          supabase
          .from('servicios_cotizacion')
          .select('*')
            .eq('id_expediente', String(expedienteId).trim())
            .order('id', { ascending: true }),
          supabase
            .from('expedientes')
            .select('total_pax, pax_pago, gratuidades, precio_venta_cliente, bonificacion_pax')
            .eq('id', expedienteId)
            .single()
        ])

        // ============ MAPEO DE SERVICIOS CON SINCRONIZACIÓN DE PROVEEDORES ============
        if (serviciosResponse.data && Array.isArray(serviciosResponse.data) && serviciosResponse.data.length > 0) {
          const busquedaProveedoresRestaurada = {}
          
          const serviciosMapeados = serviciosResponse.data.map(row => {
            // Validar y convertir proveedor_id_int (int8) a número
            const proveedorIdInt = row.proveedor_id_int ? Number(row.proveedor_id_int) : null
            
            // Sincronizar proveedor: buscar en array usando ID numérico
            if (proveedorIdInt && !isNaN(proveedorIdInt) && proveedorIdInt > 0) {
              const proveedorEncontrado = proveedores.find(p => {
                const proveedorIdLista = Number(p.id)
                return !isNaN(proveedorIdLista) && proveedorIdLista === proveedorIdInt
              })
              
              if (proveedorEncontrado) {
                busquedaProveedoresRestaurada[row.id] = proveedorEncontrado.nombreComercial
              }
            }
            
            // Si no hay proveedor por ID pero hay nombre manual, usarlo
            if (!busquedaProveedoresRestaurada[row.id] && row.nombre_proveedor_manual) {
              busquedaProveedoresRestaurada[row.id] = row.nombre_proveedor_manual
            }

            // Mapear servicio con validación numérica estricta
            return {
            id: row.id || generarUUID(),
              proveedorId: proveedorIdInt,
              proveedorNombreTemporal: row.nombre_proveedor_manual || '',
            tipo: row.tipo_servicio || row.tipo || 'Hotel',
            nombreEspecifico: row.nombre_especifico || '',
            localizacion: row.localizacion || '',
              costeUnitario: row.coste_unitario !== null && row.coste_unitario !== undefined ? Number(row.coste_unitario) : 0,
              precioVenta: row.precio_venta !== null && row.precio_venta !== undefined ? Number(row.precio_venta) : 0,
              margen: row.margen_pax !== null && row.margen_pax !== undefined ? Number(row.margen_pax) : 0,
              noches: row.noches !== null && row.noches !== undefined ? Number(row.noches) : 0,
              fechaRelease: row.fecha_release ? String(row.fecha_release).split('T')[0] : '',
              tipoCalculo: row.tipo_calculo || 'porPersona',
            }
          })

          setBusquedaProveedor(busquedaProveedoresRestaurada)
          setServicios(serviciosMapeados)
          serviciosInicializados.current = true
        } else {
          serviciosInicializados.current = false
        }

        // ============ MAPEO DE PARÁMETROS DEL EXPEDIENTE ============
        if (parametrosResponse.data) {
          const data = parametrosResponse.data
          if (data.total_pax !== undefined && data.total_pax !== null) {
            setNumTotalPasajeros(String(Number(data.total_pax)))
          }
          if (data.gratuidades !== undefined && data.gratuidades !== null) {
            setNumGratuidades(String(Number(data.gratuidades)))
          }
          if (data.precio_venta_cliente !== undefined && data.precio_venta_cliente !== null) {
            setPrecioVentaManual(String(Number(data.precio_venta_cliente)))
          }
          if (data.bonificacion_pax !== undefined && data.bonificacion_pax !== null) {
            setBonificacionPorPersona(String(Number(data.bonificacion_pax)))
          }
        }

        // ============ CÁLCULO AUTOMÁTICO POST-CARGA ============
        // El useMemo se recalculará automáticamente al cambiar 'servicios' o parámetros

      } catch (err) {
        console.error('Error cargando datos:', err)
      }
    }

    if (expediente?.id && proveedores.length > 0) {
      cargarDatosCompletos()
    }
  }, [expediente?.id, proveedores])

  // ============ FUNCIÓN PARA CONVERTIR NÚMEROS A TEXTO ============
  const numeroATexto = (numero) => {
    const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
    const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
    const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

    const num = Math.floor(numero)
    const decimales = Math.round((numero - num) * 100)

    if (num === 0) return 'cero'
    if (num === 1) return 'un'
    if (num === 100) return 'cien'
    if (num < 10) return unidades[num]
    if (num < 20) return especiales[num - 10]
    if (num < 100) {
      const decena = Math.floor(num / 10)
      const unidad = num % 10
      if (unidad === 0) return decenas[decena]
      return decenas[decena] + ' y ' + unidades[unidad]
    }
    if (num < 1000) {
      const centena = Math.floor(num / 100)
      const resto = num % 100
      if (resto === 0) return centenas[centena]
      return centenas[centena] + ' ' + numeroATexto(resto)
    }
    if (num < 1000000) {
      const miles = Math.floor(num / 1000)
      const resto = num % 1000
      let texto = miles === 1 ? 'mil' : numeroATexto(miles) + ' mil'
      if (resto > 0) texto += ' ' + numeroATexto(resto)
      return texto
    }
    return numero.toString()
  }

  // ============ GENERAR PDF DE RECIBO ============
  const generarReciboPDF = (cobro) => {
    const crearDocumento = (logoImg) => {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      
      // Colores corporativos
      const colorAmarillo = [255, 193, 7] // #FFC107
      const colorAzul = [33, 150, 243] // #2196F3
      
      // Obtener datos del expediente y cliente
      const nombreGrupo = expediente?.nombre_grupo || expediente?.clienteNombre || 'Sin nombre'
      const destino = expediente?.destino || 'Sin destino'
      const clienteNombre = grupo?.nombre || expediente?.clienteNombre || 'Sin cliente'
      const importe = Number(cobro.importe || 0)
      const importeTexto = numeroATexto(importe) + ' euros'
      const fechaCobro = cobro.fecha ? new Date(cobro.fecha) : new Date()
      const fechaFormateada = fechaCobro.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })
      
      // Fondo con colores corporativos (banda superior)
      doc.setFillColor(...colorAmarillo)
      doc.rect(0, 0, pageWidth, 30, 'F')
      
      // Logo corporativo Tabora (si está disponible)
      if (logoImg) {
        try {
          doc.setFillColor(255, 255, 255)
          // Recuadro blanco para asegurar contraste
          doc.rect(10, 5, 55, 22, 'F')
          // Logo aprox. 45mm de ancho (ajustado a proporción)
          doc.addImage(logoImg, 'PNG', 12, 6, 50, 20)
        } catch (e) {
          console.warn('No se pudo dibujar el logo en el PDF:', e)
        }
      } else {
        // Fallback: reserva de espacio en blanco
        doc.setFillColor(255, 255, 255)
        doc.rect(10, 5, 55, 22, 'F')
      }
      
      // Título "RECIBO"
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text('RECIBO', pageWidth - 60, 20)
      
      // Importe entre almohadillas (arriba a la derecha)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(`# ${importe.toFixed(2)}€ #`, pageWidth - 60, 35)
      
      // Línea separadora
      doc.setDrawColor(...colorAzul)
      doc.setLineWidth(0.5)
      doc.line(10, 45, pageWidth - 10, 45)
      
      // Contenido principal (ligeramente más abajo para no chocar con el logo)
      let yPos = 70
      
      // "Se recibió de"
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text('Se recibió de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      doc.text(clienteNombre, 60, yPos)
      yPos += 15
      
      // "La cantidad de"
      doc.setFont('helvetica', 'normal')
      doc.text('La cantidad de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      doc.text(importeTexto.charAt(0).toUpperCase() + importeTexto.slice(1), 60, yPos)
      yPos += 15
      
      // "En concepto de"
      doc.setFont('helvetica', 'normal')
      doc.text('En concepto de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      const concepto = `${nombreGrupo} - ${destino}`
      doc.text(concepto, 60, yPos)
      yPos += 20
      
      // Fecha
      doc.setFont('helvetica', 'normal')
      doc.text(`Fecha: ${fechaFormateada}`, 20, yPos)
      yPos += 20
      
      // Método de pago
      doc.text(`Método de pago: ${cobro.metodo_pago || '-'}`, 20, yPos)
      yPos += 10
      
      // Pie de página con datos fiscales
      const footerY = pageHeight - 50
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      
      // Línea separadora antes del pie
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)
      
      // Datos fiscales
      doc.text('Valservice Incoming S.L. (Viajes Tabora)', 20, footerY)
      doc.text('CIF: B-98998107', 20, footerY + 8)
      doc.text('Licencia: CVMm303V', 20, footerY + 16)
      doc.text('Apartado de correos 58, 46185 La Pobla de Vallbona (Valencia)', 20, footerY + 24)
      
      // Nombre del archivo
      const nombreArchivo = `Recibo_${nombreGrupo.replace(/[^a-zA-Z0-9]/g, '_')}_${fechaCobro.toISOString().split('T')[0]}.pdf`
      
      // Descargar PDF
      doc.save(nombreArchivo)
    }

    const logo = new Image()
    // Intentar primero con el nombre de archivo original arrastrado
    logo.src = '/Logo tabora 2023.png'
    logo.onload = () => {
      console.log('✅ Logo Tabora cargado correctamente para el recibo PDF')
      crearDocumento(logo)
    }
    logo.onerror = () => {
      console.warn('No se pudo cargar el logo desde "/Logo tabora 2023.png". Probando "/tabora-logo.png"...')
      const fallbackLogo = new Image()
      fallbackLogo.src = '/tabora-logo.png'
      fallbackLogo.onload = () => {
        console.log('✅ Logo Tabora cargado desde fallback "/tabora-logo.png"')
        crearDocumento(fallbackLogo)
      }
      fallbackLogo.onerror = (e) => {
        console.warn('❗ No se pudo cargar ningún logo para el recibo PDF:', e)
        crearDocumento(null)
      }
    }
  }

  // ============ CARGAR COBROS DEL EXPEDIENTE ============
  const cargarCobros = async () => {
    if (!expediente?.id) {
      setCobros([])
      return
    }
    
    try {
      const { data, error } = await supabase
        .from('cobros_expediente')
        .select('*')
        .eq('expediente_id', expediente.id)
        .order('fecha', { ascending: false })
      
      if (error) {
        console.error('Error cargando cobros:', error)
        setCobros([])
        return
      }
      
      // Actualizar estado inmediatamente para refrescar la UI
      setCobros(data || [])
    } catch (error) {
      console.error('Error fatal cargando cobros:', error)
      setCobros([])
    }
  }

  // Cargar cobros cuando se abre la pestaña o cambia el expediente
  useEffect(() => {
    if (tab === 'cobros' && expediente?.id) {
      cargarCobros()
    } else if (tab !== 'cobros') {
      // Limpiar cobros cuando se cambia de pestaña para optimizar memoria
      setCobros([])
    }
  }, [tab, expediente?.id])

  // ============ GUARDAR COBRO ============
  const guardarCobro = async () => {
    if (!expediente?.id) {
      alert('❌ No se puede guardar: expediente no válido')
      return
    }

    // Validación: Verificar que el expediente tenga un cliente asignado
    const clienteId = expediente.cliente_id || expediente.clienteId
    if (!clienteId) {
      alert('⚠️ No se puede registrar el cobro: El expediente no tiene un cliente asignado.\n\nPor favor, asigna un cliente al expediente antes de registrar cobros.')
      return
    }

    // Validación de importe
    const importeLimpio = limpiarNumero(formCobro.importe)
    if (importeLimpio <= 0) {
      alert('❌ El importe debe ser mayor que 0')
      return
    }

    // Validación de concepto
    if (!formCobro.concepto || formCobro.concepto.trim() === '') {
      alert('❌ El concepto es obligatorio')
      return
    }

    try {
      const datosCobro = {
        expediente_id: expediente.id,
        cliente_id: clienteId,
        importe: importeLimpio,
        metodo_pago: formCobro.metodo_pago,
        cuenta_destino: formCobro.cuenta_destino,
        concepto: formCobro.concepto.trim()
      }

      let errorOperacion = null

      if (cobroEnEdicionId) {
        const { error } = await supabase
          .from('cobros_expediente')
          .update(datosCobro)
          .eq('id', cobroEnEdicionId)
        errorOperacion = error
      } else {
        const { error } = await supabase
          .from('cobros_expediente')
          .insert([datosCobro])
        errorOperacion = error
      }

      if (errorOperacion) {
        console.error('Error guardando cobro:', errorOperacion)
        alert(`❌ Error guardando cobro:\n\n${errorOperacion.message || JSON.stringify(errorOperacion)}`)
        return
      }

      // Recargar lista de cobros inmediatamente para refrescar la UI
      await cargarCobros()

      // Resetear formulario y cerrar modal
      setFormCobro({
        importe: '',
        metodo_pago: 'Transferencia',
        cuenta_destino: 'Caixabank',
        concepto: ''
      })
      setCobroEnEdicionId(null)
      setShowModalCobro(false)
    } catch (error) {
      console.error('Error inesperado guardando cobro:', error)
      alert(`❌ Error inesperado:\n\n${error.message || JSON.stringify(error)}`)
    }
  }

  // ============ INICIALIZACIÓN AUTOMÁTICA DE SERVICIOS SI NO HAY NADA EN BD ============
  // Carga automática: Si la lista de servicios está vacía, inicializar con 5 servicios básicos
  useEffect(() => {
    if (serviciosInicializados.current) return
    if (!servicios || servicios.length > 0) return

    const timestamp = Date.now()
    const serviciosIniciales = [
      {
        id: generarUUID(),
        proveedorId: null,
        tipo: 'Autobús',
        nombreEspecifico: '',
        localizacion: '',
        costeUnitario: 0, // Coste Real
        precioVenta: 0, // Precio Venta
        margen: 0, // Margen
        noches: 0,
        fechaRelease: '',
        tipoCalculo: 'porGrupo', // Autobús: total a dividir entre pax_pago
      },
      {
        id: generarUUID(),
        proveedorId: null,
        tipo: 'Hotel',
        nombreEspecifico: '',
        localizacion: '',
        costeUnitario: 0, // Coste Real
        precioVenta: 0, // Precio Venta
        margen: 0, // Margen
        noches: 1,
        fechaRelease: '',
        tipoCalculo: 'porPersona',
      },
      {
        id: generarUUID(),
        proveedorId: null,
        tipo: 'Guía',
        nombreEspecifico: '',
        localizacion: '',
        costeUnitario: 0, // Coste Real
        precioVenta: 0, // Precio Venta
        margen: 0, // Margen
        noches: 0,
        fechaRelease: '',
        tipoCalculo: 'porGrupo', // Guía: total a dividir entre pax_pago
      },
      {
        id: generarUUID(),
        proveedorId: null,
        tipo: 'Seguro',
        nombreEspecifico: '',
        localizacion: '',
        costeUnitario: 0, // Coste Real
        precioVenta: 0, // Precio Venta
        margen: 0, // Margen
        noches: 0,
        fechaRelease: '',
        tipoCalculo: 'porPersona',
      },
      {
        id: generarUUID(),
        proveedorId: null,
        tipo: 'Restaurante',
        nombreEspecifico: '',
        localizacion: '',
        costeUnitario: 0, // Coste Real
        precioVenta: 0, // Precio Venta
        margen: 0, // Margen
        noches: 0,
        fechaRelease: '',
        tipoCalculo: 'porPersona', // Por defecto, puede cambiarse a 'porGrupo'
      },
    ]

    setServicios(serviciosIniciales)
    serviciosInicializados.current = true // Marcar como inicializado
  }, [servicios])
  
  // ============ UX: HANDLERS PARA INPUTS ============
  
  // Auto-limpiar campo cuando está en 0 y se hace focus
  const handleFocus = (e) => {
    if (e.target.value === '0' || parseFloat(e.target.value) === 0) {
      e.target.select() // Selecciona todo para fácil reemplazo
    }
  }
  
  // Deshabilitar cambio con rueda del ratón
  const handleWheel = (e) => {
    e.target.blur() // Quita el focus para evitar cambio accidental
  }
  
  // Estados para Rooming List
  const [habitaciones, setHabitaciones] = useState({
    dobles: expediente?.pasajeros?.habitaciones?.dobles || 0,
    doblesTwin: expediente?.pasajeros?.habitaciones?.doblesTwin || 0,
    individuales: expediente?.pasajeros?.habitaciones?.individuales || 0,
  })
  const [documentos, setDocumentos] = useState(expediente?.documentos || [])
  
  // ============ ESTADOS PARA GESTIÓN DE COBROS ============
  const [cobros, setCobros] = useState([])
  const [showModalCobro, setShowModalCobro] = useState(false)
  const [cobroEnEdicionId, setCobroEnEdicionId] = useState(null)
  const [formCobro, setFormCobro] = useState({
    importe: '',
    metodo_pago: 'Transferencia',
    cuenta_destino: 'Caixabank',
    concepto: ''
  })
  
  // Cliente editable
  const grupo = clientes.find(c => c.id === expediente?.clienteId) || {
    id: null,
    nombre: expediente?.nombre_grupo || expediente?.clienteNombre || 'Sin nombre',
    responsable: expediente?.cliente_responsable || expediente?.responsable || 'Sin responsable',
    cif: '',
    movilResponsable: '',
    email: '',
    nSocios: '',
    poblacion: '',
    provincia: '',
    direccion: '',
  }
  
  const [clienteEditado, setClienteEditado] = useState(grupo)

  // ============ SISTEMA DE AVISOS DE INTEGRIDAD DE DATOS ============
  // Detección ampliada de campos críticos faltantes
  const datosClienteActuales = editandoCliente ? clienteEditado : grupo
  
  const camposFaltantes = useMemo(() => {
    const faltantes = []
    const datos = datosClienteActuales
    
    // Email
    if (!datos.email || String(datos.email).trim() === '' || datos.email === '-') {
      faltantes.push('Email')
    }
    
    // Teléfono
    const telefono = datos.telefono || datos.movil
    if (!telefono || String(telefono).trim() === '' || telefono === '-') {
      faltantes.push('Teléfono')
    }
    
    // Móvil
    const movil = datos.movilResponsable || datos.movil
    if (!movil || String(movil).trim() === '' || movil === '-') {
      faltantes.push('Móvil')
    }
    
    // Responsable
    if (!datos.responsable || String(datos.responsable).trim() === '' || datos.responsable === '-') {
      faltantes.push('Responsable')
    }
    
    // Dirección
    if (!datos.direccion || String(datos.direccion).trim() === '' || datos.direccion === '-') {
      faltantes.push('Dirección')
    }
    
    // Población
    if (!datos.poblacion || String(datos.poblacion).trim() === '' || datos.poblacion === '-') {
      faltantes.push('Población')
    }
    
    // Provincia
    if (!datos.provincia || String(datos.provincia).trim() === '' || datos.provincia === '-') {
      faltantes.push('Provincia')
    }
    
    return faltantes
  }, [datosClienteActuales, editandoCliente, clienteEditado, grupo])

  const hayCamposFaltantes = camposFaltantes.length > 0

  // Función helper para verificar si un campo específico está vacío
  const esCampoVacio = (campoKey) => {
    const datos = datosClienteActuales
    switch(campoKey) {
      case 'email':
        return !datos.email || String(datos.email).trim() === '' || datos.email === '-'
      case 'telefono':
        const tel = datos.telefono || datos.movil
        return !tel || String(tel).trim() === '' || tel === '-'
      case 'movil':
        const movil = datos.movilResponsable || datos.movil
        return !movil || String(movil).trim() === '' || movil === '-'
      case 'responsable':
        return !datos.responsable || String(datos.responsable).trim() === '' || datos.responsable === '-'
      case 'direccion':
        return !datos.direccion || String(datos.direccion).trim() === '' || datos.direccion === '-'
      case 'poblacion':
        return !datos.poblacion || String(datos.poblacion).trim() === '' || datos.poblacion === '-'
      case 'provincia':
        return !datos.provincia || String(datos.provincia).trim() === '' || datos.provincia === '-'
      case 'cif':
        const cif = datos.cif || datos.cif_nif
        return !cif || String(cif).trim() === '' || cif === '-'
      default:
        return false
    }
  }

  // ⚠️ BLINDAJE NIVEL 2: Cálculo seguro de pasajeros de pago
  const paxPago = Math.max(1, (parseInt(numTotalPasajeros) || 1) - (parseInt(numGratuidades) || 0))
  const totalPax = Math.max(1, parseInt(numTotalPasajeros) || 1)

  // Tabs
  const tabs = [
    { id: 'grupo', label: 'Ficha del Grupo', icon: Users },
    { id: 'cotizacion', label: 'Cotización', icon: Calculator },
    { id: 'pasajeros', label: 'Rooming List', icon: Bed },
    { id: 'cobros', label: 'Cobros y Pagos', icon: DollarSign },
    { id: 'documentacion', label: 'Documentación', icon: FileUp },
    { id: 'cierre', label: 'Cierre de Grupo', icon: TrendingUp },
  ]

  // ============ FUNCIONES DE PROVEEDORES ============
  
  // Mapeo consistente de tipos de servicio a tipos de proveedor
  // IMPORTANTE: Normaliza el tipo a minúsculas y sin tildes para coincidir con la DB estandarizada
  const mapearTipoServicioAProveedor = (tipoServicio) => {
    // Primero intentar mapeo directo para mantener compatibilidad
    const mapa = {
      'Hotel': 'hotel',
      'Restaurante': 'restaurante',
      'Autobús': 'autobus',
      'Guía': 'guia',
      'Guía Local': 'guialocal',
      'Entradas/Tickets': 'entradas',
      'Seguro': 'seguro',
      'Otros': 'otros'
    }
    
    // Si está en el mapa, usar el valor mapeado (ya normalizado)
    if (mapa[tipoServicio]) {
      return mapa[tipoServicio];
    }
    
    // Si no está en el mapa, normalizar directamente: minúsculas + sin tildes
    return normalizarTipo(tipoServicio);
  }
  
  // Función para abrir modal - SOLO abre el modal, NADA MÁS
  // NO hace insert, solo configura valores y abre modal
  const abrirModalProveedor = (inputValue, tipoServicioActual, servicioId) => {
    const nombreLimpio = inputValue?.trim() || ''
    const tipoProveedor = tipoServicioActual ? mapearTipoServicioAProveedor(tipoServicioActual) : 'hotel'

    setNombreNuevoProveedor(nombreLimpio)
    setTipoNuevoProveedor(tipoProveedor)
    setServicioIdParaProveedor(servicioId)
    setShowModal(true)
  }
  
  const obtenerProveedorPorId = (id) => {
    return proveedores.find(p => p.id === id)
  }
  
  // ============ FUNCIONES DE SERVICIOS ============
  
  const añadirServicio = () => {
    const nuevoServicio = {
      id: generarUUID(),
      proveedorId: null, // ID del proveedor seleccionado
      tipo: 'Hotel',
      nombreEspecifico: '', // Nombre libre (ej: "NH Ciudad de Valencia")
      localizacion: '', // Ubicación libre
      costeUnitario: 0, // Coste Real
      precioVenta: 0, // Precio Venta
      margen: 0, // Margen
      noches: 1,
      fechaRelease: '',
      tipoCalculo: 'porPersona', // 'porPersona' o 'porGrupo'
    }
    setServicios([...servicios, nuevoServicio])
  }

  const eliminarServicio = (id) => {
    const servicio = servicios.find(s => s.id === id)
    const nombre = servicio?.descripcion || servicio?.tipo || 'este servicio'
    
    if (window.confirm(`¿Está seguro de que desea eliminar el servicio "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
      setServicios(servicios.filter(s => s.id !== id))
    }
  }

  // ============ FUNCIÓN UNIVERSAL PARA CALCULAR TOTAL DE FILA ============
  // Fórmula obligatoria: cantidad × precio (siempre, sin excepciones)
  // Esta función se ejecuta en cada render para asegurar actualización en tiempo real
  const calcularTotalFila = (servicio) => {
    // Convertir precio a número (limpia cualquier formato)
    const precio = Number(servicio.costeUnitario) || 0
    
    // Determinar cantidad según el tipo de servicio
    let cantidad = 1
    if (servicio.tipo === 'Guía' || servicio.tipo === 'Hotel') {
      // Para Guías y Hoteles: usar el campo 'noches' como cantidad
      // Convertir a número explícitamente para evitar problemas con strings
      const cantidadRaw = servicio.noches
      cantidad = cantidadRaw !== null && cantidadRaw !== undefined && cantidadRaw !== '' 
        ? Number(cantidadRaw) 
        : 1
      // Asegurar que la cantidad sea al menos 1
      cantidad = Math.max(1, cantidad)
    }
    // Para otros servicios: cantidad = 1 (por defecto)
    
    // Fórmula universal: cantidad × precio (siempre, sin excepciones)
    const total = precio * cantidad
    
    // Retornar el total (puede ser 0 si el precio es 0)
    return isNaN(total) ? 0 : total
  }

  const actualizarServicio = (id, campo, valor) => {
    setServicios(servicios.map(s => 
      s.id === id ? { ...s, [campo]: valor } : s
    ))
  }

  // ============ CÁLCULOS DE COTIZACIÓN (BLINDADOS Y COMPLETOS) ============
  
  const calcularCotizacion = () => {
    try {
      // Valores seguros
      const bonif = Math.max(0, parseFloat(bonificacionPorPersona) || 0)
      
      // Variables de costes POR CATEGORÍA
      let costeBusPorPax = 0
      let costeGuiaPorPax = 0
      let costeGuiaLocalPorPax = 0
      let costeHotelPorPax = 0
      let costeSeguroPorPax = 0
      let costeEntradasPorPax = 0
      let costeRestaurantePorPax = 0
      let costeOtrosPorPax = 0
      
      // Calcular cada servicio con TIPO DE CÁLCULO FLEXIBLE
      servicios.forEach(servicio => {
        const coste = parseFloat(servicio.costeUnitario) || 0
        const noches = Math.max(0, parseInt(servicio.noches) || 0)
        const tipoCalculo = servicio.tipoCalculo || 'porPersona'
        
        if (servicio.tipo === 'Autobús') {
          // SIEMPRE: Autobús / Pasajeros de Pago
          costeBusPorPax += paxPago > 0 ? coste / paxPago : 0
          
        } else if (servicio.tipo === 'Guía') {
          // Total de la fila del guía = precio_unitario × cantidad (días)
          // Luego se divide entre pasajeros de pago para obtener el coste por persona
          const cantidadGuia = Math.max(1, noches)
          const totalFilaGuia = coste * cantidadGuia
          costeGuiaPorPax += paxPago > 0 ? totalFilaGuia / paxPago : 0
          
        } else if (servicio.tipo === 'Guía Local') {
          // NUEVO: Guía Local con dos opciones
          if (tipoCalculo === 'porGrupo') {
            // Opción A: Importe fijo dividido entre pasajeros de pago
            costeGuiaLocalPorPax += paxPago > 0 ? coste / paxPago : 0
          } else {
            // Opción B: Por persona (se suma directo)
            costeGuiaLocalPorPax += coste
          }
          
        } else if (servicio.tipo === 'Hotel') {
          // SIEMPRE: Precio por persona/noche × Noches
          costeHotelPorPax += coste * noches
          
        } else if (servicio.tipo === 'Seguro') {
          // SIEMPRE: Por persona
          costeSeguroPorPax += coste
          
        } else if (servicio.tipo === 'Entradas/Tickets') {
          // SIEMPRE: Por persona
          costeEntradasPorPax += coste
          
        } else if (servicio.tipo === 'Restaurante') {
          // NUEVO: Restaurantes con tipo de cálculo flexible
          if (tipoCalculo === 'porGrupo') {
            // Por grupo: dividir entre pasajeros de pago
            costeRestaurantePorPax += paxPago > 0 ? coste / paxPago : 0
          } else {
            // Por persona: sumar directo
            costeRestaurantePorPax += coste
          }
          
        } else if (servicio.tipo === 'Otros') {
          // NUEVO: Otros gastos con tipo de cálculo flexible
          if (tipoCalculo === 'porGrupo') {
            // Por grupo: dividir entre pasajeros de pago
            costeOtrosPorPax += paxPago > 0 ? coste / paxPago : 0
          } else {
            // Por persona: sumar directo
            costeOtrosPorPax += coste
          }
        }
      })
      
      // COSTE BASE TOTAL (sin gratuidades ni bonificación)
      const costeBasePorPersona = 
        costeBusPorPax +                    // Autobús (dividido)
        costeGuiaPorPax +                   // Guía (dividido por días)
        costeGuiaLocalPorPax +              // Guía Local (flexible)
        costeHotelPorPax +                  // Hotel (por noche)
        costeSeguroPorPax +                 // Seguro (por persona)
        costeEntradasPorPax +               // Entradas (por persona)
        costeRestaurantePorPax +            // Restaurantes (flexible)
        costeOtrosPorPax                    // Otros gastos (flexible)
      
      // CÁLCULO CORRECTO DE GRATUIDADES (Base Real Completa)
      // El coste de una gratuidad = TODO el coste base individual
      const costeBaseGratuidad = costeBasePorPersona // 327.76€ por ejemplo
      const costePlazasGratuitas = costeBaseGratuidad * (parseInt(numGratuidades) || 0)
      const costeGratuidadesPorPax = paxPago > 0 ? costePlazasGratuitas / paxPago : 0
      
      // COSTE REAL POR PERSONA (PAGADOR) = Base + Gratuidades + Bonificación
      const costeRealPorPersona = 
        costeBasePorPersona +               // Coste base de servicios
        costeGratuidadesPorPax +            // Prorrateo de gratuidades
        bonif                                // Bonificación
      
      // NUEVO MODELO DE NEGOCIO: PRECIO MANUAL + MARGEN INFORMATIVO
      const precioVentaPorPersona = Math.max(0, parseFloat(precioVentaManual) || 0)
      const costeTotalViaje = costeRealPorPersona * paxPago
      const precioVentaTotal = precioVentaPorPersona * paxPago
      
      // MARGEN INFORMATIVO: Diferencia entre precio venta y coste real
      const margenPorPersona = precioVentaPorPersona - costeRealPorPersona
      const beneficioTotal = margenPorPersona * paxPago
      const margenPorcentaje = costeRealPorPersona > 0 ? ((margenPorPersona / costeRealPorPersona) * 100) : 0
      
      const iva = beneficioTotal > 0 ? beneficioTotal * 0.21 : 0
      const beneficioNeto = beneficioTotal - iva
      
      return {
        // Gastos fijos (divididos entre pasajeros de pago)
        costeBusPorPax: costeBusPorPax.toFixed(2),
        costeGuiaPorPax: costeGuiaPorPax.toFixed(2),
        costeGuiaLocalPorPax: costeGuiaLocalPorPax.toFixed(2),
        
        // Servicios individuales (por persona)
        costeHotelPorPax: costeHotelPorPax.toFixed(2),
        costeSeguroPorPax: costeSeguroPorPax.toFixed(2),
        costeEntradasPorPax: costeEntradasPorPax.toFixed(2),
        
        // NUEVOS: Restaurantes y Otros
        costeRestaurantePorPax: costeRestaurantePorPax.toFixed(2),
        costeOtrosPorPax: costeOtrosPorPax.toFixed(2),
        
        // Totales auxiliares
        costeBasePorPersona: costeBasePorPersona.toFixed(2), // NUEVO: Base sin gratuidades ni bonificación
        costeBaseGratuidad: costeBaseGratuidad.toFixed(2),   // NUEVO: Valor de una gratuidad
        costePlazasGratuitas: costePlazasGratuitas.toFixed(2),
        costeGratuidadesPorPax: costeGratuidadesPorPax.toFixed(2),
        bonificacion: bonif.toFixed(2),
        
        // TOTALES PRINCIPALES (NUEVO MODELO)
        costeRealPorPersona: costeRealPorPersona.toFixed(2),
        costeTotalViaje: costeTotalViaje.toFixed(2),
        precioVentaPorPersona: precioVentaPorPersona.toFixed(2),
        precioVentaTotal: precioVentaTotal.toFixed(2),
        margenPorPersona: margenPorPersona.toFixed(2), // NUEVO: Margen informativo
        margenPorcentaje: margenPorcentaje.toFixed(2), // NUEVO: % informativo
        beneficioTotal: beneficioTotal.toFixed(2),
        iva: iva.toFixed(2),
        beneficioNeto: beneficioNeto.toFixed(2),
        
        // Info
        paxPagadores: paxPago,
        totalPasajeros: totalPax,
        gratuidades: parseInt(numGratuidades) || 0,
      }
    } catch (error) {
      return {
        costeBusPorPax: '0.00',
        costeGuiaPorPax: '0.00',
        costeGuiaLocalPorPax: '0.00',
        costeHotelPorPax: '0.00',
        costeSeguroPorPax: '0.00',
        costeEntradasPorPax: '0.00',
        costeRestaurantePorPax: '0.00',
        costeOtrosPorPax: '0.00',
        costeBasePorPersona: '0.00',
        costeBaseGratuidad: '0.00',
        costePlazasGratuitas: '0.00',
        costeGratuidadesPorPax: '0.00',
        bonificacion: '0.00',
        costeRealPorPersona: '0.00',
        costeTotalViaje: '0.00',
        precioVentaPorPersona: '0.00',
        precioVentaTotal: '0.00',
        margenPorPersona: '0.00',
        margenPorcentaje: '0.00',
        beneficioTotal: '0.00',
        iva: '0.00',
        beneficioNeto: '0.00',
        paxPagadores: 1,
        totalPasajeros: 1,
        gratuidades: 0,
      }
    }
  }
  
  // ⚡ REACTIVIDAD AUTOMÁTICA: Se recalcula cuando cambian los servicios o parámetros
  const resultados = useMemo(() => {
    return calcularCotizacion()
  }, [servicios, numTotalPasajeros, numGratuidades, bonificacionPorPersona, precioVentaManual])

  // ============ FUNCIÓN DE GUARDADO REESCRITA ============
  const guardarCotizacion = async () => {
    if (!window.confirm('¿Desea guardar los cambios en la cotización?')) {
      return
    }
    
    const expedienteId = expediente?.id
      if (!expedienteId) {
      alert('❌ Error: El expediente no tiene ID. No se puede guardar.')
        return
      }

    try {
      // ============ FUNCIÓN INTERNA DE LIMPIEZA ============
      const limpiarDatosNumericos = (valor) => {
        if (valor === null || valor === undefined || valor === '') return 0
        if (typeof valor === 'number') return isNaN(valor) ? 0 : valor
        const limpio = String(valor)
          .replace(/€/g, '')
          .replace(/pax/g, '')
          .replace(/\./g, '')
          .replace(/,/g, '.')
          .replace(/[^0-9.-]+/g, '')
          .trim()
        const resultado = parseFloat(limpio)
        return isNaN(resultado) ? 0 : resultado
      }

      const convertirFechaRelease = (fechaRelease) => {
        if (!fechaRelease || fechaRelease === '' || fechaRelease === null) return null
        if (typeof fechaRelease === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fechaRelease)) return fechaRelease
        if (fechaRelease instanceof Date) {
          if (isNaN(fechaRelease.getTime())) return null
          return fechaRelease.toISOString().split('T')[0]
        }
        try {
          const fechaISO = convertirEspañolAISO(String(fechaRelease))
          return fechaISO || null
        } catch (error) {
          return null
        }
      }

      const validarProveedorId = (valor) => {
        if (!valor || valor === null || valor === undefined) return null
        const idNum = typeof valor === 'string' ? Number(valor) : Number(valor)
        if (isNaN(idNum) || idNum <= 0) return null
        return idNum
      }

      // ============ PASO 1: GUARDAR EXPEDIENTE ============
      const totalPax = limpiarDatosNumericos(numTotalPasajeros)
      const paxPago = limpiarDatosNumericos(Number(numTotalPasajeros) - Number(numGratuidades))
      
      const datosExpediente = {
        precio_venta_cliente: limpiarDatosNumericos(precioVentaManual),
        total_pax: totalPax,
        gratuidades: limpiarDatosNumericos(numGratuidades),
        pax_pago: paxPago,
        bonificacion_pax: limpiarDatosNumericos(bonificacionPorPersona),
      }
      
      const { error: errorExpediente } = await supabase
        .from('expedientes')
        .update(datosExpediente)
        .eq('id', expedienteId)

      if (errorExpediente) {
        console.error('Error guardando expediente:', errorExpediente)
        alert(`❌ Error guardando expediente:\n\n${errorExpediente.message || JSON.stringify(errorExpediente)}`)
        return
      }

      // ============ PASO 2: GUARDAR SERVICIOS ============
      const expedienteIdParaInsert = String(expedienteId).trim()
      
      const serviciosParaGuardar = servicios.map(s => {
        const proveedorIdInt = validarProveedorId(s.proveedorId)
        const textoBusqueda = busquedaProveedor[s.id] ? String(busquedaProveedor[s.id]).trim() : ''
        
        // Determinar nombre del proveedor
        let nombreProveedorManual = null
        if (proveedorIdInt) {
          const proveedor = proveedores.find(p => Number(p.id) === proveedorIdInt)
          nombreProveedorManual = proveedor ? proveedor.nombreComercial : (textoBusqueda || null)
        } else if (textoBusqueda) {
          nombreProveedorManual = textoBusqueda
        }
        
        return {
          id: s.id || generarUUID(),
          id_expediente: expedienteIdParaInsert,
          proveedor_id_int: proveedorIdInt,
          nombre_proveedor_manual: nombreProveedorManual,
          tipo_servicio: String(s.tipo || '').trim(),
          nombre_especifico: String(s.nombreEspecifico || '').trim(),
          localizacion: String(s.localizacion || '').trim(),
          coste_unitario: limpiarDatosNumericos(s.costeUnitario),
          precio_venta: limpiarDatosNumericos(s.precioVenta),
          margen_pax: limpiarDatosNumericos(s.margen),
          pax_total: limpiarDatosNumericos(numTotalPasajeros),
          pax_pago: limpiarDatosNumericos(Number(numTotalPasajeros) - Number(numGratuidades)),
          pax_gratis: limpiarDatosNumericos(numGratuidades),
          noches: Number(s.noches) || 0,
          bonificacion_pax: limpiarDatosNumericos(bonificacionPorPersona),
          tipo_calculo: String(s.tipoCalculo || 'porPersona').trim(),
          fecha_release: convertirFechaRelease(s.fechaRelease),
        }
      })

      if (serviciosParaGuardar.length > 0) {
        const { error: errorUpsert } = await supabase
          .from('servicios_cotizacion')
          .upsert(serviciosParaGuardar, { onConflict: 'id' })

        if (errorUpsert) {
          console.error('Error guardando servicios:', errorUpsert)
          alert(`❌ Error guardando servicios:\n\n${errorUpsert.message || JSON.stringify(errorUpsert)}`)
          return
        }
      }

      // Actualizar expediente en memoria
      const expedienteActualizado = {
        ...expediente,
        total_pax: totalPax,
        pax_pago: paxPago,
    }
    onUpdate(expedienteActualizado)

      alert('¡Cotización sincronizada correctamente!')
      
    } catch (error) {
      console.error('Error inesperado:', error)
      alert(`❌ Error inesperado:\n\n${error.message || JSON.stringify(error)}`)
    }
  }

  // ============ GUARDAR HABITACIONES ============
  
  const guardarHabitaciones = () => {
    if (!window.confirm('¿Desea guardar los cambios en el rooming list?')) {
      return
    }
    
    const expedienteActualizado = {
      ...expediente,
      pasajeros: {
        ...expediente.pasajeros,
        habitaciones,
      },
      documentos,
    }
    onUpdate(expedienteActualizado)
  }

  // ============ EDITAR CLIENTE ============
  
  const iniciarEdicionCliente = () => {
    setClienteEditado({
      ...grupo,
      nombre: grupo.nombre || expediente?.nombre_grupo || '',
      responsable: grupo.responsable || expediente?.cliente_responsable || '',
    })
    setEditandoCliente(true)
  }

  const guardarCambiosCliente = () => {
    if (!window.confirm('¿Desea guardar los cambios del cliente?')) {
      return
    }
    
    // Actualizar en base de datos de clientes si existe ID
    if (expediente.clienteId) {
      const clientesActuales = storage.getClientes()
      const clientesActualizados = clientesActuales.map(c => 
        c.id === expediente.clienteId ? { ...c, ...clienteEditado } : c
      )
      storage.setClientes(clientesActualizados)
    }
    
    // Actualizar expediente
    const expedienteActualizado = {
      ...expediente,
      nombre_grupo: clienteEditado.nombre || '',
      cliente_responsable: clienteEditado.responsable || '',
      clienteNombre: clienteEditado.nombre || '',
      responsable: clienteEditado.responsable || '',
    }
    onUpdate(expedienteActualizado)
    setEditandoCliente(false)
  }

  const cancelarEdicionCliente = () => {
    setEditandoCliente(false)
    setClienteEditado(grupo)
  }

  // ============ DOCUMENTOS ============
  
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const nuevoDoc = {
        id: Date.now(),
        nombre: file.name,
        tipo: file.type,
        fecha: new Date().toISOString(),
      }
      setDocumentos([...documentos, nuevoDoc])
    }
  }

  const eliminarDocumento = (id) => {
    const doc = documentos.find(d => d.id === id)
    if (window.confirm(`¿Está seguro de que desea eliminar "${doc?.nombre || 'este documento'}"?\n\nEsta acción no se puede deshacer.`)) {
      setDocumentos(documentos.filter(d => d.id !== id))
    }
  }

  // ============ CALCULAR TOTALES DE HABITACIONES ============
  
  const totalHabitaciones = (habitaciones.dobles || 0) + (habitaciones.doblesTwin || 0) + (habitaciones.individuales || 0)
  const totalPasajerosHabitaciones = ((habitaciones.dobles || 0) * 2) + ((habitaciones.doblesTwin || 0) * 2) + (habitaciones.individuales || 0)

  // ============ RENDER PRINCIPAL (CON TRY/CATCH) ============
  
  try {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full h-[90vh] flex flex-col"
          style={{ backgroundColor: 'white', color: 'black' }}
        >
          
          {/* HEADER con JERARQUÍA VISUAL ESTRICTA */}
          <div className="px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
            <div className="flex justify-between items-start">
          <div>
                {/* REGLA: Nombre del Grupo = GRANDE Y NEGRITA */}
                <h1 className="text-3xl font-black text-navy-900 uppercase mb-1">
                  {expediente.nombre_grupo || expediente.clienteNombre || grupo.nombre || 'SIN NOMBRE DE GRUPO'}
                </h1>
                {/* Número de expediente en solo lectura */}
                {expediente.numero_expediente && (
                  <p className="text-xs font-mono text-gray-500 mb-1">
                    Nº Expediente: {expediente.numero_expediente}
                  </p>
                )}
                {/* REGLA: Responsable = PEQUEÑO DEBAJO */}
                <p className="text-sm text-gray-600 mb-2">
                  👤 {expediente.cliente_responsable || expediente.responsable || grupo.responsable || 'Sin Responsable'}
                </p>
                <p className="text-lg text-navy-600 font-medium">{expediente.destino || 'Sin destino'}</p>
          </div>
              <button 
                onClick={onClose} 
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
              >
            <X size={24} />
          </button>
            </div>
        </div>

          {/* TABS */}
          <div className="border-b border-gray-200 px-8 bg-white">
            <nav className="flex gap-2 -mb-px overflow-x-auto">
              {tabs.map(t => {
                const Icon = t.icon
                return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  tab === t.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                    <Icon size={18} />
                {t.label}
              </button>
                )
              })}
          </nav>
        </div>

          {/* CONTENIDO */}
          <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: 'white', color: 'black' }}>
            
            {/* TAB: Ficha del Grupo */}
            {tab === 'grupo' && (
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Contenedor principal */}
                <div 
                  style={{ 
                    background: 'white', 
                    padding: '32px', 
                    borderRadius: '24px', 
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)',
                    border: '1px solid #f1f5f9'
                  }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 rounded-full">
                      <Users className="text-blue-600" size={24} />
              </div>
                      <div>
                        <h3 className="text-2xl font-bold text-navy-900">Información del Grupo</h3>
                      <p className="text-gray-600 text-sm">Datos del cliente y responsable</p>
                      </div>
                    </div>
                    
                  {/* Banner de Aviso de Integridad de Datos */}
                  {hayCamposFaltantes && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-medium text-amber-800">
                        ⚠️ Faltan datos: {camposFaltantes.join(', ')}
                      </p>
                    </div>
                  )}
                    
                  {/* Rejilla limpia en secciones (Datos Fiscales, Contacto, Localización) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* === DATOS FISCALES / IDENTIFICACIÓN === */}
                    <div className="md:col-span-2">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-1">
                        Datos fiscales e identificación
                      </h4>
                      <p className="text-xs text-slate-400 mb-4">
                        Información básica del grupo o entidad responsable del viaje
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Nombre del Grupo *</label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.nombre || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, nombre: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.nombre || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        CIF
                        {esCampoVacio('cif') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.cif || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, cif: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('cif') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.cif || grupo.cif_nif || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      {/* Se mantiene lógica original, solo se añade agrupación visual */}
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Nº de Socios</label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.nSocios || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, nSocios: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.nSocios || '-'}
                        </div>
                      )}
                    </div>

                    {/* === CONTACTO PRINCIPAL === */}
                    <div className="md:col-span-2 pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-1 mt-4">
                        Contacto
                      </h4>
                      <p className="text-xs text-slate-400 mb-4">
                        Datos de la persona de contacto y canales de comunicación
                      </p>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Responsable
                        {esCampoVacio('responsable') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.responsable || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, responsable: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('responsable') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.responsable || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Móvil
                        {esCampoVacio('movil') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.movilResponsable || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, movilResponsable: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('movil') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.movilResponsable || grupo.movil || '-'}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Email
                        {esCampoVacio('email') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="email"
                          value={clienteEditado.email || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, email: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('email') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.email || '-'}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2">

                      {/* === LOCALIZACIÓN === */}
                      <div className="mb-1">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-1 mt-6">
                          Localización
                        </h4>
                        <p className="text-xs text-slate-400 mb-2">
                          Dirección postal para envíos, documentación y facturación
                        </p>
                      </div>

                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Dirección
                        {esCampoVacio('direccion') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.direccion || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, direccion: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('direccion') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.direccion || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Población
                        {esCampoVacio('poblacion') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.poblacion || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, poblacion: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('poblacion') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.poblacion || '-'} {grupo.provincia && `(${grupo.provincia})`}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Provincia
                        {esCampoVacio('provincia') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.provincia || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, provincia: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('provincia') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.provincia || '-'}
                        </div>
                      )}
                    </div>
                    </div>
                    
                  {/* Botón Editar Cliente abajo a la derecha */}
                  <div className="flex justify-end mt-6 pt-6 border-t" style={{ borderColor: '#f1f5f9' }}>
                    {!editandoCliente ? (
                      <button 
                        onClick={iniciarEdicionCliente} 
                        className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md"
                      >
                        Editar Cliente
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button 
                          onClick={cancelarEdicionCliente} 
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold transition-colors"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={guardarCambiosCliente} 
                          className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-2"
                        >
                          <Save size={18} />
                          Guardar Cambios
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* SECCIÓN: Fechas del Viaje (EDITABLE) */}
                <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl shadow-md p-8 border-2 border-blue-200 mt-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-600 rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-navy-900">Fechas del Viaje</h3>
                      <p className="text-gray-600">Define cuándo comienza y termina el viaje</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs mb-2" style={{ color: '#6B7280' }}>📅 Fecha de Inicio *</label>
                      <input
                        type="date"
                        value={convertirEspañolAISO(expediente.fechaInicio) || ''}
                        onChange={(e) => {
                          // Input type="date" devuelve YYYY-MM-DD
                          const fechaISO = e.target.value
                          
                          // Convertir a formato español DD/MM/AAAA para guardar
                          const fechaEspañola = convertirISOAEspañol(fechaISO)
                          
                          const expedienteActualizado = { 
                            ...expediente, 
                            fechaInicio: fechaEspañola // Guardar en formato español
                          }
                          onUpdate(expedienteActualizado)
                        }}
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        className="w-full p-4 text-lg transition-all"
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        ⚡ Esta fecha determina el orden y el ejercicio (año) del expediente
                      </p>
                      {expediente.fechaInicio && (
                        <p className="text-xs text-blue-600 mt-1">
                          📅 Guardada como: {expediente.fechaInicio}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-2" style={{ color: '#6B7280' }}>📅 Fecha de Fin</label>
                      <input
                        type="date"
                        value={convertirEspañolAISO(expediente.fechaFin) || ''}
                        onChange={(e) => {
                          // Input type="date" devuelve YYYY-MM-DD
                          const fechaISO = e.target.value
                          
                          // Convertir a formato español DD/MM/AAAA para guardar
                          const fechaEspañola = convertirISOAEspañol(fechaISO)
                          
                          const expedienteActualizado = { 
                            ...expediente, 
                            fechaFin: fechaEspañola // Guardar en formato español
                          }
                          onUpdate(expedienteActualizado)
                        }}
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        className="w-full p-4 text-lg transition-all"
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        📆 Fecha de regreso o finalización del viaje
                      </p>
                      {expediente.fechaFin && (
                        <p className="text-xs text-blue-600 mt-1">
                          📅 Guardada como: {expediente.fechaFin}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {expediente.fechaInicio && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-blue-200">
                      <p className="text-sm text-gray-700">
                        <strong className="text-navy-900">Duración calculada:</strong> {
                          expediente.fechaFin && expediente.fechaInicio ? 
                          (() => {
                            const inicio = new Date(expediente.fechaInicio)
                            const fin = new Date(expediente.fechaFin)
                            const dias = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24))
                            return dias > 0 ? `${dias} día${dias !== 1 ? 's' : ''}` : 'Fechas incorrectas'
                          })() 
                          : 'Falta fecha de fin'
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: Cotización */}
          {tab === 'cotizacion' && (
              <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Parámetros Principales */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Parámetros del Viaje</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <label className="label">Total Pasajeros *</label>
                      <input
                        type="number"
                        value={numTotalPasajeros}
                        onChange={(e) => setNumTotalPasajeros(e.target.value)}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        min="1"
                        tabIndex="1"
                      />
            </div>
                    <div>
                      <label className="label">Gratuidades</label>
                      <input
                        type="number"
                        value={numGratuidades}
                        onChange={(e) => setNumGratuidades(e.target.value)}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        min="0"
                        tabIndex="2"
                      />
                    </div>
                    <div>
                      <label className="label">Bonificación/Pax (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={bonificacionPorPersona || ''}
                        onChange={(e) => {
                          const valorInput = e.target.value;
                          // Si está vacío, permitir edición
                          if (valorInput === '' || valorInput === '-') {
                            setBonificacionPorPersona('');
                            return;
                          }
                          // Convertir coma a punto (formato europeo -> americano)
                          let valorLimpio = valorInput.replace(/,/g, '.');
                          // Parsear a float para preservar decimales
                          const valorNumerico = parseFloat(valorLimpio);
                          if (!isNaN(valorNumerico)) {
                            setBonificacionPorPersona(valorNumerico);
                          } else {
                            // Permitir edición parcial
                            setBonificacionPorPersona(valorLimpio);
                          }
                        }}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          // Al perder el foco, asegurar que el valor sea un número válido
                          const valor = e.target.value;
                          if (valor !== '' && valor !== '-') {
                            const valorLimpio = valor.replace(/,/g, '.');
                            const valorNumerico = parseFloat(valorLimpio);
                            if (!isNaN(valorNumerico)) {
                              setBonificacionPorPersona(valorNumerico);
                            } else {
                              setBonificacionPorPersona(0);
                            }
                          } else {
                            setBonificacionPorPersona(0);
                          }
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        placeholder="0.00"
                        min="0"
                        tabIndex="4"
                      />
                    </div>
                    <div>
                      <label className="label font-bold text-green-700">💰 Precio Venta al Cliente (€/pax) *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={precioVentaManual || ''}
                        onChange={(e) => {
                          const valorInput = e.target.value;
                          // Si está vacío, permitir edición
                          if (valorInput === '' || valorInput === '-') {
                            setPrecioVentaManual('');
                            return;
                          }
                          // Convertir coma a punto (formato europeo -> americano)
                          let valorLimpio = valorInput.replace(/,/g, '.');
                          // Parsear a float para preservar decimales
                          const valorNumerico = parseFloat(valorLimpio);
                          if (!isNaN(valorNumerico)) {
                            setPrecioVentaManual(valorNumerico);
                          } else {
                            // Permitir edición parcial
                            setPrecioVentaManual(valorLimpio);
                          }
                        }}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          // Al perder el foco, asegurar que el valor sea un número válido
                          const valor = e.target.value;
                          if (valor !== '' && valor !== '-') {
                            const valorLimpio = valor.replace(/,/g, '.');
                            const valorNumerico = parseFloat(valorLimpio);
                            if (!isNaN(valorNumerico)) {
                              setPrecioVentaManual(valorNumerico);
                            } else {
                              setPrecioVentaManual(0);
                            }
                          } else {
                            setPrecioVentaManual(0);
                          }
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all font-bold text-lg"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        placeholder="Ej: 380.00"
                        min="0"
                        tabIndex="5"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900">
                      📊 Pasajeros de Pago: <span className="text-2xl">{paxPago}</span> 
                      <span className="text-xs ml-2 text-blue-600">({totalPax} total - {numGratuidades || 0} gratis)</span>
                    </p>
                  </div>
                </div>

                {/* Tabla de Servicios */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-navy-900">Servicios del Viaje</h3>
                  </div>
                  
                  {servicios.length === 0 ? (
                    <div className="space-y-4">
                      <p className="text-center text-gray-500 py-8">No hay servicios añadidos</p>
                      <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2">
                        <Plus size={20} />
                        Añadir Primer Servicio
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Proveedor</th>
                            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Servicio</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Cantidad</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Precio</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Modo</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Total (€)</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Release</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {servicios.map(servicio => (
                            <tr key={servicio.id} className="border-t border-gray-200 hover:bg-gray-50">
                              {/* COLUMNA 1: PROVEEDOR CON BÚSQUEDA */}
                              <td className="px-2 py-2">
                                <div className="relative">
                                <div className="flex gap-1 items-center">
                                  <div className="relative flex-1">
                                    {/* Input de búsqueda - SOLO búsqueda, NO crea nada */}
                                    <input
                                      type="text"
                                      value={
                                        busquedaProveedor[servicio.id] !== undefined
                                          ? busquedaProveedor[servicio.id]
                                          : (obtenerProveedorPorId(servicio.proveedorId)?.nombreComercial || '')
                                      }
                                      onChange={(e) => {
                                        const inputValue = e.target.value
                                        setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: inputValue })
                                        setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                      }}
                                      onFocus={(e) => {
                                        // ============ COMBOBOX: MOSTRAR TODOS AL HACER CLIC ============
                                        setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                        // Si no hay búsqueda, limpiar para mostrar todos los proveedores del tipo
                                        if (!busquedaProveedor[servicio.id]) {
                                          setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                        }
                                        // Estilo de foco
                                        e.target.style.borderColor = '#3b82f6'
                                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                      }}
                                      placeholder="Buscar proveedor..."
                                        className="input-field text-xs w-full pr-8 transition-all"
                                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                        onBlur={(e) => {
                                          e.target.style.borderColor = '#e2e8f0'
                                          e.target.style.boxShadow = 'none'
                                        }}
                                    />
                                    
                                    {/* Botón limpiar */}
                                    {(busquedaProveedor[servicio.id] || servicio.proveedorId) && (
                                      <button
                                        onClick={() => {
                                          setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                          actualizarServicio(servicio.id, 'proveedorId', null)
                                          setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false })
                                        }}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                                        title="Limpiar"
                                      >
                                        <X size={14} />
                                      </button>
                                    )}
                                  </div>
                                  
                                  {/* Botón '+' independiente para abrir modal completo */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Abrir modal completo - NO crea nada, solo abre el modal
                                      abrirModalProveedor(
                                        busquedaProveedor[servicio.id] || '',
                                        servicio.tipo,
                                        servicio.id
                                      )
                                    }}
                                    className="flex-shrink-0 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-colors"
                                    title="Añadir nuevo proveedor"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                                  
                                  {/* Lista de sugerencias - POSICIONAMIENTO ABSOLUTO CORRECTO */}
                                  {mostrarSugerencias[servicio.id] && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                      {(() => {
                                        const tipoProveedorBuscado = mapearTipoServicioAProveedor(servicio.tipo)
                                        const textoBusqueda = (busquedaProveedor[servicio.id] || '').toLowerCase().trim()
                                        
                                        console.log('🔍 Filtrado de proveedores:', {
                                          totalProveedores: proveedores.length,
                                          tipoServicio: servicio.tipo,
                                          tipoProveedorBuscado,
                                          textoBusqueda
                                        })
                                        
                                        // ============ COMBOBOX: MOSTRAR TODOS O FILTRADOS ============
                                        // COMPARACIÓN ROBUSTA: Normalizar ambos lados para evitar problemas de formato
                                        const proveedoresFiltrados = proveedores
                                          .filter(p => {
                                            // Normalizar ambos tipos para comparación robusta
                                            const tipoProveedorNormalizado = normalizarText(p.tipo || '');
                                            const tipoBuscadoNormalizado = normalizarText(tipoProveedorBuscado || '');
                                            
                                            const coincideTipo = tipoProveedorNormalizado === tipoBuscadoNormalizado
                                            
                                            console.log('🔍 Comparando tipos:', {
                                              proveedor: p.nombreComercial,
                                              tipoProveedor: p.tipo,
                                              tipoProveedorNormalizado,
                                              tipoBuscadoNormalizado,
                                              coincideTipo
                                            })
                                            
                                            // Si no hay búsqueda de texto, mostrar todos del tipo
                                            if (!textoBusqueda) {
                                              return coincideTipo
                                            }
                                            
                                            // Si hay búsqueda, filtrar por nombre Y tipo
                                            const coincideNombre = (p.nombreComercial || '').toLowerCase().includes(textoBusqueda)
                                            return coincideTipo && coincideNombre
                                          })
                                          .sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || ''))
                                        
                                        console.log('✅ Proveedores filtrados:', proveedoresFiltrados.length, proveedoresFiltrados.map(p => p.nombreComercial))
                                        
                                        return (
                                          <>
                                            {/* Mensajes según estado */}
                                            {proveedoresFiltrados.length === 0 && !textoBusqueda && (
                                              <div className="px-3 py-3 text-xs text-center">
                                                <p className="text-gray-600 mb-2">
                                                  No hay proveedores de <strong>{servicio.tipo}</strong>
                                                </p>
                                                <p className="text-green-600 font-medium">
                                                  💡 Usa el botón + para añadir uno nuevo
                                                </p>
                                              </div>
                                            )}
                                            
                                            {/* Mensaje si hay búsqueda sin resultados */}
                                            {proveedoresFiltrados.length === 0 && textoBusqueda && (
                                              <div className="px-3 py-3 text-xs text-center">
                                                <p className="text-gray-600 mb-2">
                                                  No se encontró "{busquedaProveedor[servicio.id]}" en {servicio.tipo}
                                                </p>
                                                <p className="text-green-600 font-medium">
                                                  ➕ Usa el botón + para crear nuevo proveedor
                                                </p>
                                              </div>
                                            )}
                                            
                                            {/* Lista de proveedores existentes - SOLO selección, NO creación */}
                                            {proveedoresFiltrados.length > 0 && (
                                              <div className="py-1">
                                            {proveedoresFiltrados.map(proveedor => (
                                              <button
                                                key={proveedor.id}
                                                    type="button"
                                                onClick={() => {
                                                      console.log('✅ Seleccionando proveedor:', proveedor)
                                                  actualizarServicio(servicio.id, 'proveedorId', proveedor.id)
                                                  setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: proveedor.nombreComercial })
                                                  setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false })
                                                }}
                                                    className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                                              >
                                                <span className="font-medium text-navy-900">{proveedor.nombreComercial}</span>
                                                {proveedor.telefono && (
                                                  <span className="text-gray-500">· {proveedor.telefono}</span>
                                                )}
                                              </button>
                                            ))}
                                              </div>
                                            )}
                                          </>
                                        )
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </td>
                              
                              {/* COLUMNA 2: SERVICIO (TIPO) */}
                              <td className="px-2 py-2">
                                <select
                                  value={servicio.tipo}
                                  onChange={(e) => {
                                    const nuevoTipo = e.target.value
                                    actualizarServicio(servicio.id, 'tipo', nuevoTipo)
                                    // Limpiar proveedor si cambia el tipo (porque el tipo debe coincidir)
                                    if (servicio.proveedorId) {
                                      const proveedorActual = obtenerProveedorPorId(servicio.proveedorId)
                                      const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                                      const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                                      
                                      // Si el tipo del proveedor no coincide con el nuevo tipo, limpiar
                                      if (tipoProveedorActual !== nuevoTipoProveedor) {
                                        actualizarServicio(servicio.id, 'proveedorId', null)
                                        setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                      }
                                    }
                                    // Mostrar sugerencias para el nuevo tipo
                                    setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                  }}
                                  className="input-field text-xs w-full transition-all"
                                  style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                  }}
                                >
                                  <option>Hotel</option>
                                  <option>Restaurante</option>
                                  <option>Autobús</option>
                                  <option>Guía</option>
                                  <option>Guía Local</option>
                                  <option>Entradas/Tickets</option>
                                  <option>Seguro</option>
                                  <option>Otros</option>
                                </select>
                              </td>
                              
                              {/* COLUMNA 3: CANTIDAD (Noches para Hotel, Días para Guía, 1 para otros) */}
                              <td className="px-2 py-2 text-center">
                                {servicio.tipo === 'Hotel' || servicio.tipo === 'Guía' ? (
                                <input
                                    type="number"
                                    value={servicio.noches || 1}
                                    onChange={(e) => {
                                      const valor = e.target.value
                                      // Convertir a número para asegurar consistencia
                                      const valorNumerico = valor === '' ? 1 : Number(valor) || 1
                                      actualizarServicio(servicio.id, 'noches', Math.max(1, valorNumerico))
                                    }}
                                    onFocus={(e) => {
                                      handleFocus(e)
                                      e.target.style.borderColor = '#3b82f6'
                                      e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                    }}
                                    onBlur={(e) => {
                                      e.target.style.borderColor = '#e2e8f0'
                                      e.target.style.boxShadow = 'none'
                                    }}
                                    onWheel={handleWheel}
                                    className="input-field text-xs text-center w-20 transition-all"
                                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                    min="1"
                                    placeholder="1"
                                  />
                                ) : (
                                  <span className="text-gray-600 text-xs font-medium">1</span>
                                )}
                              </td>
                              
                              {/* COLUMNA 4: PRECIO */}
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={servicio.costeUnitario || ''}
                                  onChange={(e) => {
                                    // Preservar decimales: usar parseFloat directamente para inputs numéricos
                                    const valorInput = e.target.value;
                                    
                                    // Si está vacío, permitir edición
                                    if (valorInput === '' || valorInput === '-') {
                                      actualizarServicio(servicio.id, 'costeUnitario', '');
                                      return;
                                    }
                                    
                                    // Convertir coma a punto (formato europeo -> americano)
                                    let valorLimpio = valorInput.replace(/,/g, '.');
                                    
                                    // Parsear a float para preservar decimales
                                    const valorNumerico = parseFloat(valorLimpio);
                                    
                                    // Si es un número válido, actualizar; si no, mantener el string para permitir edición
                                    if (!isNaN(valorNumerico)) {
                                      actualizarServicio(servicio.id, 'costeUnitario', valorNumerico);
                                    } else {
                                      // Permitir edición parcial (ej: usuario escribiendo "66.")
                                      actualizarServicio(servicio.id, 'costeUnitario', valorLimpio);
                                    }
                                  }}
                                  onFocus={(e) => {
                                    handleFocus(e)
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    // Al perder el foco, asegurar que el valor sea un número válido
                                    const valor = e.target.value;
                                    if (valor !== '' && valor !== '-') {
                                      const valorLimpio = valor.replace(/,/g, '.');
                                      const valorNumerico = parseFloat(valorLimpio);
                                      if (!isNaN(valorNumerico)) {
                                        actualizarServicio(servicio.id, 'costeUnitario', valorNumerico);
                                      } else {
                                        actualizarServicio(servicio.id, 'costeUnitario', 0);
                                      }
                                    } else {
                                      actualizarServicio(servicio.id, 'costeUnitario', 0);
                                    }
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                  }}
                                  onWheel={handleWheel}
                                  className="input-field text-xs text-right w-28 transition-all"
                                  style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                  placeholder="0.00"
                                  min="0"
                                />
                              </td>

                              {/* COLUMNA 5: MODO DE PRECIO (Precio por Persona / Total a dividir) */}
                              <td className="px-2 py-2 text-center">
                                <select
                                  value={servicio.tipoCalculo || 'porPersona'}
                                  onChange={(e) => actualizarServicio(servicio.id, 'tipoCalculo', e.target.value)}
                                  className="input-field text-[10px] w-full transition-all"
                                  style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                  }}
                                >
                                  <option value="porPersona">Precio por Persona</option>
                                  <option value="porGrupo">Total a dividir</option>
                                </select>
                              </td>
                              
                              {/* COLUMNA 6: TOTAL (Calculado con función clara) */}
                              <td className="px-2 py-2 text-center">
                                <span className="text-gray-900 text-sm font-semibold">
                                  {calcularTotalFila(servicio).toFixed(2)}€
                                </span>
                              </td>
                              
                              {/* COLUMNA 7: RELEASE (Fecha de liberación) */}
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="date"
                                  value={servicio.fechaRelease || ''}
                                  onChange={(e) => {
                                    const fechaValue = e.target.value || ''
                                    actualizarServicio(servicio.id, 'fechaRelease', fechaValue)
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                  }}
                                  className="input-field text-xs text-center transition-all"
                                  style={{ 
                                    backgroundColor: '#f8fafc', 
                                    color: '#0f172a', 
                                    borderRadius: '12px', 
                                    border: '1px solid #e2e8f0',
                                    padding: '6px 8px',
                                    width: '100%',
                                    maxWidth: '140px'
                                  }}
                                />
                              </td>
                              
                              {/* COLUMNA 8: ACCIONES */}
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => eliminarServicio(servicio.id)}
                                  className="text-red-600 hover:text-red-900 p-1"
                                  title="Eliminar"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      {/* Botón Añadir Servicio al final */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2">
                          <Plus size={20} />
                          Añadir Servicio
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Resultados de la Cotización */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Resumen Financiero</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-xs text-blue-700 font-semibold uppercase mb-1">🚌 Autobús/Pax</p>
                      <p className="text-2xl font-bold text-blue-900">{resultados.costeBusPorPax}€</p>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-xs text-blue-700 font-semibold uppercase mb-1">👤 Guía/Pax</p>
                      <p className="text-2xl font-bold text-blue-900">{resultados.costeGuiaPorPax}€</p>
                    </div>
                    
                    {parseFloat(resultados.costeGuiaLocalPorPax) > 0 && (
                      <div className="bg-teal-50 p-4 rounded-lg">
                        <p className="text-xs text-teal-700 font-semibold uppercase mb-1">🗺️ Guía Local/Pax</p>
                        <p className="text-2xl font-bold text-teal-900">{resultados.costeGuiaLocalPorPax}€</p>
                      </div>
                    )}
                    
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-xs text-purple-700 font-semibold uppercase mb-1">🏨 Hotel/Pax</p>
                      <p className="text-2xl font-bold text-purple-900">{resultados.costeHotelPorPax}€</p>
                    </div>
                    
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-xs text-purple-700 font-semibold uppercase mb-1">🛡️ Seguro/Pax</p>
                      <p className="text-2xl font-bold text-purple-900">{resultados.costeSeguroPorPax}€</p>
                    </div>
                    
                    {parseFloat(resultados.costeEntradasPorPax) > 0 && (
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-xs text-purple-700 font-semibold uppercase mb-1">🎫 Entradas/Pax</p>
                        <p className="text-2xl font-bold text-purple-900">{resultados.costeEntradasPorPax}€</p>
                      </div>
                    )}
                    
                    {parseFloat(resultados.costeRestaurantePorPax) > 0 && (
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-xs text-amber-700 font-semibold uppercase mb-1">🍽️ Restaurantes/Pax</p>
                        <p className="text-2xl font-bold text-amber-900">{resultados.costeRestaurantePorPax}€</p>
                      </div>
                    )}
                    
                    {parseFloat(resultados.costeOtrosPorPax) > 0 && (
                      <div className="bg-gray-100 p-4 rounded-lg">
                        <p className="text-xs text-gray-700 font-semibold uppercase mb-1">📦 Otros Gastos/Pax</p>
                        <p className="text-2xl font-bold text-gray-900">{resultados.costeOtrosPorPax}€</p>
            </div>
          )}

                    {parseInt(numGratuidades || 0) > 0 && (
                      <div className="bg-orange-50 p-4 rounded-lg md:col-span-2 border-2 border-orange-300">
                        <p className="text-xs text-orange-700 font-semibold uppercase mb-1">🎁 Prorrateo Gratuidades/Pax</p>
                        <p className="text-sm text-orange-600 mb-1">
                          {resultados.gratuidades} plazas × {resultados.costeBaseGratuidad}€ = {resultados.costePlazasGratuitas}€ total
                        </p>
                        <p className="text-2xl font-bold text-orange-900">+{resultados.costeGratuidadesPorPax}€/pax</p>
            </div>
          )}

                    {parseFloat(bonificacionPorPersona || 0) > 0 && (
                      <div className="bg-yellow-50 p-4 rounded-lg md:col-span-2 border-2 border-yellow-300">
                        <p className="text-xs text-yellow-700 font-semibold uppercase mb-1">💳 Bonificación Pactada</p>
                        <p className="text-2xl font-bold text-yellow-900">+{resultados.bonificacion}€/pax</p>
                      </div>
                    )}
                  </div>
                  
                  {/* DESGLOSE CLARO: Base + Gratuidades + Bonificación = Total */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-blue-300 mt-6">
                    <h4 className="text-lg font-bold text-navy-900 mb-4">📊 Desglose del Coste Real</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-2 border-b border-blue-200">
                        <span className="text-blue-700 font-medium">🚌 Coste Base Servicios (por persona)</span>
                        <span className="font-bold text-blue-900">{resultados.costeBasePorPersona}€</span>
                      </div>
                      {parseInt(numGratuidades || 0) > 0 && (
                        <div className="flex justify-between py-2 border-b border-blue-200">
                          <span className="text-orange-700 font-medium">➕ Prorrateo Gratuidades ({numGratuidades} × {resultados.costeBaseGratuidad}€)</span>
                          <span className="font-bold text-orange-900">+{resultados.costeGratuidadesPorPax}€</span>
                        </div>
                      )}
                      {parseFloat(bonificacionPorPersona || 0) > 0 && (
                        <div className="flex justify-between py-2 border-b border-blue-200">
                          <span className="text-yellow-700 font-medium">➕ Bonificación Pactada</span>
                          <span className="font-bold text-yellow-900">+{resultados.bonificacion}€</span>
                        </div>
                      )}
                      <div className="flex justify-between py-3 bg-red-100 rounded-lg px-4 mt-3 border-2 border-red-400">
                        <span className="text-base font-black text-red-900 uppercase">= Coste Real por Persona</span>
                        <span className="text-3xl font-black text-red-900">{resultados.costeRealPorPersona}€</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* RESUMEN COMERCIAL - NUEVO MODELO (SIEMPRE VISIBLE) */}
                  <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-md mt-6">
                    <h4 className="text-lg font-bold text-navy-900 mb-4">💼 Resumen Comercial</h4>
                    
                    {/* Mensaje informativo si no hay servicios */}
                    {servicios.length === 0 && (
                      <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          ℹ️ <strong>Expediente nuevo:</strong> Añade servicios para ver los costes calculados automáticamente.
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. COSTE REAL - Azul Suave */}
                      <div className="bg-blue-50 p-5 rounded-lg border-2 border-blue-200">
                        <p className="text-xs text-blue-700 font-semibold uppercase mb-1">📊 Coste Real/Pax</p>
                        <p className="text-3xl font-black text-blue-900">{resultados.costeRealPorPersona}€</p>
                        <p className="text-xs text-blue-600 mt-1">Total: {resultados.costeTotalViaje}€</p>
                      </div>
                      
                      {/* 2. PRECIO VENTA - Verde Destacado */}
                      <div className="bg-green-50 p-5 rounded-lg border-2 border-green-400 shadow-lg">
                        <p className="text-xs text-green-700 font-bold uppercase mb-1">💰 Precio Venta/Pax</p>
                        <p className="text-3xl font-black text-green-900">{resultados.precioVentaPorPersona}€</p>
                        <p className="text-xs text-green-600 mt-1">Total: {resultados.precioVentaTotal}€</p>
                      </div>
                      
                      {/* 3. MARGEN - Verde si positivo, Rojo si negativo */}
                      <div className={`p-5 rounded-lg border-2 ${parseFloat(resultados.margenPorPersona) >= 0 ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
                        <p className={`text-xs font-bold uppercase mb-1 ${parseFloat(resultados.margenPorPersona) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {parseFloat(resultados.margenPorPersona) >= 0 ? '📈 Margen/Pax' : '⚠️ Pérdida/Pax'}
                        </p>
                        <p className={`text-3xl font-black ${parseFloat(resultados.margenPorPersona) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          {parseFloat(resultados.margenPorPersona) >= 0 ? '+' : ''}{resultados.margenPorPersona}€
                        </p>
                        <p className={`text-xs mt-1 ${parseFloat(resultados.margenPorPersona) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {resultados.margenPorcentaje}% · Total: {resultados.beneficioTotal}€
                        </p>
                      </div>
                    </div>
                    
                    {/* Beneficio Total del Viaje */}
                    <div className={`mt-4 p-4 rounded-lg ${parseFloat(resultados.beneficioTotal) >= 0 ? 'bg-gradient-to-r from-green-100 to-emerald-100' : 'bg-gradient-to-r from-red-100 to-orange-100'}`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-base font-bold ${parseFloat(resultados.beneficioTotal) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          💼 Beneficio Total del Viaje ({resultados.paxPagadores} pax de pago):
                        </span>
                        <span className={`text-2xl font-black ${parseFloat(resultados.beneficioTotal) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          {parseFloat(resultados.beneficioTotal) >= 0 ? '+' : ''}{resultados.beneficioTotal}€
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <button onClick={guardarCotizacion} className="btn-primary w-full flex items-center justify-center gap-2">
                      <Save size={20} />
                      Guardar Cotización
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Rooming List */}
          {tab === 'pasajeros' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Desglose de Habitaciones</h3>
                  
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="label">Dobles</label>
                      <input
                        type="number"
                        value={habitaciones.dobles}
                        onChange={(e) => setHabitaciones({ ...habitaciones, dobles: parseInt(e.target.value) || 0 })}
                        className="input-field"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="label">Dobles Twin</label>
                      <input
                        type="number"
                        value={habitaciones.doblesTwin}
                        onChange={(e) => setHabitaciones({ ...habitaciones, doblesTwin: parseInt(e.target.value) || 0 })}
                        className="input-field"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="label">Individuales</label>
                      <input
                        type="number"
                        value={habitaciones.individuales}
                        onChange={(e) => setHabitaciones({ ...habitaciones, individuales: parseInt(e.target.value) || 0 })}
                        className="input-field"
                        min="0"
                      />
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900">
                      🏨 Total Habitaciones: <span className="text-2xl">{totalHabitaciones}</span>
                      <span className="mx-4">|</span>
                      👥 Total Pasajeros: <span className="text-2xl">{totalPasajerosHabitaciones}</span>
                    </p>
                  </div>
                </div>
                
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Documentos</h3>
                  
                  <div className="mb-4">
                    <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                      <Upload size={20} />
                      Subir Documento
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                      />
                    </label>
                  </div>
                  
                  {documentos.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No hay documentos adjuntos</p>
                  ) : (
                    <div className="space-y-2">
                      {documentos.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileUp className="text-blue-600" size={20} />
                            <div>
                              <p className="font-medium text-gray-900">{doc.nombre}</p>
                              <p className="text-xs text-gray-500">{new Date(doc.fecha).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => eliminarDocumento(doc.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
            </div>
          )}
                </div>
                
                <button onClick={guardarHabitaciones} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Save size={20} />
                  Guardar Rooming List
                </button>
            </div>
          )}

            {/* TAB: Cobros y Pagos */}
          {tab === 'cobros' && (
              <div className="max-w-6xl mx-auto space-y-6">
                {/* Header con botón de registro */}
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-navy-900">Gestión de Cobros</h3>
                  <button
                    onClick={() => {
                      setCobroEnEdicionId(null)
                      setFormCobro({
                        importe: '',
                        metodo_pago: 'Transferencia',
                        cuenta_destino: 'Caixabank',
                        concepto: ''
                      })
                      setShowModalCobro(true)
                    }}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={20} />
                    Registrar Nuevo Cobro
                  </button>
                </div>

                {/* Resumen de Totales */}
                {cobros.length > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-md p-6 border border-blue-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-1">Total Cobrado</p>
                        <p className="text-3xl font-bold text-navy-900">
                          {cobros.reduce((sum, c) => sum + Number(c.importe || 0), 0).toFixed(2)}€
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-1">Número de Cobros</p>
                        <p className="text-3xl font-bold text-blue-600">{cobros.length}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-1">Último Cobro</p>
                        <p className="text-lg font-semibold text-gray-800">
                          {cobros[0]?.fecha 
                            ? new Date(cobros[0].fecha).toLocaleDateString('es-ES', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                              })
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabla de Historial de Cobros */}
                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Fecha</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Importe</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Método de Pago</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cuenta Destino</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Concepto</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cobros.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="text-center py-8 text-gray-500">
                              No hay cobros registrados para este expediente
                            </td>
                          </tr>
                        ) : (
                          cobros.map((cobro) => {
                            const fechaCobro = cobro.fecha ? new Date(cobro.fecha) : null
                            const fechaFormateada = fechaCobro 
                              ? fechaCobro.toLocaleDateString('es-ES', { 
                                  day: '2-digit', 
                                  month: '2-digit', 
                                  year: 'numeric' 
                                })
                              : '-'
                            
                            return (
                              <tr key={cobro.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                <td className="py-3 px-4 text-sm">{fechaFormateada}</td>
                                <td className="py-3 px-4 text-sm font-semibold text-navy-900">
                                  {Number(cobro.importe || 0).toFixed(2)}€
                                </td>
                                <td className="py-3 px-4 text-sm">{cobro.metodo_pago || '-'}</td>
                                <td className="py-3 px-4 text-sm">{cobro.cuenta_destino || '-'}</td>
                                <td className="py-3 px-4 text-sm">{cobro.concepto || '-'}</td>
                                <td className="py-3 px-4 text-sm">
                                  <div className="flex items-center gap-3">
                                    <button
                                      onClick={() => {
                                        setCobroEnEdicionId(cobro.id)
                                        setFormCobro({
                                          importe: Number(cobro.importe || 0).toFixed(2),
                                          metodo_pago: cobro.metodo_pago || 'Transferencia',
                                          cuenta_destino: cobro.cuenta_destino || 'Caixabank',
                                          concepto: cobro.concepto || ''
                                        })
                                        setShowModalCobro(true)
                                      }}
                                      className="text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1"
                                      title="Editar cobro"
                                    >
                                      <Pencil size={16} />
                                      <span className="text-xs">Editar</span>
                                    </button>
                                    <button
                                      onClick={() => generarReciboPDF(cobro)}
                                      className="text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                                      title="Generar PDF del recibo"
                                    >
                                      <FileText size={18} />
                                      <span className="text-xs">PDF</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                      {cobros.length > 0 && (
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr>
                            <td colSpan="1" className="py-3 px-4 text-sm font-bold text-gray-700">
                              Total Cobrado:
                            </td>
                            <td className="py-3 px-4 text-sm font-bold text-navy-900 text-lg">
                              {cobros.reduce((sum, c) => sum + Number(c.importe || 0), 0).toFixed(2)}€
                            </td>
                            <td colSpan="4"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
          )}

          {/* Modal de Registro de Cobro */}
          {showModalCobro && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-navy-900">
                    {cobroEnEdicionId ? 'Editar Cobro' : 'Registrar Nuevo Cobro'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowModalCobro(false)
                      setFormCobro({
                        importe: '',
                        metodo_pago: 'Transferencia',
                        cuenta_destino: 'Caixabank',
                        concepto: ''
                      })
                      setCobroEnEdicionId(null)
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Importe */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Importe (€) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formCobro.importe}
                      onChange={(e) => {
                        let valor = e.target.value
                        // Permitir decimales con punto o coma
                        if (valor.includes(',')) {
                          valor = valor.replace(',', '.')
                        }
                        setFormCobro({ ...formCobro, importe: valor })
                      }}
                      onBlur={(e) => {
                        const valorLimpio = limpiarNumero(e.target.value)
                        setFormCobro({ ...formCobro, importe: valorLimpio > 0 ? valorLimpio.toFixed(2) : '' })
                      }}
                      placeholder="Ej: 66.50"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Método de Pago */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Método de Pago <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formCobro.metodo_pago}
                      onChange={(e) => setFormCobro({ ...formCobro, metodo_pago: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="Transferencia">Transferencia</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta">Tarjeta</option>
                      <option value="Talón">Talón</option>
                    </select>
                  </div>

                  {/* Cuenta Destino */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cuenta Destino <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formCobro.cuenta_destino}
                      onChange={(e) => setFormCobro({ ...formCobro, cuenta_destino: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="Caixabank">Caixabank</option>
                      <option value="Santander">Santander</option>
                      <option value="Caja">Caja</option>
                    </select>
                  </div>

                  {/* Concepto */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Concepto <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formCobro.concepto}
                      onChange={(e) => setFormCobro({ ...formCobro, concepto: e.target.value })}
                      placeholder="Ej: Depósito, Pago 2, Total"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={guardarCobro}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <Save size={20} />
                    {cobroEnEdicionId ? 'Actualizar Cobro' : 'Guardar Cobro'}
                  </button>
                  <button
                    onClick={() => {
                      setShowModalCobro(false)
                      setFormCobro({
                        importe: '',
                        metodo_pago: 'Transferencia',
                        cuenta_destino: 'Caixabank',
                        concepto: ''
                      })
                      setCobroEnEdicionId(null)
                    }}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
                </div>
            </div>
          )}

            {/* TAB: Documentación */}
          {tab === 'documentacion' && (
              <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Documentación del Viaje</h3>
                  <p className="text-gray-600">Funcionalidad en desarrollo</p>
                </div>
            </div>
          )}

            {/* TAB: Cierre de Grupo */}
          {tab === 'cierre' && (
              <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-6">Cierre de Grupo</h3>
                  
                  {expediente?.cotizacion?.resultados ? (
                    <div className="space-y-4">
                      <div className="flex justify-between py-3 border-b">
                        <span className="font-semibold">Total Ingresos:</span>
                        <span className="text-xl font-bold text-green-600">
                          {(expediente.cotizacion.resultados.totalIngresos || 0).toFixed(2)}€
                        </span>
            </div>
                      <div className="flex justify-between py-3 border-b">
                        <span className="font-semibold">Total Gastos:</span>
                        <span className="text-xl font-bold text-red-600">
                          {(expediente.cotizacion.resultados.totalGastos || 0).toFixed(2)}€
                        </span>
                      </div>
                      <div className="flex justify-between py-3 border-b">
                        <span className="font-semibold">Beneficio Bruto:</span>
                        <span className="text-xl font-bold text-blue-600">
                          {((expediente.cotizacion.resultados.totalIngresos || 0) - (expediente.cotizacion.resultados.totalGastos || 0)).toFixed(2)}€
                        </span>
                      </div>
                      <div className="flex justify-between py-3 bg-navy-900 text-white px-4 rounded-lg mt-4">
                        <span className="font-bold text-lg">BENEFICIO NETO:</span>
                        <span className="text-3xl font-black">
                          {((expediente.cotizacion.resultados.totalIngresos || 0) - (expediente.cotizacion.resultados.totalGastos || 0) * 0.79).toFixed(2)}€
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">
                      No hay datos de cotización. Completa la cotización primero.
                    </p>
          )}
        </div>
            </div>
          )}
            
          </div>
        </div>
        
        {/* Renderizado del Modal al final del JSX - Solo se activa cuando showModal es verdadero */}
        {showModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-md flex items-center justify-center z-[9999] p-6 text-left"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowModal(false)
              }
            }}
          >
            <div
              className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl p-12 border-4 border-gray-200"
              style={{ backgroundColor: 'white', color: 'black' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-4xl font-[1000] italic uppercase tracking-tighter text-slate-900">
                  Nuevo Proveedor
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-4 bg-slate-100 rounded-full hover:bg-red-500 hover:text-white transition-all"
                >
                  <X size={32} />
                </button>
              </div>

              {/* ProveedorForm reutilizado (mismo que en sección de Proveedores) */}
              <ProveedorForm
                initialData={{
                  nombre_comercial: nombreNuevoProveedor,
                  tipo: tipoNuevoProveedor
                }}
                submitLabel="Guardar y Seleccionar"
                onCancel={() => setShowModal(false)}
                onSaved={async (nuevoProveedor) => {
                  // onSuccess: refrescar lista de proveedores en la cotización
                  await cargarProveedores()

                  // Buscar el proveedor recién creado en la lista actualizada
                  const proveedorActualizado =
                    proveedores.find(
                      p =>
                        p.id === nuevoProveedor.id ||
                        (p.nombreComercial.toLowerCase() === nuevoProveedor.nombreComercial.toLowerCase() &&
                          p.tipo === nuevoProveedor.tipo)
                    ) || nuevoProveedor

                  // Seleccionar automáticamente en la fila actual de cotización
                  if (servicioIdParaProveedor) {
                    actualizarServicio(servicioIdParaProveedor, 'proveedorId', proveedorActualizado.id)
                    setBusquedaProveedor(prev => ({
                      ...prev,
                      [servicioIdParaProveedor]: proveedorActualizado.nombreComercial
                    }))
                    setMostrarSugerencias(prev => ({
                      ...prev,
                      [servicioIdParaProveedor]: false
                    }))
                  }

                  setShowModal(false)
                }}
              />
            </div>
          </div>
        )}
        
      </div>
    )
  } catch (error) {
    // ⚠️ CAPTURA DE ERRORES GLOBAL
    console.error('Error al renderizar ExpedienteDetalle:', error)
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md">
          <h3 className="text-xl font-bold text-red-600 mb-4">❌ Error</h3>
          <p className="text-gray-700 mb-4">Error al cargar la tabla: {error.message}</p>
          <button onClick={onClose} className="btn-primary w-full">
            Cerrar
          </button>
      </div>
    </div>
  )
  }
}

export default ExpedienteDetalle
