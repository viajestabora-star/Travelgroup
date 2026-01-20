# 💰 Lógica de Costes Completa - Calculadora Actualizada

## 🎯 NUEVAS FUNCIONALIDADES IMPLEMENTADAS

**Fecha:** 2026-01-16  
**Estado:** ✅ **COMPLETADO Y FUNCIONAL**  
**Versión:** 3.0 (Calculadora Completa)

---

## ✅ FÓRMULA DE SUMA TOTAL COMPLETA

### Coste Real por Persona = TODO INCLUIDO

```javascript
const costeRealPorPersona = 
  costeBusPorPax +                    // Autobús (dividido)
  costeGuiaPorPax +                   // Guía (dividido por días)
  costeGuiaLocalPorPax +              // Guía Local (flexible) ✅ NUEVO
  costeHotelPorPax +                  // Hotel (por noche)
  costeSeguroPorPax +                 // Seguro (por persona)
  costeEntradasPorPax +               // Entradas (por persona)
  costeRestaurantePorPax +            // Restaurantes (flexible) ✅ NUEVO
  costeOtrosPorPax +                  // Otros gastos (flexible) ✅ NUEVO
  costeGratuidadesPorPax +            // Gratuidades prorrateadas
  bonif                                // Bonificación
```

**Incluye:**
- ✅ Bus
- ✅ Guía
- ✅ **Guía Local** (NUEVO)
- ✅ Hoteles (con noches)
- ✅ Seguro
- ✅ Entradas/Tickets
- ✅ **Restaurantes** (NUEVO)
- ✅ **Otros Gastos** (NUEVO)
- ✅ Gratuidades prorrateadas
- ✅ Bonificación por persona

---

## 🗺️ NUEVA CATEGORÍA: GUÍA LOCAL

### Dos Opciones de Cálculo

#### **Opción A: Por Grupo (Importe Fijo)**
```javascript
if (tipoCalculo === 'porGrupo') {
  // Se divide el total entre los Pasajeros de Pago
  costeGuiaLocalPorPax += paxPago > 0 ? coste / paxPago : 0
}
```

**Ejemplo:**
- Guía Local: 200€ total
- Pasajeros de Pago: 40
- **Coste por Pax:** 200 / 40 = 5€/persona

#### **Opción B: Por Persona**
```javascript
else {
  // Se suma directamente el precio por persona
  costeGuiaLocalPorPax += coste
}
```

**Ejemplo:**
- Guía Local: 5€ por persona
- **Coste por Pax:** 5€/persona (directo)

---

## 🍽️ NUEVAS CATEGORÍAS: RESTAURANTES Y OTROS

### Cálculo Flexible

Ambas categorías tienen **dos opciones de cálculo** seleccionables:

#### **Restaurantes**
```javascript
if (servicio.tipo === 'Restaurante') {
  if (tipoCalculo === 'porGrupo') {
    // Menú grupal dividido entre pasajeros de pago
    costeRestaurantePorPax += paxPago > 0 ? coste / paxPago : 0
  } else {
    // Menú individual por persona
    costeRestaurantePorPax += coste
  }
}
```

**Ejemplos:**

**Caso 1: Menú Grupal**
- Comida grupal: 1200€ total
- Pasajeros de Pago: 40
- Tipo: "Por Grupo"
- **Resultado:** 1200 / 40 = 30€/persona

**Caso 2: Menú Individual**
- Menú individual: 30€ por persona
- Tipo: "Por Persona"
- **Resultado:** 30€/persona (directo)

#### **Otros Gastos**
```javascript
if (servicio.tipo === 'Otros') {
  if (tipoCalculo === 'porGrupo') {
    // Gasto grupal (ej: parking, propinas)
    costeOtrosPorPax += paxPago > 0 ? coste / paxPago : 0
  } else {
    // Gasto individual (ej: kit viajero)
    costeOtrosPorPax += coste
  }
}
```

---

## 🎨 INTERFAZ MEJORADA

### Nueva Columna: "Tipo de Cálculo"

| Tipo | Descripción | Coste | Noches | **Tipo Cálculo** | Fecha Release | Acciones |
|------|-------------|-------|--------|------------------|---------------|----------|
| Hotel | Hotel Mar | 50€ | 3 | *Por Persona* | 01/03/2026 | 🗑️ |
| Autobús | Autocar | 800€ | - | *Por Grupo* | - | 🗑️ |
| Guía Local | Guía Valencia | 150€ | - | **Por Grupo** ⬇️ | - | 🗑️ |
| Restaurante | Almuerzo | 25€ | - | **Por Persona** ⬇️ | - | 🗑️ |
| Otros | Parking | 50€ | - | **Por Grupo** ⬇️ | - | 🗑️ |

**Servicios con Selector:**
- ✅ **Guía Local** → Dropdown: "Por Persona" / "Por Grupo"
- ✅ **Restaurante** → Dropdown: "Por Persona" / "Por Grupo"
- ✅ **Otros** → Dropdown: "Por Persona" / "Por Grupo"

**Servicios con Cálculo Fijo:**
- 🔒 **Autobús** → "Por Grupo" (siempre)
- 🔒 **Guía** → "Por Grupo" (siempre)
- 🔒 **Hotel** → "Por Persona" (siempre)
- 🔒 **Seguro** → "Por Persona" (siempre)
- 🔒 **Entradas/Tickets** → "Por Persona" (siempre)

---

## 🔄 ACTUALIZACIÓN AUTOMÁTICA EN TIEMPO REAL

### React Recalcula Automáticamente

```javascript
const resultados = calcularCotizacion()
```

**Cada vez que cambias:**
- ✅ Añades un servicio → Se recalcula al instante
- ✅ Modificas el coste → Se recalcula al instante
- ✅ Cambias el tipo de cálculo → Se recalcula al instante
- ✅ Añades un restaurante → Se recalcula al instante
- ✅ Añades un "Otros" → Se recalcula al instante
- ✅ Cambias noches de hotel → Se recalcula al instante

**No necesitas recargar la página.** Todo se actualiza en vivo.

---

## 📊 RESUMEN FINANCIERO MEJORADO

### Visualización por Categorías

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Gastos Fijos (divididos) */}
  <div className="bg-blue-50">🚌 Autobús/Pax: {costeBusPorPax}€</div>
  <div className="bg-blue-50">👤 Guía/Pax: {costeGuiaPorPax}€</div>
  <div className="bg-teal-50">🗺️ Guía Local/Pax: {costeGuiaLocalPorPax}€</div>
  
  {/* Servicios Individuales */}
  <div className="bg-purple-50">🏨 Hotel/Pax: {costeHotelPorPax}€</div>
  <div className="bg-purple-50">🛡️ Seguro/Pax: {costeSeguroPorPax}€</div>
  <div className="bg-purple-50">🎫 Entradas/Pax: {costeEntradasPorPax}€</div>
  
  {/* NUEVOS */}
  <div className="bg-amber-50">🍽️ Restaurantes/Pax: {costeRestaurantePorPax}€</div>
  <div className="bg-gray-100">📦 Otros Gastos/Pax: {costeOtrosPorPax}€</div>
  
  {/* Gratuidades y Bonificación */}
  <div className="bg-orange-50">Gratuidades/Pax: {costeGratuidadesPorPax}€</div>
  <div className="bg-yellow-50">Bonificación: {bonificacion}€</div>
  
  {/* TOTAL FINAL */}
  <div className="bg-red-100">💰 COSTE REAL/PAX: {costeRealPorPersona}€</div>
  <div className="bg-navy-900 text-white">🎯 PRECIO VENTA/PAX: {precioVentaPorPersona}€</div>
</div>
```

**Características:**
- ✅ Colores por categoría
- ✅ Emojis para identificación rápida
- ✅ Solo muestra categorías con valor > 0
- ✅ Totales destacados con colores fuertes

---

## 🛡️ REGLA DE ORO APLICADA

### Pasajeros de Pago en TODOS los Cálculos

```javascript
const paxPago = Math.max(1, (parseInt(numTotalPasajeros) || 1) - (parseInt(numGratuidades) || 0))
```

**Usado en:**
- ✅ Autobús: `coste / paxPago`
- ✅ Guía: `(coste * dias) / paxPago`
- ✅ Guía Local (Por Grupo): `coste / paxPago`
- ✅ Restaurante (Por Grupo): `coste / paxPago`
- ✅ Otros (Por Grupo): `coste / paxPago`
- ✅ Gratuidades prorrateadas: `costePlazasGratuitas / paxPago`

**Garantía:** `paxPago` **NUNCA** será 0. Siempre mínimo 1.

---

## 📋 EJEMPLOS PRÁCTICOS

### Ejemplo 1: Viaje Completo

**Parámetros:**
- Total Pasajeros: 42
- Gratuidades: 2
- **Pasajeros de Pago:** 40
- Días (Guía): 3
- Margen: 15%

**Servicios:**

| Tipo | Descripción | Coste | Noches | Tipo Cálculo | Coste/Pax |
|------|-------------|-------|--------|--------------|-----------|
| Autobús | Autocar 55 plazas | 1200€ | - | Por Grupo | 30€ |
| Guía | Guía titular | 400€ | 3 | Por Grupo | 30€ |
| Guía Local | Guía Valencia | 200€ | - | Por Grupo | 5€ |
| Hotel | Hotel 4* | 45€/noche | 2 | Por Persona | 90€ |
| Seguro | Seguro viaje | 8€ | - | Por Persona | 8€ |
| Entradas | Oceanogràfic | 28€ | - | Por Persona | 28€ |
| Restaurante | Almuerzo día 1 | 22€ | - | Por Persona | 22€ |
| Restaurante | Cena día 2 | 960€ | - | Por Grupo | 24€ |
| Otros | Parking bus | 80€ | - | Por Grupo | 2€ |

**Cálculo Gratuidades:**
- Coste individual: 90 + 8 + 28 + 22 = 148€
- Coste 2 gratuidades: 148 × 2 = 296€
- Prorrateado: 296 / 40 = 7.40€/pax

**Bonificación:** 5€/pax

**COSTE REAL POR PERSONA (PAGADOR):**
```
30 (bus) + 30 (guía) + 5 (guía local) + 90 (hotel) + 8 (seguro) + 
28 (entradas) + 22 (almuerzo) + 24 (cena) + 2 (parking) + 
7.40 (gratuidades) + 5 (bonificación) = 251.40€
```

**COSTE TOTAL VIAJE:** 251.40 × 40 = 10,056€

**BENEFICIO (15%):** 10,056 × 0.15 = 1,508.40€

**PRECIO VENTA TOTAL:** 10,056 + 1,508.40 = 11,564.40€

**PRECIO VENTA POR PERSONA:** 11,564.40 / 40 = **289.11€**

---

## 🎯 COMPARACIÓN: ANTES vs DESPUÉS

| Aspecto | Antes (v2) | Ahora (v3) |
|---------|-----------|------------|
| **Categorías de servicios** | 6 | **9** (+3) |
| **Guía Local** | ❌ | ✅ Con 2 opciones |
| **Restaurantes** | ❌ | ✅ Con 2 opciones |
| **Otros gastos** | ❌ En "Otros" genérico | ✅ Con 2 opciones |
| **Tipo de cálculo selector** | ❌ | ✅ En tabla |
| **Actualización automática** | ✅ | ✅ Mejorada |
| **Visualización detallada** | Básica | ✅ Por categorías con emojis |
| **Suma total completa** | Parcial | ✅ **TODO incluido** |

---

## 📁 ESTRUCTURA DE DATOS

### Servicio (Objeto)

```javascript
{
  id: 1673982123456,
  tipo: 'Guía Local',              // Tipo de servicio
  descripcion: 'Guía Valencia',    // Descripción
  costeUnitario: 150,              // Coste en €
  cantidad: 1,                     // Cantidad (no usado en todos)
  noches: 1,                       // Solo para Hotel
  fechaRelease: '2026-03-01',     // Fecha de release (opcional)
  tipoCalculo: 'porGrupo',         // 'porGrupo' o 'porPersona'
}
```

### Resultados (Objeto Calculado)

```javascript
{
  costeBusPorPax: '30.00',
  costeGuiaPorPax: '30.00',
  costeGuiaLocalPorPax: '5.00',       // NUEVO
  costeHotelPorPax: '90.00',
  costeSeguroPorPax: '8.00',
  costeEntradasPorPax: '28.00',
  costeRestaurantePorPax: '46.00',    // NUEVO
  costeOtrosPorPax: '2.00',           // NUEVO
  costeGratuidadesPorPax: '7.40',
  bonificacion: '5.00',
  costeRealPorPersona: '251.40',      // SUMA TOTAL COMPLETA
  precioVentaPorPersona: '289.11',
  // ... más campos
}
```

---

## ✅ CHECKLIST DE FUNCIONALIDADES

- [x] Categoría "Guía Local" implementada
- [x] Categoría "Restaurante" con cálculo flexible
- [x] Categoría "Otros" con cálculo flexible
- [x] Columna "Tipo de Cálculo" en tabla
- [x] Selector "Por Grupo" / "Por Persona"
- [x] Actualización automática en tiempo real
- [x] Suma total completa en "Coste Real por Persona"
- [x] Visualización mejorada con emojis
- [x] paxPago usado en TODOS los divisores
- [x] Valores seguros (|| 0) en todos los cálculos
- [x] Try/Catch para protección contra errores

---

## 🚀 RESULTADO FINAL

**La calculadora ahora incluye TODO:**
- ✅ Bus, Guía, Guía Local
- ✅ Hoteles con noches
- ✅ Seguro, Entradas
- ✅ **Restaurantes** (flexible)
- ✅ **Otros gastos** (flexible)
- ✅ Gratuidades prorrateadas
- ✅ Bonificación

**Actualización en tiempo real:**
- ✅ Sin recargar página
- ✅ Recalcula automáticamente
- ✅ Visualización instantánea

**Interfaz mejorada:**
- ✅ Columna "Tipo de Cálculo"
- ✅ Selectores intuitivos
- ✅ Emojis para identificación rápida
- ✅ Solo muestra categorías con valor

---

## 📊 ESTADO DEL SERVIDOR

✅ **Compilando correctamente**  
✅ **0 errores de linter**  
✅ **Lógica completa implementada**  
✅ **Funcionando en http://localhost:5174/**

---

**🎉 Tu calculadora de cotización es ahora COMPLETA y PROFESIONAL.**
