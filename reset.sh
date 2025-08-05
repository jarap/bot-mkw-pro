#!/bin/bash

# Script para reiniciar y ver los logs de un proceso de PM2

# Nombre del proceso de PM2
PROCESS_NAME="bot-mkw"

echo "----------------------------------------"
echo "Reiniciando el proceso: $PROCESS_NAME"
echo "----------------------------------------"

# Comando para reiniciar el bot
pm2 restart $PROCESS_NAME

# Pausa breve para asegurar que el reinicio se inicie correctamente
sleep 1

echo "----------------------------------------"
echo "Mostrando logs de: $PROCESS_NAME"
echo "Para salir, presiona Ctrl+C"
echo "----------------------------------------"

# Comando para mostrar los logs
pm2 logs $PROCESS_NAME


