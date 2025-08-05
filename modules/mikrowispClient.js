// modules/mikrowispClient.js
// Este módulo ahora actúa como una fachada, utilizando el nuevo motor de consulta detallada.

const axios = require('axios');
const chalk = require('chalk');
// --- INICIO DE LA MODIFICACIÓN ---
// Importamos el nuevo módulo de consulta detallada.
const { getDetailedClientInfo } = require('./detailedClientQuery');
// --- FIN DE LA MODIFICACIÓN ---

// Leemos la configuración desde el archivo .env
const SERVER_IP = process.env.MKW_SERVER_IP;
const API_TOKEN = process.env.MKW_API_TOKEN;

/**
 * Consulta los detalles de un cliente en MikroWISP.
 * ESTA FUNCIÓN AHORA ES UN WRAPPER PARA LA NUEVA LÓGICA DETALLADA.
 * @param {string} identifier - El DNI o número de celular del cliente.
 * @returns {Promise<object>} Un objeto con el resultado.
 */
async function getClientDetails(identifier) {
    // --- INICIO DE LA MODIFICACIÓN ---
    // Toda la lógica anterior se reemplaza por una llamada a nuestro nuevo módulo.
    return getDetailedClientInfo(identifier);
    // --- FIN DE LA MODIFICACIÓN ---
}


/**
 * Consulta el estado de un equipo de red (emisor/nodo) específico por su ID.
 * Esta función se mantiene ya que es utilizada por el nuevo módulo de consulta.
 * @param {number} deviceId - El ID numérico del equipo a consultar.
 * @returns {Promise<object>} Un objeto con el resultado.
 */
async function getDeviceStatus(deviceId) {
    if (!SERVER_IP || !API_TOKEN) {
        return { success: false, message: 'Configuración del servidor MikroWISP incompleta.' };
    }

    const url = `https://${SERVER_IP}/api/v1/GetMonitoreo`;
    const requestBody = {
        token: API_TOKEN,
        id: deviceId
    };

    try {
        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10 segundos
        });

        const apiData = response.data;

        if (apiData.estado === 'exito' && apiData.equipos && apiData.equipos.length > 0) {
            const equipo = apiData.equipos[0];
            // La API devuelve estado 1 para OK y 0 para Fallando.
            if (equipo.estado === 1) {
                return { success: true, status: 'OK ✅' };
            } else if (equipo.estado === 0) {
                return { success: true, status: 'Fallando ❌' };
            } else {
                return { success: true, status: 'Desconocido ❓' };
            }
        } else {
            return { success: false, message: apiData.mensaje || 'No se encontró el equipo.' };
        }

    } catch (error) {
        console.error(chalk.red(`❌ Error en la llamada a la API de MikroWISP (GetMonitoreo para ID ${deviceId}):`), error.message);
        return { success: false, message: 'Error de conexión con el servicio de monitoreo.' };
    }
}

// Exportamos ambas funciones
module.exports = {
    getClientDetails,
    getDeviceStatus
};
