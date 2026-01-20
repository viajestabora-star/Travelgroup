#!/bin/bash

# Script para liberar el puerto 5174
# Uso: ./kill-port-5174.sh

echo "🔍 Buscando procesos en el puerto 5174..."

# Buscar el PID del proceso que está usando el puerto 5174
PID=$(lsof -ti:5174)

if [ -z "$PID" ]; then
    echo "✅ El puerto 5174 está libre. No hay procesos que matar."
    exit 0
else
    echo "⚠️  Proceso encontrado con PID: $PID"
    echo "📋 Detalles del proceso:"
    lsof -i:5174
    echo ""
    echo "💀 Matando proceso..."
    kill -9 $PID
    
    # Verificar si se mató correctamente
    sleep 1
    STILL_RUNNING=$(lsof -ti:5174)
    
    if [ -z "$STILL_RUNNING" ]; then
        echo "✅ Puerto 5174 liberado correctamente."
    else
        echo "❌ No se pudo liberar el puerto. Intenta con sudo:"
        echo "   sudo ./kill-port-5174.sh"
    fi
fi
