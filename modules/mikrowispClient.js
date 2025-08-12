// modules/mikrowispClient.js
const chalk = require('chalk');
const { llamarScriptExterno } = require('./external_scripts.js');
const { getDetailedClientInfo } = require('./detailedClientQuery');

/**
 * Consulta los detalles de un cliente en MikroWISP usando un script externo.
 * @param {string} identifier - El DNI o número de celular del cliente.
 * @returns {Promise<object>} Un objeto con el resultado.
 */
async function getClientDetails(identifier) {
    console.log(chalk.cyan(`   -> [mikrowispClient] Solicitando detalles para: ${identifier} a través de script externo.`));
    
    // Usamos el nuevo módulo de consulta detallada que a su vez usa el script externo
    // para mantener la lógica de enriquecimiento de datos.
    try {
        const result = await getDetailedClientInfo(identifier);
        return result;
    } catch (error) {
        console.error(chalk.red('❌ Error fatal llamando a getDetailedClientInfo desde mikrowispClient:'), error);
        return { success: false, message: 'Error interno al procesar la solicitud del cliente.' };
    }
}

// Mantenemos esta función aquí, ya que es una dependencia de 'detailedClientQuery'
async function getDeviceStatus(deviceId) {
    // Esta función ya estaba bien, la dejamos como está.
    const SERVER_IP = process.env.MKW_SERVER_IP;
    const API_TOKEN = process.env.MKW_API_TOKEN;

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
        } else {
            return { success: false, message: apiData.mensaje || 'No se encontró el equipo.' };
        }
    } catch (error) {
        console.error(chalk.red(`❌ Error en API GetMonitoreo para ID ${deviceId}:`), error.message);
        return { success: false, status: 'ERROR_API 🚨' };
    }
}


module.exports = {
    getClientDetails,
    getDeviceStatus
};
