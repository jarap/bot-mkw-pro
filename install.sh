#!/bin/bash

# ==============================================================================
# == INSTALADOR PARA BOT-MKW PRO ===============================================
# ==============================================================================
#
# Este script automatiza la instalación y configuración del Bot-MKW en un
# sistema Linux (recomendado: Ubuntu/Debian).
#
# ==============================================================================

# --- Variables de configuración (puedes ajustar esto) ---
GIT_REPO="https://github.com/jarap/bot-mkw-pro.git"
PROJECT_DIR="mkw-support"
PM2_APP_NAME="bot-mkw"

# --- Colores para la salida ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # Sin color

# --- Inicio del Script ---
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}== Iniciando la instalación de Bot-MKW ==${NC}"
echo -e "${BLUE}=========================================${NC}\n"

# --- 1. Verificación e Instalación de Node.js y npm ---
echo -e "${YELLOW}---> Verificando Node.js...${NC}"
if ! command -v node &> /dev/null
then
    echo "Node.js no está instalado. Instalando la versión 18.x..."
    # Usamos nvm para instalar Node.js
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    nvm install 18
    nvm use 18
    nvm alias default 18
else
    echo -e "${GREEN}Node.js ya está instalado.${NC}"
fi
echo ""

# --- 2. Instalación de PM2 (Process Manager) ---
echo -e "${YELLOW}---> Verificando PM2...${NC}"
if ! command -v pm2 &> /dev/null
then
    echo "Instalando PM2 globalmente..."
    npm install pm2 -g
else
    echo -e "${GREEN}PM2 ya está instalado.${NC}"
fi
echo ""

# --- 3. Clonación del Repositorio ---
echo -e "${YELLOW}---> Clonando el proyecto desde Git...${NC}"
if [ -d "$PROJECT_DIR" ]; then
    echo "El directorio del proyecto '$PROJECT_DIR' ya existe. Omitiendo clonación."
else
    git clone "$GIT_REPO" "$PROJECT_DIR"
fi
cd "$PROJECT_DIR"
echo ""

# --- 4. Instalación de Dependencias del Proyecto ---
echo -e "${YELLOW}---> Instalando dependencias del proyecto (npm install)...${NC}"
npm install
echo ""

# --- 5. Configuración del Usuario del Panel ---
echo -e "${YELLOW}---> Configurando el archivo de usuarios (users.json)...${NC}"
if [ -f "users.json" ]; then
    echo -e "${GREEN}El archivo 'users.json' ya existe. Se conservará la configuración actual.${NC}"
else
    echo "Creando un nuevo archivo 'users.json'."
    read -p "Introduce el nombre de usuario para el panel: " admin_user
    read -s -p "Introduce la contraseña para '$admin_user': " admin_pass
    echo
    
    # Crear el contenido JSON
    JSON_CONTENT="{\n  \"$admin_user\": \"$admin_pass\"\n}"
    
    # Escribir en el archivo
    echo -e "$JSON_CONTENT" > users.json
    
    echo -e "${GREEN}¡Archivo 'users.json' creado con éxito!${NC}"
fi
echo ""

# --- 6. Iniciar la Aplicación con PM2 ---
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
echo -e "Puedes ver los logs con el comando: ${YELLOW}pm2 logs $PM2_APP_NAME${NC}"
echo -e "Puedes ver el estado de la aplicación con: ${YELLOW}pm2 status${NC}"
echo ""
echo -e "La aplicación está escuchando en los siguientes puertos:"
echo -e " - API de Mikrowisp: ${YELLOW}puerto 3000${NC}"
echo -e " - Panel de Control Web: ${YELLOW}puerto 6780${NC}"
echo ""
echo -e "${YELLOW}PASO FINAL IMPORTANTE:${NC}"
echo -e "Para asegurarte de que el bot se inicie automáticamente cuando el servidor se reinicie,"
echo -e "ejecuta el siguiente comando que PM2 ha generado y sigue sus instrucciones:"
pm2 startup
