/**
 * SCRIPT DE MIGRACIÓN - VERSIÓN NAVEGADOR
 * 
 * Este script normaliza todos los tipos de proveedores en Supabase:
 * - Convierte a minúsculas
 * - Elimina tildes
 * 
 * INSTRUCCIONES:
 * 1. Abre la consola del navegador (F12)
 * 2. Copia y pega este código completo
 * 3. Presiona Enter para ejecutar
 * 4. Verifica los resultados en la consola
 * 
 * IMPORTANTE: Ejecutar UNA SOLA VEZ
 */

(async () => {
  const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e';
  
  // Importar Supabase dinámicamente (si no está disponible globalmente)
  let supabase;
  if (typeof window !== 'undefined' && window.supabase) {
    supabase = window.supabase;
  } else {
    // Si no está disponible, necesitarás importarlo manualmente
    console.error('❌ Supabase no está disponible. Asegúrate de tener @supabase/supabase-js cargado.');
    return;
  }
  
  // Función para normalizar tipos: minúsculas + sin tildes
  const normalizarTipo = (tipo) => {
    if (!tipo) return '';
    
    return tipo
      .toLowerCase()
      .normalize('NFD') // Normaliza caracteres con tildes
      .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (tildes)
      .trim();
  };
  
  try {
    console.log('🔄 Iniciando migración de tipos de proveedores...\n');
    
    // 1. Obtener todos los proveedores
    const { data: proveedores, error: fetchError } = await supabase
      .from('proveedores')
      .select('id, tipo, nombre_comercial');
    
    if (fetchError) {
      console.error('❌ Error obteniendo proveedores:', fetchError);
      return;
    }
    
    if (!proveedores || proveedores.length === 0) {
      console.log('ℹ️ No hay proveedores para migrar.');
      return;
    }
    
    console.log(`📊 Total de proveedores encontrados: ${proveedores.length}\n`);
    
    // 2. Identificar proveedores que necesitan actualización
    const proveedoresAMigrar = proveedores
      .map(p => ({
        id: p.id,
        nombre: p.nombre_comercial,
        tipoOriginal: p.tipo,
        tipoNormalizado: normalizarTipo(p.tipo)
      }))
      .filter(p => p.tipoOriginal !== p.tipoNormalizado);
    
    if (proveedoresAMigrar.length === 0) {
      console.log('✅ Todos los tipos ya están normalizados. No se requiere migración.');
      return;
    }
    
    console.log(`📝 Proveedores que necesitan actualización: ${proveedoresAMigrar.length}\n`);
    console.log('Detalles de cambios:');
    proveedoresAMigrar.forEach(p => {
      console.log(`  - ${p.nombre}: "${p.tipoOriginal}" → "${p.tipoNormalizado}"`);
    });
    console.log('');
    
    // 3. Actualizar cada proveedor
    let actualizados = 0;
    let errores = 0;
    
    for (const proveedor of proveedoresAMigrar) {
      const { error: updateError } = await supabase
        .from('proveedores')
        .update({ tipo: proveedor.tipoNormalizado })
        .eq('id', proveedor.id);
      
      if (updateError) {
        console.error(`❌ Error actualizando ${proveedor.nombre}:`, updateError);
        errores++;
      } else {
        console.log(`✅ Actualizado: ${proveedor.nombre} (${proveedor.tipoOriginal} → ${proveedor.tipoNormalizado})`);
        actualizados++;
      }
    }
    
    // 4. Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE MIGRACIÓN');
    console.log('='.repeat(60));
    console.log(`✅ Proveedores actualizados: ${actualizados}`);
    console.log(`❌ Errores: ${errores}`);
    console.log(`📦 Total procesado: ${proveedoresAMigrar.length}`);
    console.log('='.repeat(60));
    
    if (actualizados > 0) {
      console.log('\n✅ Migración completada exitosamente.');
    }
    
  } catch (error) {
    console.error('❌ Error fatal en la migración:', error);
  }
})();
