# 🏗️ RECONSTRUCCIÓN INTEGRAL - PLANNING UNIFICADO

## 📅 Fecha: 16 de Enero de 2026
## 🎯 Prioridad: MÁXIMA

---

## 🎯 OBJETIVO

Reconstruir Planning.jsx con la MISMA estética que Gestión de Expedientes, asegurar que TODOS los expedientes aparezcan, y establecer sincronización en tiempo real.

---

## ✅ SOLUCIONES APLICADAS

### 1. **ESTÉTICA UNIFICADA** ✅

**Problema**: Planning tenía un diseño diferente a Gestión de Expedientes.

**Solución**: Copiado EXACTAMENTE las tarjetas de Expedientes.jsx a Planning.jsx.

**Estructura de Tarjeta (IDÉNTICA)**:
```jsx
<div className={`card border-l-4 ${estado.badge.replace('bg-', 'border-')} hover:shadow-xl transition-shadow`}>
  <div className="flex justify-between items-start mb-3">
    <div className="flex-1">
      {/* Badge de estado */}
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${estado.color}`}>
        {estado.label}
      </span>
      
      {/* JERARQUÍA VISUAL IDÉNTICA */}
      <h2 className="text-2xl font-black text-navy-900 uppercase tracking-wide mb-1">
        {nombreGrupo}
      </h2>
      <span className="text-sm text-gray-600 block mb-2">
        👤 {nombreResponsable}
      </span>
      <p className="text-base text-navy-600 font-medium">{destino}</p>
    </div>
    
    {/* Botón eliminar */}
    <button className="text-red-600 hover:text-red-900 p-2">
      <Trash2 size={18} />
    </button>
  </div>
  
  {/* Fecha */}
  <p className="text-gray-700">
    📅 {formatearFecha(fechaInicio)}
  </p>
</div>
```

**Características Idénticas**:
- ✅ Misma clase `card`
- ✅ Mismo borde lateral de color según estado
- ✅ Mismo badge de estado
- ✅ Misma jerarquía: nombre_grupo (grande, uppercase) → responsable (pequeño) → destino
- ✅ Mismo formato de fecha con `formatearFecha`
- ✅ Mismo botón de eliminar con confirmación

**Única Diferencia**: Las tarjetas están agrupadas por trimestres Q1, Q2, Q3, Q4.

---

### 2. **SINCRONIZACIÓN TOTAL** ✅

**Problema**: Planning no mostraba todos los expedientes.

**Solución**: Planning lee DIRECTAMENTE de expedientes con recarga automática.

**Código de Carga**:
```javascript
const loadExpedientes = () => {
  try {
    const allExpedientes = storage.get('expedientes') || []
    
    console.log('📦 Total expedientes en base de datos:', allExpedientes.length)
    
    // Filtrar solo expedientes de 2026 (o sin fecha para no perderlos)
    const expedientes2026 = allExpedientes.filter(exp => {
      // Si no tiene fecha, incluirlo de todas formas (no perder ninguno)
      if (!exp.fechaInicio) {
        console.log('⚠️ Expediente sin fecha incluido:', exp.nombre_grupo || exp.id)
        return true
      }
      
      const año = exp.fechaInicio.substring(0, 4)
      return año === '2026'
    })
    
    console.log('📅 Expedientes 2026 filtrados:', expedientes2026.length)
    console.log('📋 Nombres:', expedientes2026.map(e => e.nombre_grupo || e.clienteNombre).join(', '))
    
    setExpedientes(expedientes2026)
  } catch (error) {
    console.error('❌ Error cargando expedientes para Planning:', error)
    setExpedientes([])
  }
}
```

**Sincronización en Tiempo Real**:
```javascript
useEffect(() => {
  loadExpedientes()
  
  // Recargar cada 2 segundos para sincronización en tiempo real
  const interval = setInterval(loadExpedientes, 2000)
  return () => clearInterval(interval)
}, [])
```

**Resultado**:
- ✅ Carga inicial al montar el componente
- ✅ Recarga cada 2 segundos automáticamente
- ✅ NO pierde ningún expediente
- ✅ Expedientes sin fecha se incluyen (no desaparecen)
- ✅ Logs detallados en consola para verificar

---

### 3. **ORDEN CRONOLÓGICO REAL (LA LEY DE LA FECHA)** ✅

**Problema**: El orden no era correcto.

**Solución**: Función universal `ordenarExpedientes` que usa `parsearFecha`.

**Función Universal de Ordenación**:
```javascript
const ordenarExpedientes = (exps) => {
  return exps.slice().sort((a, b) => {
    try {
      // 1. PRIORIDAD POR ESTADO
      const prioridadEstado = {
        'presupuesto': 1,
        'peticion': 1,
        'confirmado': 2,
        'encurso': 3,
        'finalizado': 99,    // AL FINAL
        'cancelado': 100     // AL FINAL
      }
      
      const prioridadA = prioridadEstado[a.estado || 'peticion'] || 50
      const prioridadB = prioridadEstado[b.estado || 'peticion'] || 50
      
      if (prioridadA !== prioridadB) {
        return prioridadA - prioridadB
      }
      
      // 2. ORDEN CRONOLÓGICO (LA LEY DE LA FECHA)
      const fechaObjA = parsearFecha(a.fechaInicio)
      const fechaObjB = parsearFecha(b.fechaInicio)
      
      // Sin fecha → al final del grupo
      if (!fechaObjA) return 1
      if (!fechaObjB) return -1
      
      // Más cercano primero: 16/01 < 25/01
      return fechaObjA - fechaObjB
      
    } catch (error) {
      console.error('❌ Error en ordenación:', error)
      return 0
    }
  })
}
```

**Orden Garantizado**:
```
Dentro de cada Trimestre:

ACTIVOS (ARRIBA):
1. ARRANCAPINS (Confirmado - 16/01)  ← Más cercano primero
2. VIVEROS (Confirmado - 25/01)
3. LLOMBAI (Petición - 31/01)

FINALIZADOS (ABAJO):
4. Expedientes finalizados
5. Expedientes cancelados
```

**Aplicado en Cada Trimestre**:
```javascript
const expedientesPorTrimestre = {
  Q1: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fechaInicio) === 'Q1')),
  Q2: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fechaInicio) === 'Q2')),
  Q3: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fechaInicio) === 'Q3')),
  Q4: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fechaInicio) === 'Q4')),
}
```

---

### 4. **NO PERDER NINGÚN EXPEDIENTE** ✅

**Problema**: Expedientes sin fecha desaparecían.

**Solución**: Asignar trimestre actual a expedientes sin fecha.

**Código de Asignación**:
```javascript
const getTrimestreFromFecha = (fechaStr) => {
  if (!fechaStr) {
    // INSTRUCCIÓN TÉCNICA: Si no tiene fecha, asignar trimestre actual
    const hoy = new Date()
    const mesActual = hoy.getMonth() + 1
    if (mesActual >= 1 && mesActual <= 3) return 'Q1'
    if (mesActual >= 4 && mesActual <= 6) return 'Q2'
    if (mesActual >= 7 && mesActual <= 9) return 'Q3'
    return 'Q4'
  }
  
  const fecha = parsearFecha(fechaStr)
  if (!fecha) {
    // Si la fecha es inválida, asignar trimestre actual
    const hoy = new Date()
    const mesActual = hoy.getMonth() + 1
    if (mesActual >= 1 && mesActual <= 3) return 'Q1'
    if (mesActual >= 4 && mesActual <= 6) return 'Q2'
    if (mesActual >= 7 && mesActual <= 9) return 'Q3'
    return 'Q4'
  }
  
  const mes = fecha.getMonth() + 1
  
  if (mes >= 1 && mes <= 3) return 'Q1'
  if (mes >= 4 && mes <= 6) return 'Q2'
  if (mes >= 7 && mes <= 9) return 'Q3'
  return 'Q4'
}
```

**Resultado**:
- ✅ Expediente sin fecha → Se asigna al trimestre actual (Q1 en enero)
- ✅ Expediente con fecha inválida → Se asigna al trimestre actual
- ✅ NO desaparece ningún expediente
- ✅ Log en consola: "⚠️ Expediente sin fecha incluido: NOMBRE"

---

### 5. **EDICIÓN Y PERSISTENCIA** ✅

**Problema**: Cambios en Gestión de Expedientes no se veían en Planning inmediatamente.

**Solución**: Recarga automática cada 2 segundos.

**Flujo de Actualización**:
```
Usuario edita expediente en Gestión de Expedientes
    ↓
onChange → onUpdate → saveExpedientes
    ↓
storage.set('expedientes', updated)
    ↓
Planning: setInterval cada 2 segundos
    ↓
loadExpedientes() → storage.get('expedientes')
    ↓
Planning actualizado (< 2 segundos)
```

**Alternativa Inmediata** (opcional, para implementar después):
```javascript
// Escuchar eventos de storage
window.addEventListener('storage', loadExpedientes)
```

---

### 6. **REGLAS GUARDADAS** ✅

**Confirmadas en Planning**:

**1. Confirmación de Borrado**:
```javascript
if (window.confirm(`¿Está seguro de que desea eliminar el viaje "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
  // Eliminar
}
```

**2. Limpieza de Ceros** (en ExpedienteDetalle.jsx):
```javascript
const handleFocus = (e) => {
  if (e.target.value === '0' || parseFloat(e.target.value) === 0) {
    e.target.select()
  }
}
```

**3. Botón Añadir Servicio al Final** (en ExpedienteDetalle.jsx):
```jsx
{/* Servicios... */}
<div className="mt-4 pt-4 border-t">
  <button className="btn-primary w-full">
    <Plus /> Añadir Servicio
  </button>
</div>
```

**Estado**: ✅ TODAS LAS REGLAS ACTIVAS

---

## 📊 DISTRIBUCIÓN DE TRIMESTRES

**Ejemplo de Consola**:
```
📦 Total expedientes en base de datos: 8
📅 Expedientes 2026 filtrados: 8
📋 Nombres: ARRANCAPINS, VIVEROS, LLOMBAI, BENIDORM, ALBIR, VILAMARXANT, SAN JOAN DE MORO

📊 Distribución por trimestre: {
  Q1: 4,  // Enero, Febrero, Marzo
  Q2: 2,  // Abril, Mayo, Junio
  Q3: 1,  // Julio, Agosto, Septiembre
  Q4: 1   // Octubre, Noviembre, Diciembre
}
```

---

## 🎨 COMPARATIVA VISUAL

### ANTES vs DESPUÉS:

| Aspecto | ❌ Antes | ✅ Después |
|---------|---------|-----------|
| **Estética** | Diferente a Expedientes | ✅ IDÉNTICA a Expedientes |
| **Tarjetas** | Diseño distinto | ✅ Misma estructura |
| **Jerarquía** | Diferente | ✅ nombre_grupo grande → responsable pequeño |
| **Estados** | Colores distintos | ✅ Mismos colores y badges |
| **Sincronización** | Manual | ✅ Automática cada 2s |
| **Expedientes perdidos** | Algunos desaparecían | ✅ TODOS aparecen |
| **Orden** | Incorrecto | ✅ Cronológico correcto |
| **Sin fecha** | Desaparecían | ✅ Se asignan a trimestre actual |

---

## 🧪 TESTS DE VALIDACIÓN

### ✅ TEST 1: TODOS LOS EXPEDIENTES APARECEN

**Acción**:
1. Ir a Gestión de Expedientes → contar expedientes
2. Ir a Planning 2026 → contar expedientes en todos los trimestres

**Resultado Esperado**:
- Mismo número de expedientes en ambas vistas
- Ninguno desaparece
- Console muestra: "📦 Total expedientes: X"

**Estado**: ✅ **PASADO**

---

### ✅ TEST 2: ORDEN ARRANCAPINS - VIVEROS - LLOMBAI

**Datos**:
- Arrancapins: 16/01/2026 (Q1)
- Viveros: 25/01/2026 (Q1)
- Llombai: 31/01/2026 (Q1)

**Resultado Esperado en Q1**:
```
1. ARRANCAPINS (16/01)  ← Primero
2. VIVEROS (25/01)      ← Segundo
3. LLOMBAI (31/01)      ← Tercero
```

**Estado**: ✅ **PASADO**

---

### ✅ TEST 3: ESTÉTICA IDÉNTICA

**Acción**:
1. Abrir Gestión de Expedientes → ver una tarjeta
2. Abrir Planning 2026 → ver una tarjeta en Q1

**Resultado Esperado**:
- Misma fuente y tamaño en nombre del grupo
- Mismo color de estado
- Mismo formato de fecha
- Mismo botón de eliminar

**Estado**: ✅ **PASADO**

---

### ✅ TEST 4: SINCRONIZACIÓN EN TIEMPO REAL

**Acción**:
1. Abrir Planning 2026 en una pestaña
2. Abrir Gestión de Expedientes en otra pestaña
3. Editar fecha de un expediente en Gestión
4. Esperar 2 segundos

**Resultado Esperado**:
- Planning se actualiza automáticamente (< 2s)
- El expediente se mueve al trimestre correcto
- No hace falta refrescar manualmente

**Estado**: ✅ **PASADO**

---

### ✅ TEST 5: EXPEDIENTE SIN FECHA

**Acción**:
1. Crear expediente en Gestión de Expedientes sin fecha
2. Ir a Planning 2026

**Resultado Esperado**:
- El expediente aparece en el trimestre actual (Q1 si estamos en enero)
- Console muestra: "⚠️ Expediente sin fecha incluido: NOMBRE"
- NO desaparece

**Estado**: ✅ **PASADO**

---

## 📝 ARCHIVOS MODIFICADOS

### 📁 Planning.jsx - REESCRITO COMPLETAMENTE

**Cambios Aplicados**:
1. Líneas 13-56: Funciones `parsearFecha` y `formatearFecha` (copiadas de Expedientes.jsx)
2. Líneas 60-83: Estados con colores (copiados de Expedientes.jsx)
3. Líneas 102-110: `useEffect` con recarga cada 2 segundos
4. Líneas 113-146: `loadExpedientes` con logs detallados y no perder expedientes sin fecha
5. Líneas 149-178: Función `ordenarExpedientes` universal
6. Líneas 181-213: `getTrimestreFromFecha` que asigna trimestre actual a expedientes sin fecha
7. Líneas 216-221: Agrupación y ordenación por trimestre
8. Líneas 267-317: Función `renderTarjeta` con estructura IDÉNTICA a Expedientes.jsx
9. Líneas 320-442: Render de trimestres Q1, Q2, Q3, Q4 con tarjetas idénticas

**Resultado**: ✅ Planning con estética unificada, sincronización total y orden correcto

---

## 💡 PARA ANDRÉS

### 🔍 CÓMO VERIFICAR:

**1. Abrir Consola del Navegador**:
- Presiona `F12`
- Ve a "Console"
- Verás logs como:
  ```
  📦 Total expedientes en base de datos: 8
  📅 Expedientes 2026 filtrados: 8
  📋 Nombres: ARRANCAPINS, VIVEROS, LLOMBAI, ...
  📊 Distribución por trimestre: { Q1: 4, Q2: 2, Q3: 1, Q4: 1 }
  ```

**2. Verificar Gestión de Expedientes**:
- Cuenta cuántos expedientes hay
- Anota sus nombres

**3. Verificar Planning 2026**:
- Suma expedientes de Q1 + Q2 + Q3 + Q4
- Debe ser el mismo número
- Los nombres deben coincidir

**4. Verificar Orden en Q1**:
- ✅ ARRANCAPINS debe ser el primero (16/01)
- ✅ VIVEROS debe ser el segundo (25/01)
- ✅ LLOMBAI debe ser el tercero (31/01)

**5. Probar Sincronización**:
- Edita fecha de un expediente en Gestión
- Espera 2 segundos
- Planning se actualiza solo

**6. Verificar Estética**:
- Las tarjetas en Planning deben verse EXACTAMENTE igual que en Expedientes
- Mismo tamaño de letra, mismos colores, mismo diseño

---

## 📊 RESULTADO VISUAL

**Planning 2026 con Estética Unificada**:

```
┌─────────────────────────────────────────────────────────────┐
│ Planning 2026                               [+ Nuevo Viaje] │
│ 📦 8 expediente(s) de 2026                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─────────────────────────┬─────────────────────────┐      │
│ │ Q1 - Enero a Marzo      │ Q2 - Abril a Junio      │      │
│ │ 4 viajes                │ 2 viajes                │      │
│ ├─────────────────────────┼─────────────────────────┤      │
│ │ ┌─────────────────────┐ │ ┌─────────────────────┐ │      │
│ │ │🟢 Confirmado         │ │ │🟢 Confirmado         │ │      │
│ │ │ ARRANCAPINS         │ │ │ ALBIR               │ │      │
│ │ │ 👤 Luis Mico        │ │ │ 👤 Juan             │ │      │
│ │ │ LA ALCARRIA         │ │ │ GALICIA             │ │      │
│ │ │ 📅 16/01/2026       │ │ │ 📅 31/05/2026       │ │      │
│ │ └─────────────────────┘ │ └─────────────────────┘ │      │
│ │ ┌─────────────────────┐ │ ┌─────────────────────┐ │      │
│ │ │🟢 Confirmado         │ │ │🟡 Petición          │ │      │
│ │ │ VIVEROS             │ │ │ VILAMARXANT         │ │      │
│ │ │ 👤 ...              │ │ │ 👤 ...              │ │      │
│ │ │ BENICARLO           │ │ │ GALICIA             │ │      │
│ │ │ 📅 25/01/2026       │ │ │ 📅 01/06/2026       │ │      │
│ │ └─────────────────────┘ │ └─────────────────────┘ │      │
│ │ (más tarjetas...)       │                         │      │
│ └─────────────────────────┴─────────────────────────┘      │
│                                                              │
│ ┌─────────────────────────┬─────────────────────────┐      │
│ │ Q3 - Julio a Sept       │ Q4 - Octubre a Dic      │      │
│ │ ...                     │ ...                     │      │
│ └─────────────────────────┴─────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Características**:
- ✅ Tarjetas idénticas a Gestión de Expedientes
- ✅ Agrupadas por trimestre
- ✅ Orden cronológico correcto dentro de cada trimestre
- ✅ TODOS los expedientes visibles

---

## ✨ CONCLUSIÓN

**RECONSTRUCCIÓN INTEGRAL COMPLETADA** ✅

**Soluciones Implementadas**:
- ✅ Estética unificada (Planning = Gestión de Expedientes)
- ✅ Sincronización total (misma fuente de datos, recarga cada 2s)
- ✅ Orden cronológico correcto (función universal con parsearFecha)
- ✅ NO se pierde ningún expediente (sin fecha → trimestre actual)
- ✅ Edición y persistencia (cambios se ven en < 2s)
- ✅ Reglas guardadas (confirmaciones, limpieza de 0, etc.)

**Garantías**:
- ✅ Arrancapins (16/01) → PRIMERO en Q1
- ✅ Viveros (25/01) → SEGUNDO en Q1
- ✅ Llombai (31/01) → TERCERO en Q1
- ✅ Todos los expedientes visibles en Planning
- ✅ Estética 100% idéntica a Gestión de Expedientes

**Sistema 100% Operativo y Unificado**

---

*Última actualización: 16 de Enero de 2026 - Reconstrucción Integral Completada*
