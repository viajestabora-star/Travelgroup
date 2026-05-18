/**
 * Script de diagnóstico para verificar datos reales de un expediente
 * Ejecutar en consola del navegador o como script temporal
 */
import { supabase } from '../supabase'

const EXPEDIENTE_ID = 'f51e81cc-0931-48fb-894c-1f1fdecdff92'

export const diagnosticarExpediente = async () => {
  console.log('🔍 INICIANDO DIAGNÓSTICO DE EXPEDIENTE:', EXPEDIENTE_ID)
  console.log('═══════════════════════════════════════════════════════════')

  // 1. Consultar tabla servicios_cotizacion
  console.log('\n📋 PASO 1: Consultando tabla servicios_cotizacion...')
  const { data: serviciosData, error: serviciosError } = await supabase
    .from('servicios_cotizacion')
    .select('*')
    .eq('id_expediente', EXPEDIENTE_ID)

  if (serviciosError) {
    console.error('❌ ERROR al consultar servicios_cotizacion:', serviciosError)
  } else {
    console.log('✅ servicios_cotizacion - Filas encontradas:', serviciosData?.length || 0)
    console.log('📦 DATOS BRUTOS servicios_cotizacion:')
    console.log(JSON.stringify(serviciosData, null, 2))
    
    // Análisis de campos por fila
    if (serviciosData && serviciosData.length > 0) {
      console.log('\n📊 ANÁLISIS DE CAMPOS POR FILA:')
      serviciosData.forEach((row, idx) => {
        console.log(`\n--- Fila ${idx + 1} (ID: ${row.id}) ---`)
        console.log('  proveedor_id_int:', row.proveedor_id_int, `(${typeof row.proveedor_id_int})`)
        console.log('  proveedor_id:', row.proveedor_id, `(${typeof row.proveedor_id})`)
        console.log('  proveedor_nombre:', row.proveedor_nombre, `(${typeof row.proveedor_nombre})`)
        console.log('  nombre_proveedor_manual:', row.nombre_proveedor_manual, `(${typeof row.nombre_proveedor_manual})`)
        console.log('  tipo_servicio:', row.tipo_servicio, `(${typeof row.tipo_servicio})`)
        console.log('  tipo:', row.tipo, `(${typeof row.tipo})`)
        console.log('  nombre_especifico:', row.nombre_especifico, `(${typeof row.nombre_especifico})`)
        console.log('  nombre_servicio:', row.nombre_servicio, `(${typeof row.nombre_servicio})`)
        console.log('  coste_unitario:', row.coste_unitario, `(${typeof row.coste_unitario})`)
        console.log('  precio_venta:', row.precio_venta, `(${typeof row.precio_venta})`)
        console.log('  id_expediente:', row.id_expediente, `(${typeof row.id_expediente})`)
        console.log('  expediente_id:', row.expediente_id, `(${typeof row.expediente_id})`)
        console.log('  empresa_id:', row.empresa_id, `(${typeof row.empresa_id})`)
        console.log('  created_at:', row.created_at)
      })
    }
  }

  // 2. Consultar tabla expedientes (versiones_json)
  console.log('\n\n📋 PASO 2: Consultando tabla expedientes (versiones_json)...')
  const { data: expedienteData, error: expedienteError } = await supabase
    .from('expedientes')
    .select('id, numero_expediente, versiones_json, empresa_id')
    .eq('id', EXPEDIENTE_ID)
    .single()

  if (expedienteError) {
    console.error('❌ ERROR al consultar expedientes:', expedienteError)
  } else {
    console.log('✅ expedientes - Datos encontrados:')
    console.log('  ID:', expedienteData?.id)
    console.log('  Número:', expedienteData?.numero_expediente)
    console.log('  Empresa ID:', expedienteData?.empresa_id)
    console.log('📦 VERSIONES_JSON completo:')
    console.log(JSON.stringify(expedienteData?.versiones_json, null, 2))
    
    if (expedienteData?.versiones_json?.versiones) {
      console.log('\n📊 ANÁLISIS DE VERSIONES:')
      expedienteData.versiones_json.versiones.forEach((v, idx) => {
        console.log(`\n--- Versión ${idx} ---`)
        console.log('  ID:', v.id)
        console.log('  Nombre:', v.nombre)
        console.log('  Confirmada:', v.confirmada)
        console.log('  Cantidad servicios:', v.servicios?.length || 0)
        if (v.servicios && v.servicios.length > 0) {
          console.log('  Primer servicio:')
          console.log('    ID:', v.servicios[0].id)
          console.log('    Tipo:', v.servicios[0].tipo || v.servicios[0].tipo_servicio)
          console.log('    Proveedor ID:', v.servicios[0].proveedorId || v.servicios[0].proveedor_id_int)
        }
      })
    }
  }

  // 3. Verificar políticas RLS (intentar contar sin filtros)
  console.log('\n\n📋 PASO 3: Verificando acceso total (sin filtros de empresa)...')
  const { data: allServicios, error: allError } = await supabase
    .from('servicios_cotizacion')
    .select('id, id_expediente, empresa_id, tipo_servicio, proveedor_id_int')

  if (allError) {
    console.error('❌ ERROR al consultar todos los servicios:', allError)
    console.log('   Posible bloqueo RLS o permisos')
  } else {
    const delExpediente = allServicios?.filter(s => s.id_expediente === EXPEDIENTE_ID) || []
    console.log('✅ Total servicios en BD:', allServicios?.length || 0)
    console.log('✅ Servicios del expediente (sin filtro empresa_id):', delExpediente.length)
    if (delExpediente.length > 0) {
      console.log('📋 IDs de servicios encontrados:')
      delExpediente.forEach(s => {
        console.log(`  - ${s.id} (empresa_id: ${s.empresa_id})`)
      })
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('🔍 FIN DEL DIAGNÓSTICO')
}

// Auto-ejecutar si se importa directamente
if (typeof window !== 'undefined') {
  window.diagnosticarExpediente = diagnosticarExpediente
  console.log('💡 Función diagnosticarExpediente() disponible en window. Ejecuta: await diagnosticarExpediente()')
}
