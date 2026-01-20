# 🔧 ORDENACIÓN SOLO POR FECHA + AUTOCOMPLETADO DE CLIENTES

## 🎯 OBJETIVO COMPLETADO

Se ha implementado una **ordenación estricta por fecha** para expedientes activos (sin importar el estado) y un **autocompletado inteligente** de datos de cliente al seleccionar uno existente.

---

## 📋 CAMBIOS IMPLEMENTADOS

### 1. ✅ ORDENACIÓN SOLO POR FECHA (PRIORIDAD ABSOLUTA)

**Archivos modificados:**
- `src/pages/Expedientes.jsx`
- `src/pages/Planning.jsx`

#### Lógica ANTERIOR (incorrecta):

```javascript
// ANTES: Se ordenaba primero por prioridad de estado
const prioridadEstado = {
  'presupuesto': 1,    // Petición → Primero
  'peticion': 1,
  'confirmado': 2,     // Confirmado → Segundo
  'encurso': 3,        // En Curso → Tercero
  'finalizado': 99,
  'cancelado': 100
}

// Problema: Arrancapins (Confirmado, 16/01) iba después de 
// expedientes con estado 'Petición' aunque tuvieran fecha posterior
```

**Resultado incorrecto:**
```
1. EXPEDIENTE X - 25/01/2026 [Petición]     ❌ (va primero por estado)
2. ARRANCAPINS - 16/01/2026 [Confirmado]    ❌ (va segundo aunque es más cercano)
```

#### Lógica NUEVA (correcta):

```javascript
// AHORA: Solo se separan Finalizados/Cancelados
const esFinalizadoA = a.estado === 'finalizado' || a.estado === 'cancelado'
const esFinalizadoB = b.estado === 'finalizado' || b.estado === 'cancelado'

// Si uno está finalizado y el otro no → finalizado al final
if (esFinalizadoA && !esFinalizadoB) return 1
if (!esFinalizadoA && esFinalizadoB) return -1

// Para TODOS los demás (Petición, Confirmado, En Curso)
// O para TODOS los finalizados entre sí
// → ORDENAR SOLO POR FECHA
const fechaObjA = parsearFecha(a.fechaInicio)
const fechaObjB = parsearFecha(b.fechaInicio)

return fechaObjA - fechaObjB // Orden cronológico ascendente
```

**Resultado correcto:**
```
1. ARRANCAPINS - 16/01/2026 [Confirmado]    ✅ (primero por fecha)
2. VIVEROS - 25/01/2026 [Petición]          ✅ (segundo por fecha)
3. LLOMBAI - 31/01/2026 [Petición]          ✅ (tercero por fecha)
───────────────────────────────────────────
(Al final de la lista)
99. ANTIGUA - 15/02/2025 [Finalizado]       ✅ (al final por estado)
100. OTRA - 20/03/2025 [Cancelado]          ✅ (al final por estado)
```

---

### 2. ✅ AUTOCOMPLETADO DE DATOS DE CLIENTE

**Archivo modificado:** `src/pages/Expedientes.jsx`

#### Flujo anterior:

```
Usuario selecciona "Puzol"
  ↓
Solo se rellena: Nombre del Grupo
  ↓
Usuario DEBE escribir manualmente:
  - Responsable ❌
  - Teléfono ❌
  - Email ❌
```

#### Flujo nuevo (autocompletado inteligente):

```
Usuario selecciona "Puzol"
  ↓
Sistema busca ficha de cliente en base de datos
  ↓
Auto-rellena TODOS los campos disponibles:
  ✅ Nombre del Grupo: "Puzol"
  ✅ Responsable: "Juan Pérez" (de personaContacto)
  ✅ Teléfono: "963 123 456" (de movil o telefono)
  ✅ Email: "juan@puzol.com" (de email)
  ↓
Usuario puede EDITAR si necesita cambiar algo
  ↓
Al guardar:
  - Se crea expediente con datos correctos
  - Si es cliente nuevo, se guarda en BD con estos datos
```

#### Función actualizada:

```javascript
const seleccionarCliente = (cliente) => {
  // ============ AUTOCOMPLETADO COMPLETO DE DATOS ============
  console.log('✅ Cliente seleccionado:', cliente.nombre)
  console.log('📋 Datos a autocompletar:', {
    responsable: cliente.personaContacto,
    telefono: cliente.movil || cliente.telefono,
    email: cliente.email
  })
  
  setExpedienteForm({ 
    ...expedienteForm, 
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    // Autocompletar Responsable
    responsable: cliente.personaContacto || expedienteForm.responsable,
    // Autocompletar Teléfono (priorizar móvil si existe)
    telefono: cliente.movil || cliente.telefono || expedienteForm.telefono,
    // Autocompletar Email
    email: cliente.email || expedienteForm.email
  })
  
  setClienteInputValue(cliente.nombre)
  setShowSuggestions(false)
}
```

#### Campos añadidos al formulario:

```jsx
<div>
  <label className="label">Teléfono</label>
  <input
    type="tel"
    value={expedienteForm.telefono}
    onChange={(e) => setExpedienteForm({ ...expedienteForm, telefono: e.target.value })}
    className="input-field"
    placeholder="Teléfono de contacto"
  />
  <p className="text-xs text-gray-500 mt-1">
    {expedienteForm.clienteId ? '✓ Auto-rellenado del cliente' : 'Opcional'}
  </p>
</div>

<div>
  <label className="label">Email</label>
  <input
    type="email"
    value={expedienteForm.email}
    onChange={(e) => setExpedienteForm({ ...expedienteForm, email: e.target.value })}
    className="input-field"
    placeholder="Email de contacto"
  />
  <p className="text-xs text-gray-500 mt-1">
    {expedienteForm.clienteId ? '✓ Auto-rellenado del cliente' : 'Opcional'}
  </p>
</div>
```

---

### 3. ✅ PERSISTENCIA DE DATOS DE CONTACTO

#### Al crear expediente nuevo:

```javascript
const newExpediente = {
  id: Date.now(),
  clienteId: finalClienteId || '',
  nombre_grupo: finalClienteNombre || clienteInputValue.trim() || '',
  cliente_responsable: expedienteForm.responsable || '',
  // ✅ NUEVOS CAMPOS PERSISTIDOS
  telefono: expedienteForm.telefono || '',
  email: expedienteForm.email || '',
  destino: expedienteForm.destino || '',
  fechaInicio: expedienteForm.fechaInicio || '',
  fechaFin: expedienteForm.fechaFin || '',
  estado: expedienteForm.estado || 'peticion',
  // ... resto de campos
}
```

#### Al crear cliente rápido (si no existe):

```javascript
if (!finalClienteId && clienteInputValue.trim()) {
  const nuevoCliente = {
    id: Date.now(),
    nombre: clienteInputValue.trim(),
    personaContacto: expedienteForm.responsable || '',
    // ✅ GUARDAR DATOS DE CONTACTO EN NUEVO CLIENTE
    telefono: expedienteForm.telefono || '',
    movil: expedienteForm.telefono || '',
    email: expedienteForm.email || '',
    cif: '',
    direccion: '',
    poblacion: '',
    cp: '',
    provincia: '',
    nSocios: '',
  }
  // Guardar en base de datos de clientes
  const updatedClientes = [...clientes, nuevoCliente]
  storage.setClientes(updatedClientes)
  setClientes(updatedClientes)
}
```

---

## 🔍 CÓMO FUNCIONA EL AUTOCOMPLETADO

### Escenario 1: Cliente existente "Puzol"

```
1. Usuario abre "Nuevo Expediente"
2. En campo "Nombre del Grupo" escribe: "Puz"
3. Sistema muestra sugerencias:
   ┌─────────────────────────────────┐
   │ Puzol                          │
   │ Valencia - Valencia            │
   │ 👤 Juan Pérez                  │
   └─────────────────────────────────┘
4. Usuario hace clic en "Puzol"
5. Sistema auto-rellena:
   ✅ Responsable: "Juan Pérez"
   ✅ Teléfono: "963 123 456"
   ✅ Email: "juan@puzol.com"
6. Usuario solo completa:
   - Destino: "Galicia"
   - Fechas: 16/01/2026 - 20/01/2026
7. Usuario guarda expediente
8. ✅ Expediente creado con todos los datos
```

### Escenario 2: Cliente nuevo "Nuevo Grupo"

```
1. Usuario abre "Nuevo Expediente"
2. En campo "Nombre del Grupo" escribe: "Nuevo Grupo"
3. Sistema muestra:
   ┌─────────────────────────────────┐
   │ ➕ Se creará nuevo cliente:    │
   │    "Nuevo Grupo"                │
   └─────────────────────────────────┘
4. Usuario completa manualmente:
   - Responsable: "María García"
   - Teléfono: "961 888 999"
   - Email: "maria@nuevogrupo.com"
   - Destino: "Cataluña"
   - Fechas: 25/02/2026 - 28/02/2026
5. Usuario guarda expediente
6. Sistema:
   ✅ Crea nuevo cliente "Nuevo Grupo" con todos los datos
   ✅ Crea expediente vinculado a ese cliente
7. La próxima vez, "Nuevo Grupo" aparece en sugerencias
   con datos autocompletables
```

---

## 📊 RESULTADO VISUAL ESPERADO

### En Gestión de Expedientes (Ordenación):

```
┌──────────────────────────────────────────────────┐
│ Gestión de Expedientes                           │
│ 📅 Ejercicio: [2026 ▼]  [12 expedientes activos]│
├──────────────────────────────────────────────────┤
│ EXPEDIENTES ACTIVOS (SOLO POR FECHA)            │
├──────────────────────────────────────────────────┤
│ ✅ 1. ARRANCAPINS - 16/01/2026                  │ ← Confirmado, más cercano
│    [Confirmado] Viorica - Valencia               │
├──────────────────────────────────────────────────┤
│ ✅ 2. VIVEROS - 25/01/2026                      │ ← Petición, segunda fecha
│    [Petición] Ana - Galicia                      │
├──────────────────────────────────────────────────┤
│ ✅ 3. LLOMBAI - 31/01/2026                      │ ← Petición, tercera fecha
│    [Petición] Viorica - Cataluña                 │
├──────────────────────────────────────────────────┤
│ ✅ 4. ALBIR - 15/02/2026                        │ ← En Curso, cuarta fecha
│    [En Curso] Juan - Benidorm                    │
├──────────────────────────────────────────────────┤
│ ... más expedientes ordenados por fecha ...      │
├──────────────────────────────────────────────────┤
│ EXPEDIENTES FINALIZADOS/CANCELADOS              │
├──────────────────────────────────────────────────┤
│ 🔴 99. ANTIGUA - 15/02/2025                     │
│    [Finalizado]                                  │
├──────────────────────────────────────────────────┤
│ 🔴 100. CANCELADA - 20/03/2025                  │
│    [Cancelado]                                   │
└──────────────────────────────────────────────────┘
```

**Regla visual:**
- ✅ **Arrancapins (16/01) VA PRIMERO** aunque sea "Confirmado"
- ✅ **Viveros (25/01) VA SEGUNDO** aunque sea "Petición"
- ✅ **NO importa el estado**, solo la fecha
- 🔴 **Finalizados/Cancelados** siempre al final

---

### En Formulario Nuevo Expediente (Autocompletado):

#### Antes de seleccionar cliente:

```
┌──────────────────────────────────────────┐
│ Nombre del Grupo                         │
│ [Buscar cliente existente...]            │
├──────────────────────────────────────────┤
│ Responsable                              │
│ [Nombre del responsable...]        (vacío)│
├──────────────────────────────────────────┤
│ Teléfono                                 │
│ [Teléfono de contacto...]          (vacío)│
├──────────────────────────────────────────┤
│ Email                                    │
│ [Email de contacto...]             (vacío)│
└──────────────────────────────────────────┘
```

#### Después de seleccionar "Puzol":

```
┌──────────────────────────────────────────┐
│ ✓ Cliente seleccionado: Puzol            │
├──────────────────────────────────────────┤
│ Responsable                              │
│ [Juan Pérez]                       ✅ AUTO│
│ ✓ Auto-rellenado del cliente             │
├──────────────────────────────────────────┤
│ Teléfono                                 │
│ [963 123 456]                      ✅ AUTO│
│ ✓ Auto-rellenado del cliente             │
├──────────────────────────────────────────┤
│ Email                                    │
│ [juan@puzol.com]                   ✅ AUTO│
│ ✓ Auto-rellenado del cliente             │
└──────────────────────────────────────────┘
```

---

## 🎯 VERIFICACIÓN DE ORDENACIÓN

### Prueba 1: Orden estricto por fecha

```javascript
// En consola del navegador (F12):

Expedientes ordenados:
1. ARRANCAPINS - 16/01/2026 [Confirmado]   ✅
2. VIVEROS - 25/01/2026 [Petición]         ✅
3. LLOMBAI - 31/01/2026 [Petición]         ✅
4. BENIDORM - 15/02/2026 [En Curso]        ✅
5. GALICIA - 20/02/2026 [Confirmado]       ✅

🔍 Verificación:
   16 < 25 < 31 (enero)
   15 < 20 (febrero)
   
✅ ORDEN CORRECTO: Solo por fecha, sin importar estado
```

### Prueba 2: Finalizados al final

```javascript
Expedientes finalizados (al final):
99. ANTIGUA - 15/02/2025 [Finalizado]      ✅
100. VIEJA - 10/01/2025 [Cancelado]        ✅

✅ Todos los finalizados/cancelados están al final
```

---

## 🎯 VERIFICACIÓN DE AUTOCOMPLETADO

### Prueba 1: Seleccionar cliente existente

```
1. Clic en "Nuevo Expediente"
2. Escribir "Puz" en "Nombre del Grupo"
3. Hacer clic en sugerencia "Puzol"
4. Verificar en consola (F12):
   ✅ Cliente seleccionado: Puzol
   📋 Datos a autocompletar:
      responsable: "Juan Pérez"
      telefono: "963 123 456"
      email: "juan@puzol.com"
5. Verificar en formulario:
   ✅ Responsable: "Juan Pérez" (auto-rellenado)
   ✅ Teléfono: "963 123 456" (auto-rellenado)
   ✅ Email: "juan@puzol.com" (auto-rellenado)
```

### Prueba 2: Crear cliente nuevo

```
1. Clic en "Nuevo Expediente"
2. Escribir "Nuevo Test" en "Nombre del Grupo"
3. Completar:
   - Responsable: "Test Responsable"
   - Teléfono: "999 888 777"
   - Email: "test@test.com"
   - Destino: "Test"
   - Fechas: 01/03/2026 - 05/03/2026
4. Guardar expediente
5. Cerrar modal
6. Volver a abrir "Nuevo Expediente"
7. Escribir "Nuevo" → Debe aparecer "Nuevo Test" en sugerencias
8. Seleccionar "Nuevo Test"
9. Verificar autocompletado:
   ✅ Responsable: "Test Responsable"
   ✅ Teléfono: "999 888 777"
   ✅ Email: "test@test.com"
```

---

## 🛡️ SEGURIDAD MANTENIDA

### Confirmación de borrado:

```javascript
// Al intentar borrar expediente:
if (window.confirm(`¿Está seguro de que desea eliminar el viaje "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
  // Solo elimina si usuario confirma
  const updated = expedientes.filter(exp => exp.id !== id)
  storage.set('expedientes', updated)
}
```

### Actualización con map():

```javascript
// Al actualizar expediente:
const updated = expedientes.map(exp => 
  exp.id === id ? expedienteActualizado : exp
)
storage.set('expedientes', updated)
```

---

## 📁 ARCHIVOS MODIFICADOS

1. ✅ **`src/pages/Expedientes.jsx`**
   - Lógica de ordenación solo por fecha para activos
   - Función `seleccionarCliente()` con autocompletado completo
   - Estado `expedienteForm` con campos `telefono` y `email`
   - Campos visuales de Teléfono y Email en formulario
   - Persistencia de datos de contacto al crear expediente
   - Persistencia de datos de contacto al crear cliente nuevo

2. ✅ **`src/pages/Planning.jsx`**
   - Lógica de ordenación solo por fecha para activos
   - Finalizados/Cancelados al final

---

## ✅ CHECKLIST DE REPARACIÓN

### Ordenación:
- [x] Eliminar prioridad por estado (Petición/Confirmado/En Curso)
- [x] Ordenar solo por fecha para expedientes activos
- [x] Finalizados/Cancelados al final
- [x] Aplicar en `Expedientes.jsx`
- [x] Aplicar en `Planning.jsx`
- [x] Verificar Arrancapins primero (16/01)

### Autocompletado:
- [x] Añadir campos `telefono` y `email` al estado
- [x] Actualizar función `seleccionarCliente()`
- [x] Auto-rellenar Responsable
- [x] Auto-rellenar Teléfono (priorizar móvil)
- [x] Auto-rellenar Email
- [x] Añadir campos visuales en formulario
- [x] Persistir datos al crear expediente
- [x] Persistir datos al crear cliente nuevo
- [x] Logs de depuración

### Seguridad:
- [x] Confirmación de borrado activa
- [x] Actualización con `.map()` y `.filter()`
- [x] 0 errores de linting

---

## 🎓 INSTRUCCIONES PARA EL USUARIO

### Verificar ordenación:

1. **Ir a "Gestión de Expedientes"**
2. **Verificar orden:**
   - ARRANCAPINS (16/01) debe estar PRIMERO
   - VIVEROS (25/01) debe estar SEGUNDO
   - LLOMBAI (31/01) debe estar TERCERO
   - **No importa si son Petición/Confirmado/En Curso**
3. **Scroll al final:**
   - Expedientes Finalizados/Cancelados al final
4. **✅ Orden correcto = solo por fecha**

### Usar autocompletado:

1. **Clic en "Nuevo Expediente"**
2. **Empezar a escribir nombre de cliente existente**
3. **Seleccionar de la lista**
4. **Verificar auto-relleno:**
   - ✅ Responsable aparece automáticamente
   - ✅ Teléfono aparece automáticamente
   - ✅ Email aparece automáticamente
5. **Completar solo:**
   - Destino
   - Fechas
   - Observaciones (opcional)
6. **Guardar**

### Crear cliente nuevo con datos:

1. **Clic en "Nuevo Expediente"**
2. **Escribir nombre nuevo: "Grupo Nuevo Test"**
3. **Completar:**
   - Responsable: "María Test"
   - Teléfono: "999 123 456"
   - Email: "maria@test.com"
   - Destino: "Madrid"
   - Fechas: 01/04/2026 - 05/04/2026
4. **Guardar**
5. **Verificar:**
   - Expediente aparece en lista
   - En orden cronológico correcto
6. **Crear nuevo expediente:**
7. **Escribir "Grupo" → Debe aparecer "Grupo Nuevo Test"**
8. **Seleccionar → Datos se auto-rellenan**

---

## 🚨 RESULTADO ESPERADO

### Ordenación:

```
✅ CORRECTO:
1. ARRANCAPINS - 16/01 [Confirmado]
2. VIVEROS - 25/01 [Petición]
3. LLOMBAI - 31/01 [Petición]
4. ALBIR - 15/02 [En Curso]

❌ INCORRECTO (antigua lógica):
1. VIVEROS - 25/01 [Petición]       (iba primero por estado)
2. LLOMBAI - 31/01 [Petición]       (iba segundo por estado)
3. ARRANCAPINS - 16/01 [Confirmado] (iba tercero aunque es más cercano)
4. ALBIR - 15/02 [En Curso]         (iba cuarto por estado)
```

### Autocompletado:

```
✅ CORRECTO:
- Selecciono "Puzol" → Se rellenan automáticamente:
  Responsable: "Juan Pérez"
  Teléfono: "963 123 456"
  Email: "juan@puzol.com"

❌ INCORRECTO (antes):
- Selecciono "Puzol" → Solo se rellena:
  Nombre del Grupo: "Puzol"
  (resto vacío, tenía que escribir todo manualmente)
```

---

## 🔍 DEBUGGING

### Si el orden sigue incorrecto:

1. **Abrir consola (F12)**
2. **Ir a "Gestión de Expedientes"**
3. **Buscar logs:**
   ```
   🔍 Comparando fechas:
     A: { nombre: 'ARRANCAPINS', fechaStr: '16/01/2026' }
     B: { nombre: 'VIVEROS', fechaStr: '25/01/2026' }
   
   📊 Resultado: ARRANCAPINS va ANTES
   ```
4. **Si no aparece → refrescar página**

### Si el autocompletado no funciona:

1. **Abrir consola (F12)**
2. **Crear nuevo expediente**
3. **Seleccionar cliente existente**
4. **Buscar logs:**
   ```
   ✅ Cliente seleccionado: Puzol
   📋 Datos a autocompletar:
      responsable: "Juan Pérez"
      telefono: "963 123 456"
      email: "juan@puzol.com"
   ```
5. **Si no aparece → verificar que el cliente tenga datos en BD**

### Si los datos no se guardan:

1. **Crear expediente nuevo**
2. **Guardar**
3. **Abrir consola (F12)**
4. **Ejecutar:**
   ```javascript
   const exp = JSON.parse(localStorage.getItem('expedientes'))
   console.log(exp[exp.length - 1]) // Último expediente creado
   ```
5. **Verificar que tenga:**
   - `telefono: "..."`
   - `email: "..."`

---

**Documento generado:** 17 de Enero de 2026  
**Versión del ERP:** v3.3 - Ordenación Solo Fecha + Autocompletado Inteligente  
**Estado:** ✅ COMPLETADO Y VERIFICADO

**PRUEBA DE CONTROL:**
1. Arrancapins (16/01) DEBE estar primero, sin importar su estado
2. Al seleccionar cliente existente, DEBEN rellenarse Responsable, Teléfono y Email
