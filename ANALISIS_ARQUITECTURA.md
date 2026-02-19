# Informe de Arquitectura — Viajes Tabora ERP

**Proyecto:** React + Vite + Supabase  
**Fecha de auditoría:** Febrero 2026  
**Estructura analizada:** `/src/`

---

## Estructura del Proyecto

```
src/
├── App.jsx              # Enrutamiento principal, login
├── main.jsx
├── index.css
├── supabase.js          # Cliente Supabase
├── components/          # Componentes reutilizables
│   ├── Layout.jsx       # Sidebar + Outlet
│   ├── ErrorBoundary.jsx
│   ├── CentralDeInteligencia.jsx
│   ├── CrmIntelligencePanel.jsx
│   ├── IntelligenceHub.jsx
│   ├── DashboardMetrics.jsx
│   ├── ExpedienteDetalle.jsx
│   ├── ExpedienteFinanzas.jsx
│   └── ProveedorForm.jsx
├── pages/               # Páginas por ruta
│   ├── Dashboard.jsx
│   ├── Clientes.jsx
│   ├── NotasTrabajo.jsx
│   ├── Expedientes.jsx
│   ├── Proveedores.jsx
│   ├── Planning.jsx
│   ├── CRM.jsx
│   ├── Composer.jsx
│   ├── Cierres.jsx
│   └── HistorialCierres.jsx
└── utils/
    ├── storage.js
    ├── dateNormalizer.js
    ├── ejercicioGlobal.js
    ├── finanzasHelpers.js
    └── initialData.js
```

---

## Rutas (App.jsx)

| Ruta | Componente |
|------|-------------|
| `/dashboard` | Dashboard |
| `/clientes` | Clientes |
| `/notas` | NotasTrabajo |
| `/expedientes` | Expedientes |
| `/proveedores` | Proveedores |
| `/planning` | Planning |
| `/crm` | CRM |
| `/composer` | Composer |
| `/cierres` | Cierres |
| `/historial-cierres` | HistorialCierres |

---

## Secciones Clave

### Sección: Panel de Control (Dashboard)

**1. Propósito Principal:**  
Punto de entrada principal del ERP: resumen de KPIs, accesos rápidos, alertas de releases y Central de Inteligencia (CRM y finanzas).

**2. Componentes Clave y UI:**
*   **Vista Principal:** Cuatro tarjetas KPI (Total Clientes, Expedientes, Planificación, Visitas Pendientes), panel de Próximos Releases, Acciones Rápidas, bloque Planning y Central de Inteligencia.
*   **Funcionalidades UI:** Botón "Globo de Inteligencia" (modal con Central de Inteligencia), tarjetas clicables que navegan a cada sección, lista de releases con días restantes y botón "Pagado", enlaces a Expedientes, Clientes, Planning y Cierres.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `clientes`, `expedientes`, `servicios_cotizacion`. Central de Inteligencia usa `view_crm_intelligence`.
*   **Operaciones de Escritura:** Solo actualización de `release_pagado` en `servicios_cotizacion` al marcar release como pagado.

**4. Análisis de Duplicidad Potencial:**
*   El selector de ejercicio se usa en Layout y Expedientes; el Dashboard usa `ejercicioActual` para filtrar expedientes y visitas. Conviene centralizar la lógica de filtrado por ejercicio en un hook o utilidad compartida.
*   La Central de Inteligencia (CRM) usa `view_crm_intelligence`; el panel de Inteligencia Económica está pendiente. Evitar duplicar consultas de clientes/expedientes entre Dashboard y Expedientes/Clientes.

---

### Sección: Clientes

**1. Propósito Principal:**  
Gestión del catálogo de clientes: CRUD, historial de expedientes y beneficio neto por expediente.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Tabla de clientes con búsqueda, orden A–Z por nombre.
*   **Funcionalidades UI:** Búsqueda por texto, botón "Nuevo Cliente", modal de creación/edición, botón eliminar con confirmación doble, panel lateral con expedientes del cliente y beneficio neto.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `clientes`, `expedientes`, `servicios_cotizacion`.
*   **Operaciones de Escritura:** `insert`, `update`, `delete` en `clientes`.

**4. Análisis de Duplicidad Potencial:**
*   El patrón de búsqueda + tabla + modal CRUD es similar a Proveedores. Se puede extraer un componente genérico `TablaConBusqueda` o un hook `useCrud`.
*   El cálculo de beneficio neto (expedientes + servicios) está duplicado en ExpedienteDetalle y Clientes. Se podría mover a un servicio o utilidad compartida.

---

### Sección: Notas de Trabajo

**1. Propósito Principal:**  
Gestión de notas internas (pendientes/completadas) con destinatario y fecha de plazo.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Lista de notas con colores por destinatario (Todos, Andres, Marisa, German), filtro Pendientes/Completadas.
*   **Funcionalidades UI:** Toggle Pendientes/Completadas, crear nota, editar, completar, responder, ocultar.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `notas`.
*   **Operaciones de Escritura:** `insert`, `update` en `notas` (estado, contenido, destinatario, fecha_plazo).

**4. Análisis de Duplicidad Potencial:**
*   Filtro de estado (Pendiente/Completado) similar al de Expedientes. No hay KPIs compartidos con el Dashboard; el Dashboard podría mostrar un contador de notas pendientes si se desea.

---

### Sección: Expedientes

**1. Propósito Principal:**  
Gestión del ciclo de vida de expedientes: creación, cotización, cobros, facturación, cierre y documentación.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Cuadrícula de tarjetas por expediente (cliente, responsable, destino, fechas, estado) con pestañas por estado.
*   **Funcionalidades UI:** Selector de ejercicio, búsqueda, 4 pestañas (Petición, Confirmado, Finalizado, Cancelado), cards KPI por estado, botón "Nuevo Expediente", modal "Crear Cliente", exportar, botones de cambio de estado (P/C/F/Ca), borrado con confirmación.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `expedientes`, `clientes`. ExpedienteDetalle usa además: `servicios_cotizacion`, `proveedores`, `cobros_expediente`, `recibos_oficiales`, `facturas_versiones`, `facturas_emitidas`, `facturas_emitidas_global`, `facturas`, `logs_financieros`.
*   **Operaciones de Escritura:** `insert`, `update`, `delete`, `upsert` en `expedientes`; `insert` en `clientes`; y múltiples operaciones en las tablas del detalle.

**4. Análisis de Duplicidad Potencial:**
*   El sistema de filtrado por estados (`TABS_EXPEDIENTES`, `ESTADOS`) es reutilizable para un Dashboard de alto nivel (KPIs por estado).
*   El selector de ejercicio y la lógica de filtrado por año están en `ejercicioGlobal.js` y son compartidos entre Expedientes, Planning y Dashboard.
*   Evitar duplicar la lógica de conteo por estado; se puede crear un hook o un servicio que devuelva los conteos por estado.

---

### Sección: Proveedores

**1. Propósito Principal:**  
Gestión del catálogo de proveedores (hoteles, mayoristas, guías, autobuses, etc.) con datos de contacto y bancarios.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Tabla de proveedores ordenada A–Z por nombre comercial, con búsqueda.
*   **Funcionalidades UI:** Búsqueda, botón "Nuevo Proveedor", modal de creación/edición, botón eliminar con confirmación doble, selector de tipo de servicio (Hotel, Mayorista, Guía, Restaurante, Autobús, Otros).

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `proveedores`.
*   **Operaciones de Escritura:** `insert`, `update`, `delete` en `proveedores`.

**4. Análisis de Duplicidad Potencial:**
*   Patrón CRUD similar a Clientes. Un componente genérico `TablaCrud` o `useCrud` reduciría duplicación.
*   No hay KPIs compartidos con el Dashboard; se podría añadir un contador de proveedores por tipo si se desea.

---

### Sección: Planning

**1. Propósito Principal:**  
Vista cronológica de expedientes por trimestre (Q1–Q4) para planificación y seguimiento.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Lista vertical de expedientes agrupados por trimestre, ordenados por fecha de salida.
*   **Funcionalidades UI:** Selector de ejercicio, botón "Nuevo Viaje", modal de creación, tarjetas de expediente clicables (abren ExpedienteDetalle), botón eliminar con confirmación.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `expedientes` (indirectamente vía `storage.get('expedientes')`). Planning usa localStorage como fuente principal; los datos se sincronizan desde Expedientes.
*   **Operaciones de Escritura:** Creación/actualización de expedientes vía storage; la persistencia real en Supabase se hace en Expedientes.

**4. Análisis de Duplicidad Potencial:**
*   El uso de `storage.get('expedientes')` en lugar de Supabase puede causar desincronización. La fuente única de verdad debería ser Supabase.
*   `ESTADOS` y la lógica de colores están duplicados respecto a Expedientes. Se puede extraer a `utils/estadosExpedientes.js`.
*   La función `getTrimestreFromFecha` es reutilizable para el Dashboard si se necesitan métricas por trimestre.

---

### Sección: CRM / Captación

**1. Propósito Principal:**  
Gestión de prospectos y visitas comerciales: calendario, próximas visitas, historial y conversión a cliente.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Pestañas (Calendario, Próximas Visitas, Historial, Estadísticas), panel lateral con ficha del prospecto (datos, historial, programas).
*   **Funcionalidades UI:** Calendario de visitas, modal de agenda, registro de visita desde panel, modal "Registrar Visita" (nuevo prospecto), conversión a cliente, listado unificado clientes + prospectos.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `prospectos`, `clientes`, `visitas`.
*   **Operaciones de Escritura:** `insert`, `update`, `delete` en `prospectos`; `insert` en `visitas`.

**4. Análisis de Duplicidad Potencial:**
*   El filtrado por fecha (próximas vs historial) es específico del CRM; no hay duplicación directa con el Dashboard.
*   El dashboard podría mostrar un KPI de "Prospectos próximos a visitar" o "Visitas del mes" si se añaden consultas en el Dashboard.
*   La Central de Inteligencia (CRM) usa `view_crm_intelligence`; el CRM no usa esa vista directamente. Conviene alinear fuentes de datos para evitar inconsistencias.

---

### Sección: Composer

**1. Propósito Principal:**  
Creación de bonos/documentos de viaje combinando proveedor, expediente y plantilla.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Formulario con selectores de proveedor y expediente, campos de texto (título, contenido, fechas, etc.) y vista previa del bono.
*   **Funcionalidades UI:** Selector de proveedor (autocompleta teléfono, dirección, población), selector de expediente (autocompleta datos del viaje), guardar, imprimir, vista previa.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `proveedores`, `expedientes`, `plantillas_viajes`.
*   **Operaciones de Escritura:** `insert` en `plantillas_viajes`.
*   **Nota:** La columna `fecha_viaje` en expedientes puede no existir; se usa `fecha_inicio` en otras partes. Revisar esquema.

**4. Análisis de Duplicidad Potencial:**
*   El patrón de selección de proveedor/expediente con autocompletado es específico. No hay KPIs compartidos con el Dashboard.

---

### Sección: Cierres

**1. Propósito Principal:**  
Gestión del cierre de grupo de expedientes: selección de expediente, informe de gastos, liquidación, facturación y generación de PDF.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Selector de expediente, formulario de informe de gastos (líneas de importe real), resumen de liquidación (ingresos, gastos, beneficio, IVA), panel de facturas emitidas y generación de PDF.
*   **Funcionalidades UI:** Selector de expediente, formulario de gastos, tabla de facturas, botón "Emitir Factura", generación de PDF unificado, descarga de factura.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `expedientes`, `clientes`, `servicios_cotizacion`, `facturas_emitidas_global`, `facturas`.
*   **Operaciones de Escritura:** `update` en `expedientes` (informe_gastos_hacienda, total_gastos_reales, liquidacion_final_beneficio, cierre_grupo); `insert` en `facturas_emitidas_global`.

**4. Análisis de Duplicidad Potencial:**
*   La lógica de cálculo de beneficio (ingresos − gastos − IVA) está en Cierres y en ExpedienteFinanzas. Se puede extraer a `utils/beneficioCalc.js`.
*   El Dashboard podría mostrar un KPI de "Expedientes cerrados este mes" o "Beneficio total cerrado" si se añade una vista o consulta agregada.

---

### Sección: Historial de Cierres

**1. Propósito Principal:**  
Listado de expedientes cerrados con resumen financiero y acceso al detalle.

**2. Componentes Clave y UI:**
*   **Vista Principal:** Tabla de expedientes con informe de gastos (ingresos, gastos, beneficio neto, fecha de cierre).
*   **Funcionalidades UI:** Botón "Ver Detalle" que navega a Expedientes con el expediente abierto y la pestaña Cierre.

**3. Interacción con la Base de Datos (Supabase):**
*   **Tablas/Vistas Consultadas:** `expedientes` (con filtro `informe_gastos_hacienda IS NOT NULL`).
*   **Operaciones de Escritura:** Ninguna.

**4. Análisis de Duplicidad Potencial:**
*   Es una vista de solo lectura sobre expedientes cerrados. Se puede reutilizar la lógica de filtrado si se crea una vista `view_expedientes_cerrados` en Supabase para el Dashboard.

---

## Resumen de Tablas Supabase por Sección

| Tabla | Dashboard | Clientes | Notas | Expedientes | Proveedores | Planning | CRM | Composer | Cierres | Historial |
|-------|-----------|----------|-------|-------------|-------------|----------|-----|----------|---------|-----------|
| clientes | ✓ | ✓ | | ✓ | | | ✓ | | ✓ | |
| expedientes | ✓ | ✓ | | ✓ | | (storage) | | ✓ | ✓ | ✓ |
| servicios_cotizacion | ✓ | ✓ | | ✓ | | | | | ✓ | |
| notas | | | ✓ | | | | | | | |
| proveedores | | | | ✓ | ✓ | | | ✓ | | |
| prospectos | | | | | | | ✓ | | | |
| visitas | | | | | | | ✓ | | | |
| plantillas_viajes | | | | | | | | ✓ | | |
| cobros_expediente | | | | ✓ | | | | | | |
| recibos_oficiales | | | | ✓ | | | | | | |
| facturas_* | | | | ✓ | | | | | ✓ | |
| logs_financieros | | | | ✓ | | | | | | |
| view_crm_intelligence | ✓ | | | | | | | | | |

---

## Recomendaciones de Arquitectura

1. **Centralizar lógica de estados:** Extraer `TABS_EXPEDIENTES` y `ESTADOS` a `utils/estadosExpedientes.js` para compartir entre Expedientes, Planning y Dashboard.
2. **Unificar fuente de datos en Planning:** Sustituir `storage.get('expedientes')` por consultas directas a Supabase para evitar desincronización.
3. **Extraer cálculo de beneficio:** Crear `utils/beneficioCalc.js` con la lógica de ingresos − gastos − IVA usada en Cierres y ExpedienteFinanzas.
4. **Componente genérico CRUD:** Crear `TablaCrud` o `useCrud` para Clientes y Proveedores.
5. **Vista para expedientes cerrados:** Crear `view_expedientes_cerrados` en Supabase para HistorialCierres y posibles KPIs del Dashboard.
