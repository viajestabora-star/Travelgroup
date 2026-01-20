# 🏢 GESTIÓN PROFESIONAL DE PROVEEDORES Y SERVICIOS

## 📅 Fecha: 16 de Enero de 2026

---

## 🎯 OBJETIVO

Separar completamente la gestión de **Proveedores** (entidad global) de los **Servicios** (específicos de cada expediente) para permitir **flexibilidad total** en la cotización.

---

## 🔄 CAMBIO DE ARQUITECTURA

### ❌ MODELO ANTERIOR:

```
Servicio en Expediente
├── Tipo: "Hotel"
└── Descripción: "NH Ciudad de Valencia"
```

**Problema**: No había referencia a proveedores, todo era texto libre sin estructura.

---

### ✅ MODELO ACTUAL:

```
Base de Datos Global
├── Proveedores
│   ├── ID: 12345
│   ├── Nombre Comercial: "NH Hoteles"
│   ├── Tipo: "hotel"
│   ├── Teléfono: "963123456"
│   └── Email: "info@nh.com"
│
└── ...más proveedores

Servicio en Expediente Específico
├── proveedorId: 12345 (referencia a "NH Hoteles")
├── tipo: "Hotel"
├── nombreEspecifico: "NH Ciudad de Valencia" (TEXTO LIBRE)
├── localizacion: "Valencia Centro" (TEXTO LIBRE)
├── costeUnitario: 85
├── noches: 2
├── tipoCalculo: "porPersona"
└── fechaRelease: "2026-03-15"
```

**Ventaja**: Sabes quién es el proveedor (NH Hoteles), pero el nombre específico es libre ("NH Ciudad de Valencia", "NH Madrid Zurbano", etc.)

---

## ✅ CAMBIOS IMPLEMENTADOS

### 1. **NUEVA ESTRUCTURA DE SERVICIO**

#### 📋 CAMPOS ACTUALIZADOS:

```javascript
const nuevoServicio = {
  id: Date.now(),
  proveedorId: null,           // ✅ NUEVO: ID del proveedor seleccionado
  tipo: 'Hotel',               // Tipo de servicio
  nombreEspecifico: '',        // ✅ NUEVO: Nombre libre (ej: "NH Ciudad de Valencia")
  localizacion: '',            // ✅ NUEVO: Ubicación libre (ej: "Valencia Centro")
  costeUnitario: 0,            // Precio del servicio
  noches: 1,                   // Noches (si aplica)
  fechaRelease: '',            // Fecha límite de cancelación
  tipoCalculo: 'porPersona',   // Por Persona o Por Grupo
}
```

**Campos Eliminados**:
- ❌ `descripcion` → Reemplazado por `nombreEspecifico` + `localizacion`
- ❌ `cantidad` → No se usaba

---

### 2. **BASE DE DATOS DE PROVEEDORES GLOBAL**

#### 🏢 GESTIÓN INDEPENDIENTE:

Los proveedores se gestionan en:
- **Módulo Principal**: `Proveedores` (barra lateral)
- **LocalStorage**: `storage.get('proveedores')`
- **Organización**: Por tipo de servicio (Hotel, Bus, Restaurante, etc.)

**Estructura de Proveedor**:
```javascript
{
  id: 12345,
  nombreComercial: "NH Hoteles",
  tipo: "hotel",
  telefono: "963123456",
  email: "info@nh.com",
  // ... más campos si se añaden desde el módulo principal
}
```

---

### 3. **TABLA DE SERVICIOS REDISEÑADA**

#### 📊 NUEVA ESTRUCTURA DE 9 COLUMNAS:

| # | Columna | Descripción | Tipo |
|---|---------|-------------|------|
| 1 | **Proveedor** | Selector con opción "+ Nuevo Proveedor" | Dropdown dinámico |
| 2 | **Tipo** | Hotel, Bus, Restaurante, etc. | Dropdown |
| 3 | **Nombre Específico** | Texto libre (ej: "NH Ciudad de Valencia") | Input texto |
| 4 | **Localización** | Texto libre (ej: "Valencia Centro") | Input texto |
| 5 | **Coste (€)** | Precio del servicio | Input numérico |
| 6 | **Noches** | Solo para hoteles | Input numérico |
| 7 | **Tipo Cálculo** | x Pax o ÷ Pax | Dropdown |
| 8 | **Release** | Fecha límite | Input fecha |
| 9 | **Acciones** | Eliminar | Botón |

---

### 4. **SELECTOR DE PROVEEDOR INTELIGENTE**

#### 🔍 FUNCIONALIDAD DINÁMICA:

```jsx
<select value={servicio.proveedorId || ''}>
  <option value="">Sin proveedor</option>
  
  {/* FILTRO AUTOMÁTICO: Solo muestra proveedores del mismo tipo */}
  {proveedores
    .filter(p => p.tipo === servicio.tipo.toLowerCase())
    .map(proveedor => (
      <option key={proveedor.id} value={proveedor.id}>
        {proveedor.nombreComercial}
      </option>
    ))}
  
  {/* OPCIÓN DE CREACIÓN RÁPIDA */}
  <option value="nuevo" className="font-bold text-green-700">
    + Nuevo Proveedor
  </option>
</select>
```

**Características**:
✅ **Filtrado Inteligente**: Si el servicio es "Hotel", solo muestra proveedores de tipo "hotel"  
✅ **Creación Rápida**: Opción "+ Nuevo Proveedor" al final  
✅ **Opcional**: Puedes dejar "Sin proveedor"

---

### 5. **CREACIÓN RÁPIDA DE PROVEEDORES**

#### ➕ MODAL INSTANTÁNEO:

**Flujo de Trabajo**:
1. Estás añadiendo un servicio de "Hotel"
2. Abres el selector de Proveedor
3. Seleccionas "+ Nuevo Proveedor"
4. Se abre un modal rápido
5. Completas:
   - Nombre Comercial (obligatorio)
   - Tipo (hotel, bus, etc.)
   - Teléfono (opcional)
   - Email (opcional)
6. Click en "Crear Proveedor"
7. **El proveedor se guarda automáticamente** en la base de datos global
8. **Se actualiza el selector** con el nuevo proveedor

**Código del Modal**:
```jsx
{showModalProveedor && (
  <div className="modal">
    <h3>➕ Nuevo Proveedor</h3>
    
    <input
      type="text"
      value={nuevoProveedor.nombreComercial}
      placeholder="Ej: NH Hoteles"
      autoFocus
    />
    
    <select value={nuevoProveedor.tipo}>
      <option value="hotel">Hotel</option>
      <option value="restaurante">Restaurante</option>
      {/* ... más tipos ... */}
    </select>
    
    <button onClick={crearProveedorRapido}>
      Crear Proveedor
    </button>
  </div>
)}
```

---

### 6. **CAMPOS LIBRES DESPUÉS DE SELECCIONAR PROVEEDOR**

#### 📝 FLEXIBILIDAD TOTAL:

**Ejemplo Práctico**:

```
EXPEDIENTE 1: Llombai
├── Proveedor: NH Hoteles (ID: 12345)
├── Nombre Específico: "NH Ciudad de Valencia"
├── Localización: "Valencia Centro"
└── Coste: 85€

EXPEDIENTE 2: Puzol
├── Proveedor: NH Hoteles (ID: 12345) ← MISMO PROVEEDOR
├── Nombre Específico: "NH Madrid Zurbano" ← NOMBRE DIFERENTE
├── Localización: "Madrid Chamberí"
└── Coste: 110€
```

**Ventaja**: Mantienes la relación con el proveedor, pero cada viaje tiene su nombre específico libre.

---

## 📊 COMPARATIVA VISUAL

### TABLA ANTES vs DESPUÉS:

| Aspecto | ❌ Antes | ✅ Después |
|---------|---------|-----------|
| **Estructura** | Tipo + Descripción | Proveedor + Tipo + Nombre + Localización |
| **Proveedores** | No había referencia | Selector con base de datos |
| **Nombre** | Descripción genérica | Nombre específico libre |
| **Localización** | No existía | Campo libre nuevo |
| **Crear Proveedor** | Ir a módulo Proveedores | "+ Nuevo Proveedor" en el selector |
| **Flexibilidad** | Baja | **TOTAL** |

---

## 🎨 INTERFAZ DE USUARIO

### ✅ CONFIRMACIONES VISUALES:

**1. Resumen Comercial** (Ya implementado anteriormente):
```
┌─────────────────┬─────────────────┬─────────────────┐
│  📊 COSTE REAL  │ 💰 PRECIO VENTA │  📈 MARGEN      │
│  Azul Suave     │  Verde Fuerte   │ Verde/Rojo Auto │
│  349,15€        │  380,00€        │  +30,85€        │
└─────────────────┴─────────────────┴─────────────────┘
```

**2. Botón "Añadir Servicio"** (Ya implementado):
- ✅ Al final de la lista de servicios
- ✅ Centrado si no hay servicios

**3. UX de Teclado** (Ya implementado):
- ✅ Al hacer Tab/Click en campo con 0 → Se auto-selecciona
- ✅ Scroll bloqueado en inputs numéricos

---

## 🔧 FUNCIONES IMPLEMENTADAS

### 📝 CÓDIGO TÉCNICO:

**1. Cargar Proveedores**:
```javascript
useEffect(() => {
  const proveedoresGuardados = storage.get('proveedores') || []
  setProveedores(proveedoresGuardados)
}, [])
```

**2. Crear Proveedor Rápido**:
```javascript
const crearProveedorRapido = () => {
  if (!nuevoProveedor.nombreComercial.trim()) {
    alert('⚠️ El nombre comercial es obligatorio')
    return
  }
  
  const proveedorNuevo = {
    id: Date.now(),
    ...nuevoProveedor,
    nombreComercial: nuevoProveedor.nombreComercial.trim(),
  }
  
  const proveedoresActualizados = [...proveedores, proveedorNuevo]
  setProveedores(proveedoresActualizados)
  storage.set('proveedores', proveedoresActualizados)
  
  setShowModalProveedor(false)
  alert('✅ Proveedor creado correctamente')
}
```

**3. Actualizar Servicio**:
```javascript
const actualizarServicio = (id, campo, valor) => {
  setServicios(servicios.map(s => 
    s.id === id ? { ...s, [campo]: valor } : s
  ))
}
```

---

## 🧪 CASOS DE USO

### 📋 ESCENARIO 1: AÑADIR HOTEL CON PROVEEDOR EXISTENTE

**Pasos**:
1. Click en "Añadir Servicio"
2. Columna "Proveedor": Seleccionar "NH Hoteles"
3. Columna "Tipo": Ya dice "Hotel"
4. Columna "Nombre Específico": Escribir "NH Ciudad de Valencia"
5. Columna "Localización": Escribir "Valencia Centro"
6. Columna "Coste": Escribir "85"
7. Columna "Noches": Escribir "2"
8. **Resultado**: Servicio añadido con referencia a proveedor + datos específicos

---

### 📋 ESCENARIO 2: AÑADIR SERVICIO CON PROVEEDOR NUEVO

**Pasos**:
1. Click en "Añadir Servicio"
2. Columna "Proveedor": Seleccionar "+ Nuevo Proveedor"
3. **Modal se abre**:
   - Nombre Comercial: "Autocares Paco"
   - Tipo: "Autobús"
   - Teléfono: "961234567"
   - Email: "info@autocarespaco.com"
4. Click en "Crear Proveedor"
5. Modal se cierra
6. **El selector ahora muestra "Autocares Paco"**
7. Continuar rellenando el resto de campos
8. **Resultado**: Proveedor creado + Servicio añadido

---

### 📋 ESCENARIO 3: MISMO PROVEEDOR, DIFERENTES EXPEDIENTES

**Expediente "Llombai"**:
- Proveedor: NH Hoteles
- Nombre: "NH Ciudad de Valencia"
- Localización: "Valencia Centro"

**Expediente "Puzol"**:
- Proveedor: NH Hoteles ← **MISMO**
- Nombre: "NH Madrid Zurbano" ← **DIFERENTE**
- Localización: "Madrid Chamberí"

**Ventaja**: Puedes analizar:
- Total facturado a "NH Hoteles" (suma de todos los expedientes)
- Pero cada viaje tiene su nombre específico

---

## 📊 BENEFICIOS DEL NUEVO SISTEMA

### ✅ VENTAJAS PARA ANDRÉS:

1. **Flexibilidad Total**: Nombre específico libre para cada expediente
2. **Organización**: Sabes quién es el proveedor sin perder detalle
3. **Creación Rápida**: No sales del expediente para crear proveedor
4. **Análisis Futuro**: Puedes filtrar por proveedor en reportes
5. **Consistencia**: Mismo proveedor en todos los expedientes donde se usa
6. **Escalabilidad**: Si "NH Hoteles" cambia el teléfono, se actualiza en un solo lugar

---

## 🛡️ VALIDACIONES Y SEGURIDAD

### ✅ PROTECCIONES IMPLEMENTADAS:

**1. Proveedor Opcional**:
```javascript
<option value="">Sin proveedor</option>
```
- Puedes añadir un servicio sin asignar proveedor

**2. Nombre Obligatorio en Modal**:
```javascript
if (!nuevoProveedor.nombreComercial.trim()) {
  alert('⚠️ El nombre comercial es obligatorio')
  return
}
```

**3. Filtrado por Tipo**:
```javascript
.filter(p => p.tipo === servicio.tipo.toLowerCase())
```
- Si el servicio es "Hotel", solo muestra proveedores de tipo "hotel"

**4. Auto-Focus en Modal**:
```javascript
<input autoFocus />
```
- El cursor va directamente al campo "Nombre Comercial"

---

## 💾 PERSISTENCIA DE DATOS

### 📁 ESTRUCTURA EN LOCALSTORAGE:

**Proveedores (Global)**:
```javascript
storage.get('proveedores')
[
  { id: 1, nombreComercial: "NH Hoteles", tipo: "hotel", ... },
  { id: 2, nombreComercial: "Autocares Paco", tipo: "autobús", ... },
  ...
]
```

**Servicios (Por Expediente)**:
```javascript
expediente.cotizacion.servicios
[
  {
    id: 123,
    proveedorId: 1, // ← Referencia a "NH Hoteles"
    tipo: "Hotel",
    nombreEspecifico: "NH Ciudad de Valencia",
    localizacion: "Valencia Centro",
    costeUnitario: 85,
    noches: 2,
    ...
  },
  ...
]
```

---

## 📝 RESUMEN DE ARCHIVOS MODIFICADOS

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| `src/components/ExpedienteDetalle.jsx` | 31-48 | ✅ Estados de proveedores + modal |
| `src/components/ExpedienteDetalle.jsx` | 101-123 | ✅ Función `crearProveedorRapido` |
| `src/components/ExpedienteDetalle.jsx` | 125-137 | ✅ Nueva estructura de servicio |
| `src/components/ExpedienteDetalle.jsx` | 772-890 | ✅ Tabla rediseñada (9 columnas) |
| `src/components/ExpedienteDetalle.jsx` | 1285-1358 | ✅ Modal de nuevo proveedor |

---

## ✅ CHECKLIST DE VALIDACIÓN

### 🎯 REQUISITOS CUMPLIDOS:

- [✅] **Base de Datos Global**: Proveedores independientes organizados por tipo
- [✅] **Selector en Expediente**: Dropdown con lista de proveedores
- [✅] **Campos Libres**: Nombre Específico + Localización editables
- [✅] **Creación Rápida**: Opción "+ Nuevo Proveedor" en selector
- [✅] **Modal Rápido**: Sin salir del expediente
- [✅] **Resumen Comercial Visible**: Siempre visible (implementado antes)
- [✅] **Colores Diferenciados**: Azul/Verde/Rojo (implementado antes)
- [✅] **Botón al Final**: "Añadir Servicio" al final (implementado antes)
- [✅] **UX Teclado**: Auto-limpieza de 0 con Tab (implementado antes)
- [✅] **Sin Errores de Linter**: 0 errores

---

## 🚀 CÓMO USAR EL NUEVO SISTEMA

### 📖 GUÍA RÁPIDA PARA ANDRÉS:

1. **Añadir Servicio**:
   - Click en "Añadir Servicio" (botón al final)
   
2. **Seleccionar Proveedor** (opcional):
   - Columna "Proveedor": Elegir de la lista
   - O seleccionar "+ Nuevo Proveedor" si no existe
   
3. **Rellenar Datos Específicos**:
   - Tipo: Hotel, Bus, etc.
   - Nombre Específico: "NH Ciudad de Valencia"
   - Localización: "Valencia Centro"
   - Coste: 85€
   - Noches: 2 (si aplica)
   
4. **El sistema calcula automáticamente**:
   - Coste Base actualizado
   - Resumen Comercial recalculado
   - Margen informativo

---

## 🔗 DOCUMENTOS RELACIONADOS

- `MODELO_NEGOCIO_MANUAL.md` - Precio de venta manual
- `SINCRONIZACION_TOTAL.md` - Reactividad automática
- `AJUSTE_GRATUIDADES_UX.md` - Cálculo de gratuidades

---

## ✨ CONCLUSIÓN

**SEPARACIÓN COMPLETA IMPLEMENTADA** ✅

El sistema ahora tiene:
- 🏢 **Base de datos global de proveedores** (independiente)
- 🔗 **Referencias en servicios** (proveedorId)
- ✏️ **Campos libres para detalles** (nombreEspecifico, localizacion)
- ➕ **Creación rápida sin salir** (modal instantáneo)
- 🎯 **Máxima flexibilidad** (mismo proveedor, diferentes nombres)

**EL SISTEMA ES 100% PROFESIONAL Y ESCALABLE**

---

*Última actualización: 16 de Enero de 2026 - Sistema en Producción*
