#!/bin/bash

# ==============================================================================
# == INSTALADOR AUTOMÁTICO PARA BOT-MKW PRO (v7 - Orden Corregido) ==============
# ==============================================================================
#
# Este script instala el bot, genera un token de API único y muestra las
# instrucciones de configuración para Mikrowisp al finalizar.
#
# ==============================================================================

# --- Variables de configuración ---
ZIP_URL="https://github.com/jarap/bot-mkw-pro/archive/refs/heads/main.zip"
PROJECT_DIR_FROM_ZIP="bot-mkw-pro-main"
PROJECT_DIR="mkw-support"
PM2_APP_NAME="bot-mkw"

# --- Colores para la salida ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# --- Inicio del Script ---
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}== Iniciando la instalación de Bot-MKW ==${NC}"
echo -e "${BLUE}=========================================${NC}\n"

# --- 1. Generación de Token de API ---
echo -e "${YELLOW}---> Generando un nuevo token de API seguro...${NC}"
NEW_API_TOKEN=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
echo -e "${GREEN}Token generado con éxito.${NC}\n"

# --- 2. Dependencias del sistema ---
echo -e "${YELLOW}---> Verificando dependencias del sistema...${NC}"
if ! command -v node &>/dev/null || ! command -v pm2 &>/dev/null || ! command -v unzip &>/dev/null; then
    echo "Faltan dependencias. Intentando instalarlas..."
    apt-get update &>/dev/null && apt-get install -y unzip &>/dev/null
    if ! command -v node &> /dev/null; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install 18 && nvm use 18 && nvm alias default 18
    fi
    if ! command -v pm2 &> /dev/null; then
        npm install pm2 -g
    fi
else
    echo -e "${GREEN}Todas las dependencias necesarias ya están instaladas.${NC}"
fi
echo ""

# --- 3. Descarga y Descompresión del Proyecto ---
echo -e "${YELLOW}---> Descargando el proyecto como ZIP...${NC}"
if [ -d "$PROJECT_DIR" ]; then
    echo "El directorio del proyecto '$PROJECT_DIR' ya existe. Omitiendo descarga."
else
    curl -L -o bot_project.zip "$ZIP_URL"
    unzip -q bot_project.zip
    mv "$PROJECT_DIR_FROM_ZIP" "$PROJECT_DIR"
    rm bot_project.zip
    echo -e "${GREEN}Proyecto descargado y descomprimido con éxito.${NC}"
fi

if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}Error: La descarga o descompresión del proyecto falló. No se puede continuar.${NC}"
    exit 1
fi

cd "$PROJECT_DIR"
echo ""

# --- 4. Inyección del Token en el Archivo de API ---
echo -e "${YELLOW}---> Configurando el nuevo token en la API...${NC}"
sed -i "s/const API_TOKEN = '.*';/const API_TOKEN = '$NEW_API_TOKEN';/" "modules/mikrowispApi.js"
echo -e "${GREEN}Token inyectado correctamente.${NC}\n"

# --- 5. Instalación de Dependencias de Node ---
echo -e "${YELLOW}---> Instalando dependencias del proyecto (npm install)...${NC}"
npm install
echo ""

# --- 6. Configuración del Usuario del Panel ---
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

# --- 7. Iniciar la Aplicación con PM2 ---
echo -e "${YELLOW}---> Iniciando la aplicación con PM2...${NC}"
pm2 start app.js --name "$PM2_APP_NAME"
pm2 save
echo ""

# --- 8. Configuración del Inicio Automático (SECCIÓN MODIFICADA) ---
echo -e "${YELLOW}---> Generando comando de inicio automático...${NC}"
echo -e "Para que el bot se inicie automáticamente si el servidor se reinicia,"
echo -e "ejecuta el siguiente comando que PM2 ha generado y sigue las instrucciones:"
pm2 startup
echo ""

# --- 9. Mensaje Final con Instrucciones (SECCIÓN MODIFICADA) ---
SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${CYAN}======================================================================${NC}"
echo -e "${GREEN}            ✅ ¡INSTALACIÓN COMPLETADA! ✅            ${NC}"
echo -e "${CYAN}======================================================================${NC}"
echo ""
echo -e "➡️  **Panel de Control Web:**"
echo -e "    Puedes acceder al panel desde un navegador en: ${YELLOW}http://$SERVER_IP:6780${NC}"
echo ""
echo -e "➡️  **Instrucciones para configurar el Gateway en Mikrowisp:**"
echo -e "    Copia y pega los siguientes valores en la sección 'Gateway Genérico':"
echo ""
echo -e "    ${BLUE}URL Gateway:${NC}"
echo -e "    ${YELLOW}http://127.0.0.1:3000/send-message${NC}"
echo ""
echo -e "    ${BLUE}Parámetros:${NC}"
echo -e "    ${YELLOW}destinatario={{destinatario}}&mensaje={{mensaje}}${NC}"
echo ""
echo -e "    ${BLUE}Método:${NC}"
echo -e "    ${YELLOW}Envío GET${NC}"
echo ""
echo -e "    ${BLUE}Token Authorization Bearer:${NC}"
echo -e "    ${YELLOW}$NEW_API_TOKEN${NC}   <-- ¡Este es tu nuevo token!"
echo ""
echo -e "    ${BLUE}Límite Caracteres:${NC} ${YELLOW}2000${NC}"
echo -e "    ${BLUE}Pausa Entre Mensaje:${NC} ${YELLOW}5${NC}"
echo ""
echo -e "    Y no olvides marcar la opción **'Activar Gateway'**."
echo ""
echo -e "${CYAN}======================================================================${NC}"
