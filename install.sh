#!/bin/bash

# ==============================================================================
# == INSTALADOR PARA BOT-MKW PRO (v4 - Descarga por ZIP) =======================
# ==============================================================================
#
# Este script automatiza la instalación descargando el proyecto como un ZIP
# para máxima compatibilidad, sin depender de un 'git clone' funcional.
#
# ==============================================================================

# --- Variables de configuración ---
ZIP_URL="https://github.com/jarap/bot-mkw-pro/archive/refs/heads/main.zip"
PROJECT_DIR_FROM_ZIP="bot-mkw-pro-main" # El nombre de la carpeta que está dentro del ZIP
PROJECT_DIR="mkw-support"
PM2_APP_NAME="bot-mkw"

# --- Colores para la salida ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # Sin color

# --- Inicio del Script ---
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}== Iniciando la instalación de Bot-MKW ==${NC}"
echo -e "${BLUE}=========================================${NC}\n"

# --- 1. Dependencias del sistema (Node, PM2, unzip) ---
echo -e "${YELLOW}---> Verificando dependencias del sistema...${NC}"
# Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js no está instalado. Instalando la versión 18.x..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 18 && nvm use 18 && nvm alias default 18
else
    echo -e "${GREEN}Node.js ya está instalado.${NC}"
fi

# PM2
if ! command -v pm2 &> /dev/null; then
    echo "Instalando PM2 globalmente..."
    npm install pm2 -g
else
    echo -e "${GREEN}PM2 ya está instalado.${NC}"
fi

# Unzip (NUEVO)
if ! command -v unzip &> /dev/null; then
    echo "Utilidad 'unzip' no está instalada. Instalando..."
    apt-get update && apt-get install unzip -y
else
    echo -e "${GREEN}La utilidad 'unzip' ya está instalada.${NC}"
fi
echo ""

# --- 2. Descarga y Descompresión del Proyecto (SECCIÓN MODIFICADA) ---
echo -e "${YELLOW}---> Descargando el proyecto como ZIP...${NC}"
if [ -d "$PROJECT_DIR" ]; then
    echo "El directorio del proyecto '$PROJECT_DIR' ya existe. Omitiendo descarga."
else
    # Descargar el archivo ZIP usando wget
    wget -O bot_project.zip "$ZIP_URL"
    
    # Descomprimir el archivo
    unzip -q bot_project.zip
    
    # Renombrar la carpeta descomprimida al nombre correcto
    mv "$PROJECT_DIR_FROM_ZIP" "$PROJECT_DIR"
    
    # Limpiar el archivo ZIP descargado
    rm bot_project.zip
    
    echo -e "${GREEN}Proyecto descargado y descomprimido con éxito.${NC}"
fi

# Verificación final antes de continuar
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}Error: La descarga o descompresión del proyecto falló. No se puede continuar.${NC}"
    exit 1
fi

cd "$PROJECT_DIR"
echo ""

# --- 3. Instalación de Dependencias de Node ---
echo -e "${YELLOW}---> Instalando dependencias del proyecto (npm install)...${NC}"
npm install
echo ""

# --- 4. Configuración del Usuario del Panel ---
echo -e "${YELLOW}---> Configurando el archivo de usuarios (users.json)...${NC}"
if [ -f "users.json" ]; then
    echo -e "${GREEN}El archivo 'users.json' ya existe. Se conservará la configuración actual.${NC}"
else
    echo "Creando un nuevo archivo 'users.json'."
    read -p "Introduce el nombre de usuario para el panel: " admin_user
    read -s -p "Introduce la contraseña para '$admin_user': " admin_pass
    echo
    
    JSON_CONTENT="{\n  \"$admin_user\": \"$admin_pass\"\n}"
    echo -e "$JSON_CONTENT" > users.json
    
    echo -e "${GREEN}¡Archivo 'users.json' creado con éxito!${NC}"
fi
echo ""

# --- 5. Iniciar la Aplicación con PM2 ---
echo -e "${YELLOW}---> Iniciando la aplicación con PM2...${NC}"
pm2 start app.js --name "$PM2_APP_NAME"
pm2 save
echo ""

# --- Fin del Script ---
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}==         ¡Instalación Completada!               ==${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "El Bot-MKW se ha iniciado con PM2 bajo el nombre: ${BLUE}$PM2_APP_NAME${NC}"
echo ""
echo -e "Accede al panel web desde un navegador en la IP de este servidor y el puerto 6780."
echo -e "Ejemplo: ${YELLOW}http://<IP_DEL_SERVIDOR>:6780${NC}"
echo ""
echo -e "${YELLOW}PASO FINAL IMPORTANTE:${NC}"
echo -e "Para que el bot se inicie automáticamente si el servidor se reinicia,"
echo -e "ejecuta el siguiente comando que PM2 ha generado y sigue las instrucciones:"
pm2 startup

