// modules/detailedClientQuery.js
// Este módulo centraliza la lógica para obtener información detallada de un cliente,
// incluyendo el estado en tiempo real de los emisores de sus servicios.

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// Leemos la configuración desde el archivo .env
const SERVER_IP = process.env.MKW_SERVER_IP;
const API_TOKEN = process.env.MKW_API_TOKEN;

// --- INICIO DE LA CORRECCIÓN ---
// Se mueve la función getDeviceStatus aquí para romper la dependencia circular.
/**
 * Consulta el estado de un equipo de red (emisor/nodo) específico por su ID.
 * @param {number} deviceId - El ID numérico del equipo a consultar.
 * @returns {Promise<object>} Un objeto con el resultado.
 */
async function getDeviceStatus(deviceId) {
    if (!SERVER_IP || !API_TOKEN) {
        return { success: false, message: 'Configuración del servidor MikroWISP incompleta.' };
    }
    const url = `https://${SERVER_IP}/api/v1/GetMonitoreo`;
    const requestBody = { token: API_TOKEN, id: deviceId };
    try {
        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        const apiData = response.data;
        if (apiData.estado === 'exito' && apiData.equipos && apiData.equipos.length > 0) {
            const equipo = apiData.equipos[0];
            if (equipo.estado === 1) return { success: true, status: 'OK ✅' };
            if (equipo.estado === 0) return { success: true, status: 'Fallando ❌' };
            return { success: true, status: 'Desconocido ❓' };
        }
        return { success: false, status: 'No encontrado ❓' };
    } catch (error) {
        console.error(chalk.red(`❌ Error en GetMonitoreo para ID ${deviceId}:`), error.message);
        return { success: false, status: 'Error de conexión ⚠️' };
    }
}
// --- FIN DE LA CORRECCIÓN ---


/**
 * Realiza una consulta detallada de un cliente.
 * @param {string} identifier - El DNI o número de celular del cliente.
 * @returns {Promise<object>} Un objeto con el resultado detallado.
 */
async function getDetailedClientInfo(identifier) {
    if (!SERVER_IP || !API_TOKEN) {
        return { success: false, message: 'La configuración del servidor MikroWISP está incompleta.' };
    }

    // --- Paso 1: Obtener datos generales del cliente ---
    const url = `https://${SERVER_IP}/api/v1/GetClientsDetails`;
    const requestBody = { token: API_TOKEN };
    let identifierType = '';

    if (/^\d{7,8}$/.test(identifier)) {
        requestBody.cedula = identifier;
        identifierType = 'DNI';
    } else if (/^\d{10}$/.test(identifier)) {
        requestBody.movil = identifier;
        identifierType = 'Celular';
    } else {
        return { success: false, message: `El identificador '${identifier}' no es válido.` };
    }

    console.log(chalk.yellow(`\n🔍 Consulta detallada para ${identifierType}: ${identifier}`));

    let clientDetails;
    try {
        const response = await axios.post(url, requestBody, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
        if (response.data.estado === 'exito' && response.data.datos && response.data.datos.length > 0) {
            clientDetails = response.data.datos[0];
            console.log(chalk.green('✅ Datos generales del cliente encontrados.'));
        } else {
            console.log(chalk.yellow('🟡 Cliente no encontrado en MikroWISP.'));
            return { success: false, message: 'No se encontraron datos para el identificador.' };
        }
    } catch (error) {
        console.error(chalk.red('❌ Error en la llamada inicial a GetClientsDetails:'), error.message);
        return { success: false, message: 'No se pudo conectar con el servidor de MikroWISP.' };
    }

    // --- Paso 2: Cargar el mapeo de emisores ---
    let mapeoEmisores = {};
    try {
        const mapeoPath = path.join(__dirname, '..', 'mapeo_emisores.json');
        mapeoEmisores = JSON.parse(fs.readFileSync(mapeoPath, 'utf8'));
    } catch (error) {
        console.warn(chalk.yellow('⚠️ No se pudo cargar mapeo_emisores.json. Los estados de los emisores no estarán disponibles.'));
    }

    // --- Paso 3: Verificar estado de cada servicio ---
    if (clientDetails.servicios && clientDetails.servicios.length > 0) {
        console.log(chalk.yellow(`   -> Verificando estado de ${clientDetails.servicios.length} servicio(s)...`));
        const servicePromises = clientDetails.servicios.map(async (servicio) => {
            const deviceId = mapeoEmisores[servicio.emisor];
            let statusResult;

            if (deviceId !== undefined) {
                statusResult = await getDeviceStatus(deviceId); // Ahora llama a la función local
            } else {
                statusResult = { success: false, status: 'FUERA DE LINEA ❌' };
            }
            
            let estadoAntenaTexto = 'Desconocido ❓';
            if (servicio.status_user) {
                if (servicio.status_user.toLowerCase() === 'online') {
                    estadoAntenaTexto = 'ONLINE ✅';
                } else {
                    estadoAntenaTexto = 'OFFLINE ❌';
                }
            }

            return {
                ...servicio,
                estado_emisor_texto: statusResult.status,
                estado_antena_texto: estadoAntenaTexto
            };
        });
        
        clientDetails.servicios = await Promise.all(servicePromises);
    }

    return { success: true, data: clientDetails };
}

module.exports = {
    getDetailedClientInfo
};
