# Documento Maestro de Arquitectura y Estado: Proyecto Flowtrix

## 1. Resumen del Proyecto Flowtrix
Flowtrix es un ERP especializado en la gestión integral de expedientes de viaje. Su propósito es automatizar la cotización, seguimiento, facturación y liquidación de servicios turísticos.
*   **Stack Tecnológico:** React 18, Vite, Supabase (PostgreSQL), Cursor IDE.
*   **Estado:** Entorno de producción con datos reales. Se encuentra en una fase crítica de refactorización para eliminar deuda técnica acumulada y mejorar la estabilidad relacional.

## 2. Estructura de Datos Actual
La base de datos se centra en la tabla `expedientes` y la tabla `servicios_cotizacion`.
*   **Tabla `expedientes`:** Contiene metadatos financieros y columnas críticas tipo `jsonb` (`versiones_json`, `desglose_grupos`, `cierre_grupo`, `desglose_gastos`).
*   **Tabla `servicios_cotizacion`:** Fuente relacional de servicios que sufre inconsistencias por falta de validación de unicidad y lógica de persistencia compartida.
*   **Relaciones:** Se requiere una auditoría profunda para separar entidades de cobro (clientes/asociaciones) que actualmente se agrupan erróneamente en el mismo expediente.

## 3. Reglas de Negocio y Restricciones
*   **Privacidad:** Prohibido recoger `fecha_nacimiento` reales y `vestimenta` (uniformes) para cumplir con principios de minimización de datos.
*   **Nomenclatura:** Uso obligatorio de `dojo_id` (NUNCA `id_dojo`) y `nombre_dojo` (NUNCA `nombre`) en todos los modelos.
*   **Desarrollo:** Metodología "paso a paso", sin parches.
*   **Seguridad:** Prohibida la inyección de `console.log` o código de diagnóstico en funciones de renderizado.
*   **Interacción IA:** La IA actúa como ejecutor. Antes de modificar BD o lógica compleja, debe presentar un plan y esperar confirmación.

## 4. El Problema Crítico Actual (El JSON)
Existe una "arquitectura de cartón piedra" donde datos operativos críticos (servicios de cotización) se persisten en la columna `versiones_json` en lugar de en la tabla relacional `servicios_cotizacion`.
*   **Mecanismo de Falla:** Existe una lógica de "Plan B" que, ante una supuesta ausencia de datos en SQL, inyecta los datos del JSON en el estado `servicios[]` del frontend.
*   **Duplicidad:** El frontend realiza una mezcla (`merge`) entre los datos SQL y los datos JSON, superponiendo dos fuentes de verdad y causando duplicidad al realizar el `upsert`.
*   **Riesgo:** El sistema opera en producción con datos reales; cualquier migración debe ser no destructiva y validada.

## 5. Archivos Clave Implicados
*   `src/components/ExpedienteDetalle.jsx`: Núcleo de la carga de datos.
*   `src/components/ServiciosCotizacionPanel.jsx`: Punto crítico donde ocurre el merge entre datos SQL y el JSON.
*   `src/components/TablaServiciosVariante.jsx`: Componente de "multicotización" responsable de la inestabilidad.
*   `src/utils/consolidacionGastos.js`: Contiene lógica de fallback que lee de `versiones_json`.
*   `pages/Expedientes.jsx`: Punto de entrada principal que carga `versiones_json` masivamente.