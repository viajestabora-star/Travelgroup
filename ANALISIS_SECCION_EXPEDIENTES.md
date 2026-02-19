# Análisis Técnico y Funcional: Sección Expedientes

### Sección: Expedientes

**1. Propósito Principal:**

Gestionar el ciclo de vida completo de los expedientes de viaje: desde la creación y cotización hasta el cierre de grupo, incluyendo cobros, facturación y documentación. Permite filtrar por ejercicio (año), estado y búsqueda, con integración directa a Supabase.

---

**2. Componentes Clave y UI:**

*   **Vista Principal:** Una cuadrícula de tarjetas (cards) que muestran cada expediente con: nombre del grupo/cliente, responsable, destino, fechas, tipo colectivo, duración, estado de cierre y botones de cambio de estado (P/C/F/Ca). Las tarjetas son clicables y abren el detalle completo.

*   **Funcionalidades UI:**
    *   **Selector de Ejercicio:** Desplegable para filtrar por año (2026–2036), sincronizado globalmente con `ejercicioGlobal`.
    *   **Campo de Búsqueda:** Busca por cliente, responsable, destino u observaciones.
    *   **Pestañas por Estado:** 4 pestañas — Petición (peticion + confirmado), Confirmado (en_curso), Finalizado, Cancelado — con contador de expedientes por pestaña.
    *   **Cards KPI:** 4 tarjetas resumen con el conteo por estado (Petición, Confirmado, Finalizado, Cancelado), clicables para cambiar de pestaña.
    *   **Botón "Nuevo Expediente":** Abre modal de creación con formulario completo.
    *   **Botón "Crear Nuevo Cliente":** Dentro del modal de expediente, abre modal para crear cliente en Supabase.
    *   **Botón Exportar:** Abre modal de exportación por trimestre (Q1–Q4).
    *   **Botones de Estado en cada tarjeta:** P (Petición), C (Confirmado), F (Finalizado), Ca (Cancelado) para cambiar el estado sin abrir el detalle.
    *   **Botón Eliminar:** En cada tarjeta, con confirmación previa (Regla 1.14).
    *   **Ordenación:** A–Z por cliente, con desempate por fecha de inicio.

*   **Sub-componentes:**
    *   `ExpedienteDetalle.jsx` — Modal/detalle completo del expediente con pestañas: Grupo, Cotización, Rooming List, Cobros, Facturación, Documentación, Cierre.
    *   `ExpedienteFinanzas.jsx` — Usado dentro de ExpedienteDetalle para la pestaña Cobros y Cierre de Grupo (liquidación, recibos, informe de gastos).

---

**3. Interacción con la Base de Datos (Supabase):**

*   **Tablas Principales Consultadas (Expedientes.jsx):**
    *   `expedientes` — Lectura completa (`select('*')`), orden por `id` descendente.
    *   `clientes` — Lectura para autocompletado, creación de expedientes y búsqueda.

*   **Tablas Consultadas por ExpedienteDetalle / ExpedienteFinanzas:**
    *   `expedientes`, `clientes`, `proveedores`, `servicios_cotizacion`, `cobros_expediente`, `recibos_oficiales`, `facturas_versiones`, `facturas_emitidas`, `facturas_emitidas_global`, `facturas`, `logs_financieros`.

*   **Vistas Consultadas:** Ninguna en la página Expedientes.jsx. El componente usa únicamente tablas base.

*   **Funciones Invocadas (RPC):** Ninguna.

*   **Operaciones de Escritura:**
    *   **expedientes:** `insert`, `update`, `delete`, `upsert`.
    *   **clientes:** `insert` (al crear cliente desde el modal de expediente).
    *   El detalle y finanzas gestionan además: `servicios_cotizacion`, `cobros_expediente`, `recibos_oficiales`, `facturas_versiones`, `facturas_emitidas`, `facturas_emitidas_global`, `facturas`, `logs_financieros`.

---

## Análisis Adicional: Funcionalidades Reutilizables para un Dashboard de Alto Nivel

### 1. **Sistema de Filtrado por Estados**

Existe un sistema de filtrado por estados que se puede reutilizar:

*   **Constante `TABS_EXPEDIENTES`:** Define las pestañas y los estados asociados:
    ```javascript
    const TABS_EXPEDIENTES = [
      { id: 'pendientes', label: 'Petición', estados: ['peticion', 'confirmado'] },
      { id: 'confirmados', label: 'Confirmado', estados: ['en_curso'] },
      { id: 'finalizado', label: 'Finalizado', estados: ['finalizado'] },
      { id: 'cancelado', label: 'Cancelado', estados: ['cancelado'] },
    ]
    ```
*   **Constante `ESTADOS`:** Mapeo de estado → etiqueta, color y clase CSS para badges.
*   **Lógica de filtrado:** `expedientesPorTab` agrupa expedientes por pestaña usando `TABS_EXPEDIENTES` y `expedientesFiltradosPorEjercicioYBusqueda`.

**Reutilización:** Un dashboard podría importar `TABS_EXPEDIENTES` y `ESTADOS` para mostrar KPIs por estado (ej. "Expedientes en Petición: 12") o mini-widgets de resumen sin duplicar lógica.

---

### 2. **Selector de Ejercicio Global**

El selector de ejercicio está integrado con `ejercicioGlobal.js`:

*   `getEjercicioActual()` — Lee el año desde `localStorage`.
*   `setEjercicioActual()` — Guarda y dispara evento `ejercicioChanged`.
*   `subscribeToEjercicioChanges()` — Suscripción para que otros componentes reaccionen al cambio.
*   `getAñosDisponibles()` — Array de años (2026–2036).

**Reutilización:** El Dashboard y la Central de Inteligencia ya usan este patrón. Cualquier nuevo panel de métricas puede suscribirse a `ejercicioChanged` para filtrar datos por año sin lógica adicional.

---

### 3. **Filtro por Búsqueda de Texto**

La búsqueda filtra por: `nombreCliente`, `responsable`, `destino`, `observaciones`. La lógica está en `expedientesFiltradosPorEjercicioYBusqueda` y es genérica (term + campos).

**Reutilización:** Se puede extraer a un hook o utilidad `useFiltroTexto(datos, campos, term)` para reutilizar en listados de clientes, proveedores o en un buscador global del dashboard.

---

### 4. **Helper de Errores de Supabase**

`manejarErrorSupabase(error, operacion)` detecta errores de permisos (RLS) y devuelve un objeto `{ tipo, mensaje }` para mostrar al usuario.

**Reutilización:** Útil en cualquier componente que llame a Supabase para unificar el manejo de errores y mensajes al usuario.

---

### 5. **Generación de Número de Expediente**

`obtenerSiguienteNumeroExpediente(año)` genera el siguiente número correlativo (YYYY-001, YYYY-002, …) consultando `expedientes` con `ilike`.

**Reutilización:** Específica de expedientes, pero el patrón (prefijo + secuencia) podría aplicarse a otros módulos (facturas, recibos, etc.).

---

### Resumen de Reutilización para Dashboard

| Funcionalidad              | Reutilizable | Uso sugerido en Dashboard                          |
|---------------------------|-------------|----------------------------------------------------|
| Filtrado por estados      | ✅ Sí       | KPIs por estado, mini-tarjetas de resumen         |
| Selector de ejercicio     | ✅ Sí       | Ya integrado; métricas filtradas por año           |
| Búsqueda de texto         | ✅ Sí       | Buscador global o filtro en listados                |
| Helper errores Supabase   | ✅ Sí       | Mensajes de error consistentes en toda la app       |
| Número correlativo        | ⚠️ Parcial  | Patrón aplicable a otros módulos con secuencias     |
