import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { n, estadoInicialAcordeon } from '../utils/historialCierresFormat'
import {
  rangoFechasConsultaExpedientes,
  NUMEROS_DIAGNOSTICO_HISTORIAL,
  extraerFinanzas,
  fechaInicioADate,
  fechaReferenciaTrimestreDesdeExp,
  clasificarPorFechaInicio,
  GASTOS_FIJOS_SELECT,
  GASTOS_FIJOS_SELECT_SIN_CREATED,
  GASTOS_FIJOS_SELECT_MINIMAL,
  GASTOS_ESTRUCTURA_SELECT,
  GASTOS_ESTRUCTURA_SELECT_SIN_CREATED,
  GASTOS_ESTRUCTURA_SELECT_MINIMAL,
  TABLAS_GASTOS_ESTRUCTURA_MENSUAL,
  GASTOS_FIJOS_QUERY_TIMEOUT_MS,
  withTimeout,
  logErrorSupabase,
  esErrorColumnaSql,
  esErrorTablaInexistenteHistorial,
} from '../utils/historialCierresShared'

/** Solo tabla `expedientes`; nombres de cliente desde `cliente_nombre`; año fiscal vía `ejercicio`. */
const TABLA_EXPEDIENTES_CIERRE = 'expedientes'

const SELECT_EXPEDIENTES_CIERRE_MIN =
  'id, estado, numero_expediente, nombre_grupo, cliente_nombre, destino, fecha_inicio, ejercicio, total_ingresos, total_gastos_reales, beneficio_neto_real, liquidacion_final_beneficio, cierre_grupo, informe_gastos_hacienda'

const SELECT_EXPEDIENTES_CIERRE_EXT = `${SELECT_EXPEDIENTES_CIERRE_MIN}, created_at, fecha_creacion`

/** Estados admitidos en la carga (solo Cerrado / Finalizado), alineado con el filtro de la consulta. */
const esEstadoCierreCargaHistorial = (estadoRaw) => {
  const s = String(estadoRaw ?? '').trim().toLowerCase()
  return s === 'cerrado' || s === 'finalizado'
}

/**
 * Carga de expedientes (cierre) y gastos de estructura mensual (`gastos_estructura` o fallback `gastos_fijos`).
 * `año` y `trimestreFiltro` son strings del selector (refs internas para callbacks estables).
 */
export function useCierresLogic(año, trimestreFiltro, setAbiertoTrim) {
  const [cierres, setCierres] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [gastosEstructura, setGastosEstructura] = useState([])
  const [cargandoGastosEstructura, setCargandoGastosEstructura] = useState(false)
  const [errorGastosEstructura, setErrorGastosEstructura] = useState(null)
  const [errorCargaHistorial, setErrorCargaHistorial] = useState(null)
  /** Tabla efectiva tras el primer SELECT correcto: `gastos_estructura` o `gastos_fijos` (legacy). */
  const [fuenteGastosEstructura, setFuenteGastosEstructura] = useState(null)

  const cierreLoadSeqRef = useRef(0)
  const historialCargaIdRef = useRef(0)
  const filtroAñoRef = useRef(año)
  const filtroTrimestreRef = useRef(trimestreFiltro)
  filtroAñoRef.current = año
  filtroTrimestreRef.current = trimestreFiltro

  const recargarGastosEstructura = useCallback(async () => {
    const y = parseInt(filtroAñoRef.current, 10)
    if (!Number.isFinite(y)) {
      setGastosEstructura([])
      setErrorGastosEstructura(null)
      setFuenteGastosEstructura(null)
      setCargandoGastosEstructura(false)
      return
    }
    setCargandoGastosEstructura(true)
    setErrorGastosEstructura(null)
    try {
      const mapRow = (r) => ({
        ...r,
        proveedor: r.proveedor ?? '',
        url_pdf: r.url_pdf ?? null,
        fecha_factura: r.fecha_factura ?? null,
        importe_iva: r.importe_iva != null ? n(r.importe_iva) : 0,
        mes: r.mes != null ? Number(r.mes) : null,
        anio: r.anio != null ? Number(r.anio) : null,
        es_extra: r.es_extra === true,
        plantilla_id: r.plantilla_id ?? null,
      })

      const ejecutarSelect = (tablaNombre, columnas) => {
        let q = supabase.from(tablaNombre).select(columnas).eq('anio', y).not('mes', 'is', null)
        q = q.order('mes', { ascending: true })
        if (columnas !== '*' && /\bcreated_at\b/.test(String(columnas))) {
          q = q.order('created_at', { ascending: true })
        }
        return q
      }

      let ultimoError = null
      for (const tablaNombre of TABLAS_GASTOS_ESTRUCTURA_MENSUAL) {
        const intentos =
          tablaNombre === 'gastos_estructura'
            ? ['*', GASTOS_ESTRUCTURA_SELECT, GASTOS_ESTRUCTURA_SELECT_SIN_CREATED, GASTOS_ESTRUCTURA_SELECT_MINIMAL]
            : ['*', GASTOS_FIJOS_SELECT, GASTOS_FIJOS_SELECT_SIN_CREATED, GASTOS_FIJOS_SELECT_MINIMAL]

        for (const columnas of intentos) {
          try {
            let data
            let error
            try {
              const res = await withTimeout(
                ejecutarSelect(tablaNombre, columnas),
                GASTOS_FIJOS_QUERY_TIMEOUT_MS,
                `${tablaNombre} select anio=${y}`
              )
              data = res.data
              error = res.error
            } catch (timeoutOrNet) {
              ultimoError = timeoutOrNet
              logErrorSupabase(
                `${tablaNombre} — consulta abortada o timeout (columnas solicitadas: ${columnas})`,
                timeoutOrNet,
                { anio: y, columnas, tablaNombre }
              )
              setGastosEstructura([])
              setErrorGastosEstructura('Tiempo de espera al cargar gastos de estructura para este ejercicio.')
              return
            }

            if (error) {
              ultimoError = error
              logErrorSupabase(`${tablaNombre} — error Supabase (SELECT: ${columnas})`, error, { anio: y })
              if (esErrorTablaInexistenteHistorial(error)) {
                break
              }
              if (esErrorColumnaSql(error)) continue
              setGastosEstructura([])
              setErrorGastosEstructura(String(error.message || error) || `Error al leer ${tablaNombre}.`)
              return
            }

            const raw = Array.isArray(data) ? data : []
            const rows = []
            for (let i = 0; i < raw.length; i += 1) {
              try {
                rows.push(mapRow(raw[i]))
              } catch (rowErr) {
                console.error(
                  `[HistorialCierres] ${tablaNombre} — fallo al mapear una fila (revisa tipos/columnas en esta fila)`,
                  {
                    indice: i,
                    filaCruda: raw[i],
                    columnasUsadas: columnas,
                    error: rowErr?.message || rowErr,
                    stack: rowErr?.stack,
                  }
                )
              }
            }
            setGastosEstructura(rows)
            setFuenteGastosEstructura(tablaNombre)
            setErrorGastosEstructura(null)
            return
          } catch (e) {
            ultimoError = e
            logErrorSupabase(`${tablaNombre} — excepción en intento de lectura (columnas: ${columnas})`, e, { anio: y })
            if (esErrorTablaInexistenteHistorial(e)) {
              break
            }
            if (esErrorColumnaSql(e)) continue
            setErrorGastosEstructura(String(e?.message || e) || `Error al procesar la respuesta de ${tablaNombre}.`)
            setGastosEstructura([])
            return
          }
        }
      }
      logErrorSupabase(
        'gastos_estructura / gastos_fijos — ningún SELECT compatible con el esquema (ignorado para no bloquear Historial)',
        ultimoError,
        {
          anio: y,
          tablas: TABLAS_GASTOS_ESTRUCTURA_MENSUAL.join(' | '),
        }
      )
      setGastosEstructura([])
      setFuenteGastosEstructura(null)
      setErrorGastosEstructura(
        String(ultimoError?.message || ultimoError) || 'No se pudieron cargar gastos de estructura (consulta incompatible con el esquema).'
      )
    } catch (e) {
      logErrorSupabase('gastos estructura — bloque try/catch externo (ignorado para no bloquear Historial)', e, { anio: parseInt(filtroAñoRef.current, 10) })
      setErrorGastosEstructura(String(e?.message || e) || 'Error inesperado al cargar gastos de estructura.')
      setGastosEstructura([])
    } finally {
      setCargandoGastosEstructura(false)
    }
  }, [])

  const cargarCierres = useCallback(async () => {
    const seq = ++cierreLoadSeqRef.current
    try {
      /**
       * Carga desde `expedientes` únicamente:
       * - `ejercicio` = año del selector (anio).
       * - Estados: Cerrado o Finalizado (ilike por convención en BD).
       * - Orden: `fecha_inicio` ascendente (cronológico).
       * - Si trimestre ≠ "all", se cruza además con rango de fechas en `fecha_inicio` (misma semántica de periodo que antes).
       * - `cliente_nombre` va en el SELECT; se conserva en la fila tal cual llega de la columna.
       */
      const ejecutarFetchExpedientes = async (columnas) => {
        const anioStr = String(filtroAñoRef.current || '')
        const trimestreVal = filtroTrimestreRef.current
        const anioNum = parseInt(anioStr, 10)
        if (!Number.isFinite(anioNum)) {
          return { data: [], error: null }
        }

        let q = supabase
          .from(TABLA_EXPEDIENTES_CIERRE)
          .select(columnas)
          .eq('ejercicio', anioNum)
          .or('estado.ilike.Cerrado,estado.ilike.Finalizado')
          .order('fecha_inicio', { ascending: true, nullsFirst: false })

        if (trimestreVal !== 'all') {
          const rango = rangoFechasConsultaExpedientes(anioStr, trimestreVal)
          if (rango) {
            q = q.gte('fecha_inicio', rango.inicio).lte('fecha_inicio', rango.fin)
          }
        }

        return q
      }

      const esErrorColumna = (err) => /column|schema|does not exist|42703/i.test(String(err?.message || ''))

      let { data, error } = await ejecutarFetchExpedientes(SELECT_EXPEDIENTES_CIERRE_EXT)

      if (error && esErrorColumna(error)) {
        const msg = String(error.message || '')
        if (/fecha_creacion/i.test(msg)) {
          console.warn('[HistorialCierres] fecha_creacion ausente en esquema, reintento con created_at:', msg)
          const rMid = await ejecutarFetchExpedientes(`${SELECT_EXPEDIENTES_CIERRE_MIN}, created_at`)
          data = rMid.data
          error = rMid.error
        } else {
          console.warn('[HistorialCierres] Select extendido rechazado, reintento columnas mínimas:', msg)
          const r2 = await ejecutarFetchExpedientes(SELECT_EXPEDIENTES_CIERRE_MIN)
          data = r2.data
          error = r2.error
        }
      }

      if (error && esErrorColumna(error)) {
        console.warn('[HistorialCierres] Último reintento solo columnas mínimas:', error.message)
        const r3 = await ejecutarFetchExpedientes(SELECT_EXPEDIENTES_CIERRE_MIN)
        data = r3.data
        error = r3.error
      }

      if (seq !== cierreLoadSeqRef.current) return

      if (error) {
        console.error('[HistorialCierres] Error Supabase expedientes:', error.message, error)
        setCierres([])
        setErrorCargaHistorial(String(error.message || error) || 'Error al cargar expedientes de cierre.')
        return
      }

      const crudos = Array.isArray(data) ? data : []
      const filasHistorial = crudos.filter((e) => esEstadoCierreCargaHistorial(e.estado))
      if (filasHistorial.length !== crudos.length) {
        const rechazados = crudos.filter((e) => !esEstadoCierreCargaHistorial(e.estado))
        console.warn(
          '[HistorialCierres] Filas excluidas: estado distinto de Cerrado/Finalizado tras la query:',
          rechazados.map((e) => ({ numero_expediente: e.numero_expediente, estado: e.estado }))
        )
      }

      const numsApi = new Set(filasHistorial.map((e) => String(e.numero_expediente ?? '').trim()))
      NUMEROS_DIAGNOSTICO_HISTORIAL.forEach((num) => {
        if (!numsApi.has(num)) {
          console.warn('[HistorialCierres] No devuelto por API (ejercicio / trimestre / estados):', num)
        }
      })
      console.info(
        '[HistorialCierres] Expedientes de cierre (Cerrado + Finalizado, ejercicio + refinado por referencia):',
        filasHistorial.length,
        filasHistorial.map((e) => e.numero_expediente)
      )

      const mapeados = filasHistorial.map((exp) => {
        const fin = extraerFinanzas(exp)
        const fechaInicioDate = fechaInicioADate(exp.fecha_inicio)
        const fechaReferenciaTrimestre = fechaReferenciaTrimestreDesdeExp({
          ...exp,
          fechaInicioDate,
        })
        const clienteNombre = exp.cliente_nombre
        return {
          ...exp,
          cliente_nombre: clienteNombre,
          ...fin,
          fechaInicioDate,
          fechaReferenciaTrimestre,
        }
      })

      const anioNum = parseInt(filtroAñoRef.current, 10)
      const trimSel = filtroTrimestreRef.current
      const listaFinal = mapeados.filter((c) => {
        const ej = c.ejercicio != null ? Number(c.ejercicio) : NaN
        if (Number.isFinite(ej) && ej !== anioNum) return false
        if (!Number.isFinite(ej)) {
          const y = c.fechaReferenciaTrimestre?.getFullYear?.()
          if (!Number.isFinite(y) || y !== anioNum) return false
        }
        if (trimSel === 'all') return true
        const qSel = parseInt(trimSel, 10)
        return clasificarPorFechaInicio(c).trimestre === qSel
      })

      listaFinal.sort((a, b) => {
        const ta = fechaInicioADate(a.fecha_inicio)?.getTime() ?? 0
        const tb = fechaInicioADate(b.fecha_inicio)?.getTime() ?? 0
        if (ta !== tb) return ta - tb
        return String(a.numero_expediente || '').localeCompare(String(b.numero_expediente || ''), 'es', { numeric: true })
      })

      NUMEROS_DIAGNOSTICO_HISTORIAL.forEach((num) => {
        const row = listaFinal.find((e) => String(e.numero_expediente ?? '').trim() === num)
        if (row) {
          const { trimestre } = clasificarPorFechaInicio(row)
          const y = row.fechaReferenciaTrimestre?.getFullYear?.()
          console.info('[HistorialCierres] Diagnóstico referencia trimestre/año:', num, {
            añoReferencia: y,
            trimestre: trimestre != null ? `T${trimestre}` : null,
          })
        }
      })

      if (seq === cierreLoadSeqRef.current) {
        setErrorCargaHistorial(null)
        setCierres(listaFinal)
      }
    } catch (err) {
      console.error('[HistorialCierres] cargarCierres:', err)
      if (seq === cierreLoadSeqRef.current) {
        setCierres([])
        setErrorCargaHistorial(String(err?.message || err) || 'Error inesperado al cargar el historial de cierres.')
      }
    }
  }, [])

  useEffect(() => {
    if (trimestreFiltro === 'all') {
      setAbiertoTrim(estadoInicialAcordeon(año))
    } else {
      const q = parseInt(trimestreFiltro, 10)
      setAbiertoTrim({ 1: q === 1, 2: q === 2, 3: q === 3, 4: q === 4, 0: false })
    }

    const cargaId = ++historialCargaIdRef.current
    let cancelado = false
    setIsLoading(true)
    setErrorCargaHistorial(null)

    try {
      const promesaExpedientes = cargarCierres().catch((err) => {
        console.error('[HistorialCierres] Rama expedientes rechazada:', err)
        if (!cancelado) {
          setCierres([])
          setErrorCargaHistorial(String(err?.message || err) || 'No se pudieron cargar los expedientes de cierre.')
        }
        return { status: 'rejected', reason: err }
      })

      const promesaGastos = recargarGastosEstructura().catch((err) => {
        console.error('[HistorialCierres] Rama gastos estructura rechazada:', err)
        if (!cancelado) {
          setGastosEstructura([])
          setErrorGastosEstructura(String(err?.message || err) || 'Error al cargar gastos de estructura.')
          setCargandoGastosEstructura(false)
        }
        return { status: 'rejected', reason: err }
      })

      Promise.allSettled([promesaExpedientes, promesaGastos]).finally(() => {
        if (cancelado) return
        if (historialCargaIdRef.current === cargaId) {
          setIsLoading(false)
        }
      })
    } catch (errorSincrono) {
      console.error('[HistorialCierres] Error síncrono al iniciar la carga:', errorSincrono)
      if (!cancelado && historialCargaIdRef.current === cargaId) {
        setIsLoading(false)
        setCierres([])
        setErrorCargaHistorial(
          String(errorSincrono?.message || errorSincrono) || 'Error síncrono al iniciar la carga. Prueba a recargar la página.'
        )
      }
    }

    return () => {
      cancelado = true
    }
  }, [año, trimestreFiltro, cargarCierres, recargarGastosEstructura, setAbiertoTrim])

  return {
    cierres,
    isLoading,
    errorCargaHistorial,
    setErrorCargaHistorial,
    gastosEstructura,
    cargandoGastosEstructura,
    errorGastosEstructura,
    setErrorGastosEstructura,
    recargarGastosEstructura,
    fuenteGastosEstructura,
  }
}
