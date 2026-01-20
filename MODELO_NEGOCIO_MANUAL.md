# 💼 NUEVO MODELO DE NEGOCIO: PRECIO MANUAL + MARGEN INFORMATIVO

## 📅 Fecha: 16 de Enero de 2026

---

## 🎯 CAMBIO DE FILOSOFÍA COMERCIAL

### ❌ MODELO ANTERIOR (Automático):
```
Coste Real → Aplicar Margen % → Calcular Precio Venta
```

### ✅ MODELO ACTUAL (Manual):
```
Coste Real → TÚ DECIDES Precio Venta → Sistema Calcula Margen
```

---

## 🔄 CAMBIOS IMPLEMENTADOS

### 1. **PRECIO DE VENTA MANUAL** 

#### ✅ CAMPO EDITABLE Y DESTACADO:

**Ubicación**: Parámetros del Viaje (arriba)

```jsx
💰 Precio Venta al Cliente (€/pax) *
┌────────────────────────────────┐
│  380.00                        │ ← TÚ ESCRIBES AQUÍ
└────────────────────────────────┘
  ↑ Borde verde, fondo crema
  ↑ Letra más grande y negrita
```

**Características**:
- ✅ **Borde verde destacado** (`border-2 border-green-400`)
- ✅ **Fondo crema** (`bg-green-50`)
- ✅ **Letra grande y negrita** (`font-bold text-lg`)
- ✅ **Placeholder**: "Ej: 380.00"
- ✅ **Auto-selección** al hacer foco (Tab o click)
- ✅ **Scroll bloqueado** (no cambia con rueda del ratón)

---

### 2. **MARGEN INFORMATIVO (AUTOMÁTICO)**

#### 📊 CÁLCULO DINÁMICO:

```javascript
// FÓRMULA SIMPLE
Margen por Persona = Precio Venta - Coste Real

// Margen Porcentual (informativo)
Margen % = (Margen / Coste Real) × 100
```

#### 💡 EJEMPLO REAL:

| Concepto | Valor |
|----------|-------|
| **Coste Real por Persona** | 349,15€ |
| **Precio Venta (TÚ ESCRIBES)** | 380,00€ |
| **Margen por Persona** | **+30,85€** |
| **Margen Porcentual** | **8,84%** |
| **Pasajeros de Pago** | 40 |
| **Beneficio Total del Viaje** | **+1.234,00€** |

---

### 3. **VISUAL DIFERENCIADO (COLORES INTUITIVOS)**

#### 🎨 DISEÑO DE 3 COLUMNAS:

```
┌─────────────────┬─────────────────┬─────────────────┐
│  📊 COSTE REAL  │ 💰 PRECIO VENTA │  📈 MARGEN      │
│                 │                 │                 │
│  Azul Suave     │  Verde Fuerte   │ Verde/Rojo Auto │
│  349,15€        │  380,00€        │  +30,85€        │
│                 │  ↑ TÚ DECIDES   │  ↑ CALCULA SOLO │
└─────────────────┴─────────────────┴─────────────────┘
```

#### 🔵 **COSTE REAL (Azul Claro)**:
- Fondo: `bg-blue-50`
- Borde: `border-blue-200`
- Texto: `text-blue-900`
- **Significado**: "Esto es lo que cuesta el viaje"

#### 🟢 **PRECIO VENTA (Verde Destacado)**:
- Fondo: `bg-green-50`
- Borde: `border-green-400` (más grueso)
- Texto: `text-green-900`
- Shadow: `shadow-lg` (elevado)
- **Significado**: "AQUÍ ESCRIBES TÚ"

#### 🟢/🔴 **MARGEN (Dinámico)**:

**Si Margen ≥ 0 (Beneficio)**:
- Fondo: `bg-green-50`
- Borde: `border-green-400`
- Texto: `text-green-900`
- Icono: 📈 "Margen/Pax"
- Valor: `+30,85€`

**Si Margen < 0 (Pérdida)**:
- Fondo: `bg-red-50`
- Borde: `border-red-400`
- Texto: `text-red-900`
- Icono: ⚠️ "Pérdida/Pax"
- Valor: `-12,50€`

---

### 4. **BENEFICIO TOTAL DEL VIAJE**

#### 💼 CÁLCULO AUTOMÁTICO:

```javascript
Beneficio Total = Margen por Persona × Pasajeros de Pago
```

#### 📊 VISUALIZACIÓN DINÁMICA:

**Si Beneficio ≥ 0**:
```
┌────────────────────────────────────────────────┐
│ 💼 Beneficio Total del Viaje (40 pax de pago): │
│                                    +1.234,00€  │
└────────────────────────────────────────────────┘
   ↑ Fondo verde degradado
```

**Si Beneficio < 0**:
```
┌────────────────────────────────────────────────┐
│ 💼 Beneficio Total del Viaje (40 pax de pago): │
│                                      -500,00€  │
└────────────────────────────────────────────────┘
   ↑ Fondo rojo degradado (alerta)
```

---

## 🔢 LÓGICA TÉCNICA COMPLETA

### ✅ FLUJO DE CÁLCULO:

```javascript
// PASO 1: Calcular Coste Base (todos los servicios)
costeBasePorPersona = 
  Bus/pax + Guía/pax + Hotel + Seguro + Entradas + Restaurantes + Otros

// PASO 2: Calcular Gratuidades
costeBaseGratuidad = costeBasePorPersona // ✅ CONFIRMADO
costePlazasGratuitas = costeBaseGratuidad × numGratuidades
costeGratuidadesPorPax = costePlazasGratuitas / pasajerosDePago

// PASO 3: Calcular Coste Real
costeRealPorPersona = 
  costeBasePorPersona + costeGratuidadesPorPax + bonificación

// PASO 4: TÚ DECIDES EL PRECIO (MANUAL)
precioVentaPorPersona = [LO QUE TÚ ESCRIBAS]

// PASO 5: Sistema Calcula Margen (AUTOMÁTICO)
margenPorPersona = precioVentaPorPersona - costeRealPorPersona
margenPorcentaje = (margenPorPersona / costeRealPorPersona) × 100

// PASO 6: Beneficio Total
beneficioTotal = margenPorPersona × pasajerosDePago
```

---

## ✅ CONFIRMACIÓN: COSTE BASE DE GRATUIDAD

### 🎯 RESPUESTA A TU PREGUNTA:

> **"Confirma que el Coste Base de Gratuidad sea igual a la suma de todos los Coste Servicios Base"**

✅ **CONFIRMADO AL 100%**

```javascript
// Línea 206 de ExpedienteDetalle.jsx
const costeBaseGratuidad = costeBasePorPersona

// Donde costeBasePorPersona incluye TODO:
costeBasePorPersona = 
  costeBusPorPax +           // Bus prorrateado
  costeGuiaPorPax +          // Guía prorrateado
  costeGuiaLocalPorPax +     // Guía local (flexible)
  costeHotelPorPax +         // Hotel × noches
  costeSeguroPorPax +        // Seguro
  costeEntradasPorPax +      // Entradas
  costeRestaurantePorPax +   // Restaurantes (flexible)
  costeOtrosPorPax           // Otros gastos (flexible)
```

**NO incluye**:
- ❌ Gratuidades (se calculan después)
- ❌ Bonificación (se suma al final)

**Ejemplo**:
- Si Coste Base = **327,76€**
- Entonces Gratuidad = **327,76€**
- Con 2 gratuidades: **655,52€** total
- Prorrateo entre 40 pax: **16,39€/pax**

---

## 🎮 INTERFAZ DE USUARIO

### ✅ BOTÓN "AÑADIR SERVICIO" AL FINAL

**Estado Confirmado**:
- ✅ **Sin servicios**: Botón centrado "Añadir Primer Servicio"
- ✅ **Con servicios**: Botón al final de la tabla con borde superior
- ✅ **No requiere scroll** innecesario

```jsx
{/* Tabla de servicios... */}

{/* Botón Añadir Servicio al final */}
<div className="mt-4 pt-4 border-t border-gray-200">
  <button className="btn-primary w-full">
    <Plus size={20} />
    Añadir Servicio
  </button>
</div>
```

### ✅ COMPORTAMIENTO DE INPUTS

**Confirmado**:
- ✅ **Auto-selección**: Al hacer Tab/Click en campo con 0, se selecciona todo
- ✅ **Scroll bloqueado**: No cambia valores con rueda del ratón
- ✅ **Orden lógico**: Tab navega de izquierda a derecha, arriba a abajo

```javascript
const handleFocus = (e) => {
  if (e.target.value === '0' || parseFloat(e.target.value) === 0) {
    e.target.select() // ✅ Selecciona todo para reemplazar rápido
  }
}

const handleWheel = (e) => {
  e.target.blur() // ✅ Bloquea cambios accidentales
}
```

---

## 📊 COMPARATIVA VISUAL

### ANTES vs DESPUÉS:

| Aspecto | ❌ Antes | ✅ Después |
|---------|---------|-----------|
| **Entrada de Precio** | Sistema calcula solo | **TÚ ESCRIBES** (campo verde) |
| **Margen** | Introduces % para calcular | **Sistema calcula** automáticamente |
| **Visualización** | Todo igual, difícil leer | **3 colores** distintos (azul/verde/rojo) |
| **Pérdidas** | No se distinguen | **Rojo automático** si vendes por debajo |
| **Beneficio Total** | Escondido en cálculos | **Destacado arriba** en grande |

---

## 🚀 CÓMO USAR EL NUEVO SISTEMA

### 📝 FLUJO DE TRABAJO:

1. **Añadir todos los servicios** (Bus, Hotel, Guía, etc.)
2. **Completar parámetros**:
   - Total Pasajeros: `42`
   - Gratuidades: `2`
   - Días (Guía): `3`
   - Bonificación/Pax: `5`
3. **Ver el Coste Real calculado** (azul claro)
4. **DECIDIR tu Precio de Venta** (campo verde destacado)
   - Ejemplo: `380€`
5. **El sistema te muestra**:
   - Margen: `+30,85€` (verde si ganas)
   - Margen %: `8,84%`
   - Beneficio Total: `+1.234,00€`
6. **Guardar Cotización**

---

## 🛡️ BLINDAJES DE SEGURIDAD

### ✅ PROTECCIONES ACTIVAS:

1. **Precio Negativo Imposible**:
   ```javascript
   const precioVentaPorPersona = Math.max(0, parseFloat(precioVentaManual) || 0)
   ```

2. **División por Cero Prevención**:
   ```javascript
   const paxPago = Math.max(1, totalPasajeros - gratuidades)
   ```

3. **Margen con Coste Cero**:
   ```javascript
   const margenPorcentaje = costeRealPorPersona > 0 
     ? ((margenPorPersona / costeRealPorPersona) * 100) 
     : 0
   ```

4. **Try/Catch Global**: Cualquier error devuelve valores seguros

---

## 💾 DATOS GUARDADOS

### 📁 ESTRUCTURA DE LA COTIZACIÓN:

```javascript
cotizacion: {
  servicios: [...],
  numTotalPasajeros: 42,
  numGratuidades: 2,
  numDias: 3,
  bonificacionPorPersona: 5,
  precioVentaManual: 380, // ✅ NUEVO: Tu decisión
  resultados: {
    costeRealPorPersona: 349.15,
    precioVentaPorPersona: 380.00,
    margenPorPersona: 30.85,     // ✅ NUEVO: Calculado
    margenPorcentaje: 8.84,      // ✅ NUEVO: Informativo
    beneficioTotal: 1234.00,
    totalIngresos: 15200.00,
    totalGastos: 13966.00,
  }
}
```

---

## 🎯 VENTAJAS DEL NUEVO MODELO

### ✅ BENEFICIOS PARA TI:

1. **Control Total**: Tú decides el precio de venta final
2. **Transparencia**: Ves al instante si ganas o pierdes
3. **Rapidez**: No calculas mentalmente, el sistema te lo dice
4. **Alertas Visuales**: Rojo automático si vendes por debajo del coste
5. **Competitividad**: Puedes ajustar precios según el mercado
6. **Flexibilidad**: No estás atado a un margen fijo

---

## 📝 RESUMEN DE ARCHIVOS MODIFICADOS

| Archivo | Cambios |
|---------|---------|
| `src/components/ExpedienteDetalle.jsx` | ✅ Estado `precioVentaManual` añadido<br>✅ Función `calcularCotizacion` actualizada<br>✅ Campo "Precio Venta" reemplaza "Margen %"<br>✅ Resumen Comercial rediseñado (3 columnas)<br>✅ Beneficio Total destacado<br>✅ Colores diferenciados (azul/verde/rojo)<br>✅ Función `guardarCotizacion` actualizada |

---

## ✅ VALIDACIÓN COMPLETA

### 🧪 TESTS REALIZADOS:

1. **Linter**: ✅ 0 errores
2. **Campo Precio Venta**: ✅ Destacado en verde
3. **Margen Informativo**: ✅ Cálculo automático correcto
4. **Colores Dinámicos**: ✅ Verde si ganas, Rojo si pierdes
5. **Coste Base Gratuidad**: ✅ Suma de TODOS los servicios
6. **Botón Añadir Servicio**: ✅ Al final de la lista
7. **Inputs UX**: ✅ Auto-selección y scroll bloqueado

---

## 🎨 VISTA PREVIA FINAL

```
┌──────────────────────────────────────────────────────────┐
│  Parámetros del Viaje                                    │
├──────────────────────────────────────────────────────────┤
│  Total Pasajeros: 42  │  Gratuidades: 2  │  Días: 3     │
│  Bonificación: 5€     │  💰 Precio Venta: [380€] ← TÚ   │
│                          ↑ Verde, destacado, grande      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  💼 Resumen Comercial                                    │
├──────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
│  │ 📊 COSTE  │  │ 💰 VENTA  │  │ 📈 MARGEN │           │
│  │ Azul Suave│  │Verde Fuerte│  │Verde Auto │           │
│  │  349,15€  │  │  380,00€  │  │ +30,85€   │           │
│  │           │  │  ↑ MANUAL │  │  8,84%    │           │
│  └───────────┘  └───────────┘  └───────────┘           │
│                                                          │
│  💼 Beneficio Total del Viaje (40 pax): +1.234,00€      │
│     ↑ Fondo verde si ganas, rojo si pierdes             │
└──────────────────────────────────────────────────────────┘
```

---

## 🔗 DOCUMENTOS RELACIONADOS

- `AJUSTE_GRATUIDADES_UX.md` - Cálculo de gratuidades corregido
- `ARQUITECTURA_NUEVA.md` - Estructura del componente
- `UX_PROFESIONAL.md` - Mejoras de experiencia de usuario

---

## ✨ CONCLUSIÓN

**NUEVO MODELO OPERATIVO AL 100%**

Ahora tienes:
- ✅ **Control manual del precio de venta** (tú decides)
- ✅ **Margen informativo automático** (el sistema calcula)
- ✅ **Alertas visuales** (verde si ganas, rojo si pierdes)
- ✅ **Coste Base de Gratuidad correcto** (suma de TODOS los servicios)
- ✅ **Interfaz optimizada** (botón al final, inputs inteligentes)

**El sistema te dice si ganas o pierdes, pero tú siempre tienes el control.**

---

*Última actualización: 16 de Enero de 2026 - Sistema en Producción*
