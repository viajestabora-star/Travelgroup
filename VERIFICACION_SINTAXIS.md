# ✅ Verificación Estructural de ExpedienteDetalle.jsx

## 📋 Resumen de Estructura

```
ExpedienteDetalle (Línea 5-1703)
│
├── ⚠️  Early Return: if (!expediente) return <div>...</div> (Líneas 7-19)
│
├── 🎯 Estados (useState)
│   ├── tab, setTab
│   ├── editandoCliente, setClienteEditado
│   ├── servicios, setServicios
│   ├── proveedores, setProveedores
│   ├── numTotalPasajeros, setNumTotalPasajeros
│   ├── numGratuidades, setNumGratuidades
│   ├── documentos, setDocumentos
│   └── ...
│
├── 🛡️ safeCalculate (Línea 46) - Función de blindaje anti-crash
│
├── 🧮 numPasajerosPago (Línea 61) - useMemo calculado
│   └── Formula: Math.max(1, total - gratuidades)
│
├── 📊 Funciones de Cotización
│   ├── calcularTotalServicio (Línea 159)
│   ├── calcularCostePorPaxPagador (Línea 198)
│   └── calcularCotizacionProfesional (Línea 210)
│
├── 🔧 Funciones de Gestión
│   ├── añadirServicio (Línea 95)
│   ├── eliminarServicio (Línea 141) ✅ Con confirmación
│   ├── actualizarServicio (Línea 152)
│   ├── guardarCotizacion (Línea 421)
│   └── ...
│
├── 👤 Funciones de Cliente
│   ├── iniciarEdicionCliente (Línea 536)
│   ├── guardarCambiosCliente (Línea 555) ✅ Sincronización bidireccional
│   └── cancelarEdicionCliente (Línea 592)
│
├── 📁 Funciones de Documentos
│   ├── handleFileUpload (Línea 483)
│   └── eliminarDocumento (Línea 502) ✅ Con confirmación
│
├── 📝 Tabs Definition (Línea 519)
│   ├── Ficha del Grupo
│   ├── Cotización
│   ├── Rooming List
│   ├── Cobros y Pagos
│   ├── Documentación
│   └── Cierre de Grupo
│
├── 🔍 grupo (Línea 529) - Búsqueda del cliente con fallback seguro
│
├── 💰 calcularCierre (Línea 598)
│
└── 🎨 return (Línea 621) - JSX Principal
    │
    ├── Modal Container (Línea 622)
    │
    ├── Header con JERARQUÍA CORRECTA (Línea 624-645)
    │   ├── h2: nombre_grupo (GRANDE, NEGRITA, UPPERCASE)
    │   └── p: cliente_responsable (PEQUEÑO, debajo)
    │
    ├── Tabs Navigation (Línea 647-668)
    │
    └── Tab Content (Línea 671-1700)
        ├── tab === 'grupo' → Ficha del Cliente (Editable)
        ├── tab === 'cotizacion' → Calculadora Profesional
        ├── tab === 'pasajeros' → Rooming List
        ├── tab === 'cobros' → Cobros y Pagos
        ├── tab === 'documentacion' → Gestor de Documentos
        └── tab === 'cierre' → Cierre de Grupo

Cierre de función: } (Línea 1703)
Export: export default ExpedienteDetalle (Línea 1705)
```

---

## ✅ Verificaciones de Sintaxis Completadas

### 1. Balance de Llaves y Paréntesis
- ✅ Función principal abierta en línea 5
- ✅ Función principal cerrada en línea 1703
- ✅ Return principal en línea 621 (dentro de la función)
- ✅ Todos los JSX correctamente anidados

### 2. Early Returns
- ✅ Return para `!expediente` (líneas 7-19) - Correcto ✓
- ✅ Return principal (línea 621) - Correcto ✓

### 3. Estados y Hooks
- ✅ Todos los `useState` declarados dentro de la función
- ✅ Todos los `useMemo` declarados dentro de la función
- ✅ Todos los `useEffect` declarados dentro de la función

### 4. Lógica de Pasajeros de Pago (REGLA CRÍTICA)
```javascript
// Línea 61-67
const numPasajerosPago = React.useMemo(() => {
  return safeCalculate(() => {
    const total = Math.max(1, parseInt(numTotalPasajeros) || 1)
    const gratis = Math.max(0, parseInt(numGratuidades) || 0)
    return Math.max(1, total - gratis) // ✅ NUNCA será 0
  })
}, [numTotalPasajeros, numGratuidades])
```

**Formula Aplicada:** `pax_pago = Math.max(1, (expediente.pax_total || 0) - (expediente.gratuidades || 0))`

✅ **Verificado en 4 lugares:**
1. Línea 168 - calcularTotalServicio
2. Línea 203 - calcularCostePorPaxPagador
3. Línea 213 - calcularCotizacionProfesional (Bus/Pax)
4. Línea 253 - Cálculo de Bus por Pasajero

---

## 🏛️ Jerarquía Visual (REGLA DE ORO)

### Header del Expediente (Líneas 628-636)

```jsx
{/* REGLA DE ORO: Nombre del Grupo = GRANDE */}
<h2 className="text-3xl font-black text-navy-900 uppercase mb-1">
  {expediente.nombre_grupo || grupo.nombre || expediente.clienteNombre || 'GRUPO SIN NOMBRE'}
</h2>

{/* REGLA DE ORO: Responsable = PEQUEÑO debajo */}
<p className="text-sm text-gray-600 mb-2">
  👤 {expediente.cliente_responsable || expediente.responsable || grupo.responsable || 'Sin responsable'}
</p>
```

**Resultado Visual:**
```
╔═══════════════════════════════╗
║ LLOMBAI                       ║ ← GRANDE, NEGRITA
║ 👤 Viorica                    ║ ← PEQUEÑO
║ Valencia - Tabarca            ║
╚═══════════════════════════════╝
```

---

## 🔐 Confirmaciones de Seguridad

### Eliminación de Servicios (Línea 146)
```javascript
if (window.confirm(`¿Está seguro de que desea eliminar el servicio "${nombreServicio}${descripcion}"?\n\nEsta acción no se puede deshacer.`)) {
  setServicios(servicios.filter(s => s.id !== id))
}
```

### Eliminación de Documentos (Línea 506)
```javascript
if (window.confirm(`¿Está seguro de que desea eliminar "${nombreDocumento}"?\n\nEsta acción no se puede deshacer.`)) {
  const nuevosDocumentos = documentos.filter(doc => doc.id !== id)
  setDocumentos(nuevosDocumentos)
}
```

✅ **Todas las eliminaciones requieren confirmación**

---

## ✏️ Campos Editables del Cliente

### Modo Vista (Líneas 681-721)
- Solo lectura con botón "Editar Cliente"

### Modo Edición (Líneas 722-794)
**Campos Editables:**
- ✅ Nombre del Grupo
- ✅ CIF
- ✅ Responsable
- ✅ Persona de Contacto
- ✅ Móvil
- ✅ Email
- ✅ Nº de Socios
- ✅ Población
- ✅ Provincia
- ✅ Dirección

**Sincronización Bidireccional (Línea 570-580):**
```javascript
const expedienteActualizado = {
  ...expediente,
  // JERARQUÍA CORRECTA:
  nombre_grupo: clienteEditado.nombre || '',        // GRUPO (Grande)
  cliente_responsable: clienteEditado.responsable || '', // RESPONSABLE (Pequeño)
  // Compatibilidad con código antiguo
  clienteNombre: clienteEditado.nombre || '',
  responsable: clienteEditado.responsable || '',
}
onUpdate(expedienteActualizado)
```

✅ **Los cambios se guardan en:**
1. Base de datos de clientes (`storage.setClientes`)
2. Expediente actual (`onUpdate`)

---

## 🎯 Resumen de Cumplimiento

| Requisito | Estado | Líneas |
|-----------|--------|--------|
| Estructura de función correcta | ✅ | 5-1703 |
| Return dentro de función | ✅ | 621 |
| Jerarquía visual (Grupo/Responsable) | ✅ | 628-636 |
| pax_pago = Math.max(1, ...) | ✅ | 61-67, 168, 203, 213 |
| Bus/Guía dividido por pax_pago | ✅ | 253-261 |
| Campos editables del cliente | ✅ | 722-794 |
| Confirmaciones de eliminación | ✅ | 146, 506 |
| Sintaxis cerrada correctamente | ✅ | 1703 |

---

## 🔍 Verificación de Linter

```bash
npm run lint
# O directamente:
read_lints src/components/ExpedienteDetalle.jsx
```

**Resultado:** ✅ No linter errors found

---

## 🚀 Si Hay Errores en el Navegador

### Error: "Unexpected token"
**Causa:** Babel no puede parsear el JSX

**Solución:**
```bash
# Limpiar caché de Vite
rm -rf node_modules/.vite

# Reiniciar servidor
npm run restart
```

### Error: "Return outside function"
**Verificación:** El return en línea 621 está **DENTRO** de la función ExpedienteDetalle (línea 5-1703)

**Si persiste:** Verificar que no haya caracteres invisibles o problemas de encoding
```bash
file src/components/ExpedienteDetalle.jsx
# Debe decir: UTF-8 Unicode text
```

---

## ✅ Conclusión

El archivo `ExpedienteDetalle.jsx` tiene una estructura sintácticamente correcta:
- Todos los returns están dentro de la función
- Todas las llaves y paréntesis están balanceados
- La jerarquía visual sigue la regla de oro
- Los cálculos de cotización usan pax_pago correctamente
- Todas las eliminaciones requieren confirmación
- Los campos del cliente son editables

**🎯 El código está listo para producción.**
