# Despliegue en Vercel — Viajes Tabora ERP

Guía para desplegar la aplicación de forma independiente 24/7 sin depender del ordenador local.

---

## 1. PREPARACIÓN (ya completada)

- **package.json**: Script `build` configurado (`vite build`)
- **Variables de entorno**: Centralizadas en `src/supabase.js` con fallback para desarrollo local
- **.env.example**: Plantilla para variables de producción
- **vercel.json**: Configuración SPA (React Router) y directorio de salida

---

## 2. SEGURIDAD — Variables de Supabase

La conexión con Supabase usa variables de entorno en producción:

| Variable | Descripción | Dónde obtenerla |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima (pública) | Supabase → Settings → API → anon public |

**Importante**: Usa la clave **anon** (pública), no la `service_role`. Las políticas RLS protegen los datos.

---

## 3. PASOS PARA SUBIR A GITHUB Y CONECTAR CON VERCEL

### Paso 1: Crear repositorio en GitHub

1. Entra en [github.com](https://github.com) e inicia sesión.
2. Clic en **New repository**.
3. Nombre sugerido: `viajes-tabora-erp` (o el que prefieras).
4. **No** marques "Initialize with README" si ya tienes código local.
5. Clic en **Create repository**.

### Paso 2: Subir el código a GitHub

En la terminal, desde la carpeta del proyecto:

```bash
cd /Users/andresalbarracinpastor/Desktop/Travelgroup

# Si aún no es un repositorio git
git init

# Añadir todos los archivos
git add .

# Primer commit
git commit -m "Preparado para despliegue en Vercel"

# Conectar con GitHub (sustituye TU_USUARIO y TU_REPO por tus datos)
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git

# Subir a la rama main
git branch -M main
git push -u origin main
```

Si ya tienes `origin` configurado:

```bash
git add .
git commit -m "Preparado para despliegue en Vercel"
git push origin main
```

### Paso 3: Crear proyecto en Vercel

1. Entra en [vercel.com](https://vercel.com) e inicia sesión (puedes usar tu cuenta de GitHub).
2. Clic en **Add New** → **Project**.
3. Importa el repositorio de GitHub que acabas de subir.
4. Vercel detectará automáticamente que es un proyecto Vite.

### Paso 4: Configurar variables de entorno en Vercel

Antes de desplegar:

1. En la pantalla de importación del proyecto, expande **Environment Variables**.
2. Añade:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://gtwyqxfkpdwpakmgrkbu.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | *(tu clave anon de Supabase)* |

3. Asegúrate de que estén marcadas para **Production**, **Preview** y **Development**.

### Paso 5: Desplegar

1. Clic en **Deploy**.
2. Espera a que termine el build (1–2 minutos).
3. Vercel te dará una URL tipo `https://viajes-tabora-erp-xxx.vercel.app`.

### Paso 6: Dominio personalizado (opcional)

1. En el proyecto de Vercel, ve a **Settings** → **Domains**.
2. Añade tu dominio (ej. `app.viajestabora.com`).
3. Sigue las instrucciones para configurar DNS.

---

## 4. ACTUALIZACIONES FUTURAS

Cada vez que hagas `git push` a `main`, Vercel desplegará automáticamente:

```bash
git add .
git commit -m "Descripción del cambio"
git push origin main
```

---

## 5. DESARROLLO LOCAL CON .env (opcional)

Para usar variables de entorno en local:

```bash
cp .env.example .env
# Edita .env y pega tu VITE_SUPABASE_ANON_KEY
```

Si no creas `.env`, la app usará los valores por defecto (fallback en `supabase.js`).

---

## 6. VERIFICACIÓN POST-DESPLIEGUE

- [ ] La app carga correctamente en la URL de Vercel.
- [ ] Login / acceso a datos funciona (conexión con Supabase).
- [ ] Navegación entre rutas funciona (React Router).
- [ ] Los PDFs (facturas, recibos) se generan correctamente.

Si hay errores de conexión con Supabase, revisa:
- Que las variables de entorno estén bien configuradas en Vercel.
- Que las políticas RLS en Supabase permitan las operaciones necesarias.
- Que la URL de Supabase sea la correcta (sin espacios ni caracteres extra).
