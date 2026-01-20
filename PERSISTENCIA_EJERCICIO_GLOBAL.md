# 🌐 PERSISTENCIA DEL EJERCICIO GLOBAL + TÍTULOS DINÁMICOS

## 🎯 OBJETIVO COMPLETADO

Se ha implementado un **estado global persistente del ejercicio (año)** que se mantiene entre vistas y sobrevive refrescos de página. Los **títulos del menú lateral son dinámicos** y se actualizan según el año seleccionado.

---

## 📋 CAMBIOS IMPLEMENTADOS

### 1. ✅ UTILIDAD DE GESTIÓN GLOBAL

**Archivo creado:** `src/utils/ejercicioGlobal.js`

Esta utilidad centraliza toda la gestión del ejercicio (año) con persistencia en localStorage.

#### Funciones principales:

```javascript
// Obtener el ejercicio actual desde localStorage
export const getEjercicioActual = () => {
  // Rango validado: 2026-2036
  // Por defecto: 2026
  return ejercicio
}

// Guardar el ejercicio en localStorage
export const setEjercicioActual = (ejercicio) => {
  localStorage.setItem('ejercicioActual', ejercicio)
  // Notificar a todos los componentes
  window.dispatchEvent(new CustomEvent('ejercicioChanged', { detail: ejercicio }))
}

// Suscribirse a cambios del ejercicio
export const subscribeToEjercicioChanges = (callback) => {
  window.addEventListener('ejercicioChanged', callback)
  return unsubscribe
}

// Obtener años disponibles (2026-2036)
export const getAñosDisponibles = () => {
  return [2036, 2035, ..., 2026]
}

// Obtener etiqueta descriptiva
export const getEtiquetaAño = (año) => {
  // "2026 (Actual)", "2027 (Futuro)", etc.
}
```

**Características:**
- ✅ **Persistencia**: Guarda en localStorage
- ✅ **Validación**: Solo acepta años 2026-2036
- ✅ **Eventos**: Sistema pub/sub para notificar cambios
- ✅ **Por defecto**: 2026 si no hay valor guardado

---

### 2. ✅ SELECTOR GLOBAL EN SIDEBAR

**Archivo modificado:** `src/components/Layout.jsx`

#### Estado global en Layout:

```javascript
const [ejercicioActual, setEjercicioActualState] = useState(getEjercicioActual())

// Sincronización con cambios globales
useEffect(() => {
  const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
    setEjercicioActualState(nuevoEjercicio)
  })
  return unsubscribe
}, [])

const handleEjercicioChange = (nuevoEjercicio) => {
  setEjercicioActual(nuevoEjercicio) // Guardar en localStorage y notificar
  setEjercicioActualState(nuevoEjercicio) // Actualizar estado local
}
```

#### Selector en sidebar:

```jsx
<div className="px-4 py-4 border-b border-navy-800">
  <label className="text-xs text-gray-400 block mb-2 font-semibold">EJERCICIO</label>
  <select
    value={ejercicioActual}
    onChange={(e) => handleEjercicioChange(parseInt(e.target.value))}
    className="w-full bg-navy-800 text-white..."
  >
    {getAñosDisponibles().map(año => (
      <option key={año} value={año}>
        {getEtiquetaAño(año)}
      </option>
    ))}
  </select>
  <p className="text-xs text-gray-500 mt-2 text-center">
    📅 Afecta a Planning y Gestión
  </p>
</div>
```

**Ubicación:** Entre el header del sidebar y la navegación

**Visual:**

```
┌──────────────────────────────────┐
│ ✈️ Viajes Tabora                │
│    ERP System               [☰] │
├──────────────────────────────────┤
│ EJERCICIO                       │
│ ┌─────────────────────────────┐ │
│ │ 2026 (Actual) ▼            │ │
│ └─────────────────────────────┘ │
│ 📅 Afecta a Planning y Gestión  │
├──────────────────────────────────┤
│ 📊 Dashboard                    │
│ 👥 Gestión de Clientes         │
│ 📄 Gestión 2026         ← Dinámico
│ 🚚 Proveedores                  │
│ 📅 Planning 2026        ← Dinámico
│ 💼 CRM Visitas                  │
│ 💰 Cierres de Grupo             │
└──────────────────────────────────┘
```

---

### 3. ✅ TÍTULOS DINÁMICOS EN MENÚ LATERAL

**Actualización del menú:**

```javascript
// ============ MENÚ DINÁMICO CON AÑO ACTUAL ============
const menuItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/clientes', icon: Users, label: 'Gestión de Clientes' },
  { path: '/expedientes', icon: FileText, label: `Gestión ${ejercicioActual}` }, // ✅ Dinámico
  { path: '/proveedores', icon: Truck, label: 'Proveedores' },
  { path: '/planning', icon: Calendar, label: `Planning ${ejercicioActual}` }, // ✅ Dinámico
  { path: '/crm', icon: Briefcase, label: 'CRM Visitas' },
  { path: '/cierres', icon: Calculator, label: 'Cierres de Grupo' },
]
```

**Comportamiento:**
- ✅ Si ejercicio es 2026 → "Planning 2026", "Gestión 2026"
- ✅ Si ejercicio es 2027 → "Planning 2027", "Gestión 2027"
- ✅ Actualización automática al cambiar selector

---

### 4. ✅ SINCRONIZACIÓN EN PÁGINAS

**Archivos modificados:**
- `src/pages/Expedientes.jsx`
- `src/pages/Planning.jsx`

#### Lectura del ejercicio global:

```javascript
// Estado inicial desde localStorage
const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())

// Sincronización con cambios globales
useEffect(() => {
  const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
    console.log('📅 Ejercicio cambiado globalmente a:', nuevoEjercicio)
    setEjercicioActual(nuevoEjercicio)
  })
  
  return unsubscribe
}, [])
```

**Flujo de sincronización:**

```
Usuario cambia selector en sidebar (2026 → 2027)
   ↓
setEjercicioActual(2027)
   ↓
Guarda en localStorage: "ejercicioActual" = 2027
   ↓
Dispara evento: window.dispatchEvent('ejercicioChanged', 2027)
   ↓
Layout escucha → Actualiza títulos del menú
   ↓
Expedientes escucha → Recarga lista con expedientes de 2027
   ↓
Planning escucha → Recarga planning con viajes de 2027
   ↓
Usuario refresca página (F5)
   ↓
Todos los componentes leen de localStorage: getEjercicioActual()
   ↓
Aplicación arranca en 2027 (estado persistido) ✅
```

---

### 5. ✅ ELIMINACIÓN DE SELECTORES DUPLICADOS

**Antes:**
- ❌ Selector en Gestión de Expedientes
- ❌ Selector en Planning
- ❌ Desincronización al cambiar de vista

**Ahora:**
- ✅ Selector único en sidebar
- ✅ Indicadores informativos en cada vista
- ✅ Sincronización automática

#### Indicador en Expedientes:

```jsx
<div className="mb-6 p-4 bg-gradient-to-r from-navy-50 to-blue-50 rounded-xl">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Calendar className="text-navy-600" size={24} />
      <div>
        <p className="text-sm font-medium text-gray-700">Ejercicio {ejercicioActual}</p>
        <p className="text-xs text-gray-500">Vista de expedientes del año seleccionado</p>
      </div>
    </div>
    <div className="px-4 py-2 bg-navy-600 text-white rounded-lg font-bold">
      12 expedientes
    </div>
  </div>
</div>
```

#### Indicador en Planning:

```jsx
<div className="mb-8 p-4 bg-gradient-to-r from-navy-50 to-blue-50 rounded-xl">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Calendar className="text-navy-600" size={24} />
      <div>
        <p className="text-sm font-medium text-gray-700">Ejercicio {ejercicioActual}</p>
        <p className="text-xs text-gray-500">Vista de viajes del año seleccionado</p>
      </div>
    </div>
    <div className="px-4 py-2 bg-navy-600 text-white rounded-lg font-bold">
      8 viajes
    </div>
  </div>
</div>
```

---

## 🎯 FLUJOS COMPLETOS DE USO

### Flujo 1: Cambio de ejercicio con persistencia

```
1. Usuario abre aplicación
   ↓
2. Sistema lee localStorage: getEjercicioActual()
   ↓
3. Resultado: 2026 (por defecto o último guardado)
   ↓
4. Sidebar muestra: "Planning 2026", "Gestión 2026"
   ↓
5. Usuario va a "Planning 2026"
   ↓
6. Ve viajes de 2026
   ↓
7. Usuario cambia selector en sidebar: 2026 → 2027
   ↓
8. Sistema guarda en localStorage: 2027
   ↓
9. Sidebar actualiza: "Planning 2027", "Gestión 2027" ✅
   ↓
10. Planning recarga automáticamente: muestra viajes de 2027 ✅
    ↓
11. Usuario va a "Gestión 2027"
    ↓
12. Muestra expedientes de 2027 (mismo año) ✅
    ↓
13. Usuario refresca página (F5)
    ↓
14. Sistema lee localStorage: 2027
    ↓
15. Aplicación arranca en 2027 (estado persistido) ✅
```

---

### Flujo 2: Navegación entre vistas (mismo ejercicio)

```
1. Usuario está en ejercicio 2027
   ↓
2. Sidebar muestra: "Planning 2027", "Gestión 2027"
   ↓
3. Usuario hace clic en "Planning 2027"
   ↓
4. Ve viajes de 2027 ✅
   ↓
5. Usuario hace clic en "Gestión 2027"
   ↓
6. Ve expedientes de 2027 ✅
   ↓
7. Usuario hace clic en "Gestión de Clientes"
   ↓
8. Ve todos los clientes (no filtrado por año)
   ↓
9. Usuario vuelve a "Planning 2027"
   ↓
10. Sigue viendo viajes de 2027 (año persistido) ✅
```

---

### Flujo 3: Múltiples pestañas/ventanas

```
1. Usuario abre aplicación en Chrome
   ↓
2. Ejercicio: 2026
   ↓
3. Usuario abre otra pestaña con la misma aplicación
   ↓
4. Ejercicio en pestaña 2: 2026 (lee mismo localStorage) ✅
   ↓
5. En pestaña 1, cambia a 2027
   ↓
6. localStorage actualizado a 2027
   ↓
7. En pestaña 2, refresca (F5)
   ↓
8. Pestaña 2 ahora muestra 2027 ✅
```

---

## 🔍 CÓMO VERIFICAR

### ✅ Prueba 1: Persistencia en localStorage

```
1. Abrir aplicación (cualquier vista)
2. Verificar selector en sidebar: debe mostrar "2026 (Actual)"
3. Cambiar a "2027 (Futuro)"
4. Verificar títulos del menú:
   ✅ "Planning 2027"
   ✅ "Gestión 2027"
5. Abrir consola (F12)
6. Ejecutar:
   localStorage.getItem('ejercicioActual')
7. Debe mostrar: "2027" ✅
8. Refrescar página (F5)
9. Verificar:
   ✅ Selector sigue en "2027"
   ✅ Títulos siguen mostrando "2027"
```

### ✅ Prueba 2: Sincronización entre vistas

```
1. En sidebar, seleccionar "2027"
2. Ir a "Gestión 2027"
3. Verificar:
   ✅ Muestra expedientes de 2027
   ✅ Indicador dice "Ejercicio 2027"
4. Ir a "Planning 2027"
5. Verificar:
   ✅ Muestra viajes de 2027
   ✅ Indicador dice "Ejercicio 2027"
6. Volver a "Gestión 2027"
7. Verificar:
   ✅ Sigue mostrando expedientes de 2027
   ✅ NO se reseteó a 2026
```

### ✅ Prueba 3: Títulos dinámicos

```
1. Selector en "2026"
2. Ver menú lateral:
   ✅ "Planning 2026"
   ✅ "Gestión 2026"
3. Cambiar selector a "2028"
4. Ver menú lateral (actualización inmediata):
   ✅ "Planning 2028"
   ✅ "Gestión 2028"
5. Cambiar a "2030"
6. Ver menú lateral:
   ✅ "Planning 2030"
   ✅ "Gestión 2030"
```

### ✅ Prueba 4: Consola de eventos

```
1. Abrir consola (F12)
2. Cambiar selector: 2026 → 2027
3. Verificar logs:
   ✅ Ejercicio guardado: 2027
   📅 Ejercicio cambiado globalmente a: 2027
4. Ir a Planning
5. Verificar log adicional:
   📅 Ejercicio cambiado globalmente a: 2027
```

---

## 🛡️ CARACTERÍSTICAS PRESERVADAS

### ✅ No se han tocado:

1. **Combobox de clientes**
   - ✅ Muestra todos al hacer clic
   - ✅ Autocompletado funcional
   - ✅ Creación on-the-fly

2. **Edición de fechas**
   - ✅ Calendario nativo funcional
   - ✅ Guardado y reordenación automática
   - ✅ Funciona para cualquier año

3. **Confirmación de borrado**
   - ✅ `window.confirm()` activo
   - ✅ "¿Está seguro de que desea eliminar...?"

4. **Orden cronológico**
   - ✅ Arrancapins (16/01) primero
   - ✅ Solo por fecha para activos

---

## 📁 ARCHIVOS MODIFICADOS/CREADOS

1. ✅ **`src/utils/ejercicioGlobal.js`** (NUEVO)
   - Gestión centralizada del ejercicio
   - Persistencia en localStorage
   - Sistema de eventos pub/sub
   - Validación de rango 2026-2036

2. ✅ **`src/components/Layout.jsx`**
   - Selector global en sidebar
   - Títulos dinámicos en menú
   - Sincronización con eventos globales

3. ✅ **`src/pages/Expedientes.jsx`**
   - Lectura de ejercicio global
   - Suscripción a cambios
   - Eliminación de selector local
   - Indicador informativo

4. ✅ **`src/pages/Planning.jsx`**
   - Lectura de ejercicio global
   - Suscripción a cambios
   - Eliminación de selector local
   - Indicador informativo

**Linting:** ✅ 0 errores

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Ejercicio global:
- [x] Crear utilidad `ejercicioGlobal.js`
- [x] Persistencia en localStorage
- [x] Sistema de eventos (pub/sub)
- [x] Validación de rango 2026-2036
- [x] Valor por defecto: 2026

### Selector único:
- [x] Añadir selector en sidebar
- [x] Manejar cambios con `setEjercicioActual()`
- [x] Guardar en localStorage al cambiar
- [x] Notificar a todos los componentes

### Títulos dinámicos:
- [x] Actualizar label de "Planning" con ejercicio
- [x] Actualizar label de "Gestión" con ejercicio
- [x] Sincronización automática con selector

### Sincronización:
- [x] Expedientes lee ejercicio global
- [x] Planning lee ejercicio global
- [x] Suscripción a cambios en ambos
- [x] Actualización automática de datos

### Limpieza:
- [x] Eliminar selector de Expedientes
- [x] Eliminar selector de Planning
- [x] Añadir indicadores informativos
- [x] Eliminar variables `añosDisponibles` locales

### Preservación:
- [x] Combobox de clientes intacto
- [x] Edición de fechas intacta
- [x] Confirmación de borrado activa
- [x] Orden cronológico funcional

---

## 🎓 INSTRUCCIONES PARA EL USUARIO

### Para cambiar de ejercicio:

1. **Buscar selector** en sidebar (debajo del logo)
2. **Hacer clic** en el selector "EJERCICIO"
3. **Seleccionar año** (2026, 2027, 2028, etc.)
4. **Observar cambios:**
   - Títulos del menú se actualizan
   - Vista actual recarga con datos del nuevo año
5. **Navegar** entre Planning y Gestión
6. **Verificar:** Ambos muestran el mismo año

### Para verificar persistencia:

1. **Cambiar ejercicio** a 2027
2. **Navegar** entre vistas (Planning, Gestión, Clientes)
3. **Refrescar página** (F5)
4. **Verificar:**
   - Selector sigue en 2027
   - Títulos siguen mostrando 2027
   - Datos siguen siendo de 2027

### Para depurar:

1. **Abrir consola** (F12)
2. **Ejecutar:**
   ```javascript
   localStorage.getItem('ejercicioActual')
   ```
3. **Debe mostrar:** El año actual seleccionado
4. **Para cambiar manualmente:**
   ```javascript
   localStorage.setItem('ejercicioActual', '2028')
   window.location.reload()
   ```

---

## 🚨 RESULTADO ESPERADO

### Estado global:

```
✅ CORRECTO:
- Cambio ejercicio en sidebar → Todos se actualizan
- Refresco página → Mantiene ejercicio seleccionado
- Navegación entre vistas → Mismo ejercicio
- Títulos del menú → Dinámicos según ejercicio

❌ INCORRECTO (si pasara):
- Cambio en sidebar → No se actualiza Planning
- Refresco página → Vuelve a 2026
- Voy a Planning → Ejercicio diferente que Gestión
- Títulos estáticos → Siempre "2026"
```

---

## 🔍 DEBUGGING

### Si el ejercicio no persiste:

1. **Verificar localStorage:**
   ```javascript
   console.log(localStorage.getItem('ejercicioActual'))
   ```
2. **Si es null:** No se está guardando
3. **Verificar:** Función `setEjercicioActual()` en `ejercicioGlobal.js`

### Si los títulos no se actualizan:

1. **Verificar** que Layout.jsx está importando `subscribeToEjercicioChanges`
2. **Verificar** que `menuItems` usa template literals: `` `Planning ${ejercicioActual}` ``
3. **Ver consola:** Buscar errores de React

### Si una vista no se sincroniza:

1. **Verificar** que el componente tiene `useEffect` con `subscribeToEjercicioChanges`
2. **Verificar** que el `unsubscribe` se retorna en el cleanup
3. **Ver consola:** Debe mostrar "📅 Ejercicio cambiado globalmente a: X"

---

## 📞 CARACTERÍSTICAS FINALES

### ✅ Ejercicio global:
- **Persistencia:** localStorage
- **Sincronización:** Eventos globales
- **Validación:** 2026-2036
- **Por defecto:** 2026

### ✅ Selector único:
- **Ubicación:** Sidebar (debajo del logo)
- **Afecta a:** Planning y Gestión
- **Visual:** Etiquetas descriptivas

### ✅ Títulos dinámicos:
- **Planning:** "Planning {año}"
- **Gestión:** "Gestión {año}"
- **Actualización:** Automática

### ✅ Preservado:
- **Combobox:** Clientes funcional
- **Fechas:** Edición con calendario
- **Seguridad:** Confirmaciones activas
- **Orden:** Cronológico correcto

---

**Documento generado:** 17 de Enero de 2026  
**Versión del ERP:** v3.7 - Ejercicio Global Persistente + Títulos Dinámicos  
**Estado:** ✅ COMPLETADO Y FUNCIONAL

**PRUEBA DE CONTROL:**
1. Cambiar ejercicio a 2027 en sidebar
2. Ver títulos del menú: "Planning 2027", "Gestión 2027"
3. Navegar entre vistas → Todas muestran 2027
4. Refrescar página → Sigue en 2027
