# 🔧 Configuración del Puerto 5174

## ✅ Configuración Aplicada

El archivo `vite.config.js` ahora está configurado para usar **estrictamente el puerto 5174**:

```javascript
server: {
  port: 5174,
  strictPort: true, // Si el puerto está ocupado, dará error
  host: true, // Permite acceso desde la red local
}
```

---

## 🚀 Iniciar el Servidor

```bash
npm run dev
```

El servidor SIEMPRE iniciará en: **http://localhost:5174/**

---

## ⚠️ Si el Puerto 5174 está Ocupado

Si ves este error:
```
Error: Port 5174 is in use
```

### Opción 1: Usar el Script Automático (Recomendado)

```bash
./kill-port-5174.sh
```

### Opción 2: Comandos Manuales en macOS/Linux

#### Ver qué proceso está usando el puerto:
```bash
lsof -i:5174
```

#### Matar el proceso (sustituye [PID] por el número que aparece):
```bash
kill -9 [PID]
```

#### Comando Todo-en-Uno (mata automáticamente):
```bash
lsof -ti:5174 | xargs kill -9
```

### Opción 3: Si el proceso requiere permisos de administrador

```bash
sudo lsof -ti:5174 | xargs sudo kill -9
```

---

## 🔍 Verificar que el Puerto está Libre

Antes de iniciar el servidor, puedes verificar:

```bash
lsof -i:5174
```

Si no devuelve nada, el puerto está libre ✅

---

## 📋 Ejemplo de Uso Completo

```bash
# 1. Liberar el puerto si está ocupado
./kill-port-5174.sh

# 2. Iniciar el servidor
npm run dev

# Resultado esperado:
# ➜  Local:   http://localhost:5174/
```

---

## 🛠️ Solución de Problemas

### El script no tiene permisos de ejecución:
```bash
chmod +x kill-port-5174.sh
```

### Ver todos los puertos en uso:
```bash
lsof -i -P | grep LISTEN
```

### Reiniciar Vite si hay cambios en la configuración:
1. Detener el servidor: `Ctrl + C`
2. Limpiar caché: `rm -rf node_modules/.vite`
3. Reiniciar: `npm run dev`

---

## 📱 Acceso desde Otros Dispositivos

Gracias a `host: true`, puedes acceder al ERP desde otros dispositivos en tu red local:

1. Encuentra tu IP local:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. Desde otro dispositivo, accede a:
   ```
   http://[TU_IP]:5174
   ```

Ejemplo: `http://192.168.1.100:5174`

---

## ✅ Checklist de Configuración

- [x] Puerto fijo en 5174 con `strictPort: true`
- [x] Script `kill-port-5174.sh` creado
- [x] Permisos de ejecución otorgados
- [x] Acceso a red local habilitado
- [x] Sin enlaces hardcodeados a otros puertos

---

**🎯 Tu ERP siempre estará disponible en: http://localhost:5174/**
