// actualizarMapeo.js
// Script independiente para generar el mapeo de Nombre de Emisor a ID de Monitoreo.
// Se recomienda ejecutar este script periódicamente (ej. una vez al día) con un cron job.

// --- INICIO DE CORRECCIÓN ---
// Se estandariza la carga de variables de entorno.
require('dotenv').config();
// --- FIN DE CORRECCIÓN ---
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Leemos la configuración desde el archivo .env
const SERVER_IP = process.env.MKW_SERVER_IP;
const API_TOKEN = process.env.MKW_API_TOKEN;

const RUTA_MAPEO = path.join(__dirname, 'mapeo_emisores.json');

async function actualizarMapeo() {
    console.log(chalk.blue(`[${new Date().toLocaleString()}] Iniciando actualización de mapeo de emisores...`));

    if (!SERVER_IP || !API_TOKEN) {
        console.error(chalk.red('❌ Error: Faltan las variables de entorno MKW_SERVER_IP o MKW_API_TOKEN en el archivo .env.'));
        return;
    }

    const url = `https://${SERVER_IP}/api/v1/GetMonitoreo`;
    const requestBody = {
        token: API_TOKEN,
        id: -1 // El id -1 le pide a la API que devuelva todos los equipos
    };

    try {
        console.log(chalk.yellow('📡 Solicitando lista completa de equipos a MikroWISP...'));
        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 // 30 segundos de tiempo de espera
        });

        const apiData = response.data;

        if (apiData.estado === 'exito' && apiData.equipos && Array.isArray(apiData.equipos)) {
            const nuevoMapeo = {};
            apiData.equipos.forEach(equipo => {
                if (equipo.nombre && (equipo.id || equipo.id === 0)) {
                    nuevoMapeo[equipo.nombre] = equipo.id;
                }
            });

            fs.writeFileSync(RUTA_MAPEO, JSON.stringify(nuevoMapeo, null, 2), 'utf8');
            console.log(chalk.green(`✅ Mapeo de ${Object.keys(nuevoMapeo).length} emisores guardado correctamente en ${RUTA_MAPEO}`));
        } else {
            console.error(chalk.red('❌ La respuesta de la API de MikroWISP no fue exitosa o no contenía equipos.'));
            console.error('Respuesta recibida:', apiData);
        }

    } catch (error) {
        console.error(chalk.red('❌ Error crítico durante la actualización del mapeo:'), error.message);
    }
}

// Ejecutamos la función
actualizarMapeo();
