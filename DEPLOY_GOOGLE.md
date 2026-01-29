# 🚀 Guía de Despliegue en Google Cloud Platform

## Opción 1: Firebase Hosting (Recomendado para React/Vite)

### Pasos para desplegar:

1. **Instalar Firebase CLI:**
```bash
npm install -g firebase-tools
```

2. **Iniciar sesión en Firebase:**
```bash
firebase login
```

3. **Inicializar Firebase en el proyecto:**
```bash
firebase init hosting
```

4. **Configuración durante `firebase init`:**
   - ¿Qué directorio usar para los archivos públicos? → `dist`
   - ¿Configurar como SPA? → `Sí`
   - ¿Configurar GitHub Actions? → `No` (opcional)

5. **Compilar la aplicación:**
```bash
npm run build
```

6. **Desplegar:**
```bash
firebase deploy --only hosting
```

### URL resultante:
Tu aplicación estará disponible en:
- **URL de producción:** `https://[PROJECT-ID].web.app`
- **URL alternativa:** `https://[PROJECT-ID].firebaseapp.com`

---

## Opción 2: Google Cloud Run (Contenedorizado)

### Pasos:

1. **Crear Dockerfile:**
```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

2. **Crear nginx.conf:**
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

3. **Desplegar en Cloud Run:**
```bash
gcloud run deploy viajes-tabora \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Opción 3: Google App Engine

### Crear `app.yaml`:
```yaml
runtime: nodejs18
service: default

handlers:
  - url: /.*
    static_files: dist/index.html
    upload: dist/index.html
  - url: /(.*)
    static_files: dist/\1
    upload: dist/(.*)
```

### Desplegar:
```bash
npm run build
gcloud app deploy
```

---

## 🔧 Configuración necesaria

### Variables de entorno (si las necesitas):
Crea un archivo `.env.production`:
```env
VITE_SUPABASE_URL=https://gtwyqxfkpdwpakmgrkbu.supabase.co
VITE_SUPABASE_KEY=tu_clave_aqui
```

### Actualizar vite.config.js para producción:
```js
export default defineConfig({
  plugins: [react()],
  base: '/', // O '/ruta/' si está en subdirectorio
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
```

---

## 📝 Notas importantes

1. **Supabase:** Ya está configurado con la URL: `https://gtwyqxfkpdwpakmgrkbu.supabase.co`
2. **SPA Routing:** Asegúrate de configurar redirects para React Router
3. **HTTPS:** Todas las opciones de Google Cloud incluyen HTTPS automático
4. **Dominio personalizado:** Puedes configurar un dominio propio en cualquiera de las opciones

---

## 🎯 Recomendación

**Firebase Hosting** es la opción más sencilla y rápida para una aplicación React/Vite:
- ✅ Despliegue en minutos
- ✅ HTTPS automático
- ✅ CDN global
- ✅ Dominio personalizado gratuito
- ✅ Integración con Firebase (si necesitas más servicios)

### Comando rápido (Firebase):
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

Tu URL será: `https://[tu-proyecto].web.app`
