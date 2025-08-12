// scripts/info_cliente_mkw.js
const request = require('request');
const fs = require('fs');
const path = require('path');
// --- INICIO DE MODIFICACIÓN ---
// Cargar las variables de entorno desde el archivo .env en la raíz del proyecto
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// --- FIN DE MODIFICACIÓN ---

function responder(data) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}

function errorFatal(mensaje, detallesError = null) {
    console.error(`[info_cliente_mkw.js] ERROR: ${mensaje}`);
    if (detallesError) console.error("Detalles:", detallesError);
    responder({ success: false, message: mensaje, details: detallesError?.message || detallesError });
}

const identificadorCliente = process.argv[3]; // El argumento 'filtro' está en argv[2]

if (!identificadorCliente) {
    errorFatal("Se requiere un DNI o Nro. Celular como argumento.");
}

// --- INICIO DE MODIFICACIÓN ---
// Leer la configuración desde las variables de entorno
const server_ip = process.env.MKW_SERVER_IP;
const api_token = process.env.MKW_API_TOKEN;
// --- FIN DE MODIFICACIÓN ---

if (!server_ip || !api_token) {
    errorFatal("Configuración incompleta. Asegúrate de que MKW_SERVER_IP y MKW_API_TOKEN estén en tu archivo .env.");
}

const urlGetClientDetails = `https://${server_ip}/api/v1/GetClientsDetails`;
const clientDetailsRequestBody = { token: api_token };
let tipoIdentificadorLog = "";

if (/^\d{7,8}$/.test(identificadorCliente)) {
    clientDetailsRequestBody.cedula = identificadorCliente;
    tipoIdentificadorLog = "DNI/cédula";
} else if (/^\d{10}$/.test(identificadorCliente)) {
    clientDetailsRequestBody.movil = identificadorCliente;
    tipoIdentificadorLog = "móvil";
} else {
    errorFatal(`Identificador '${identificadorCliente}' no tiene formato de DNI o celular.`);
}

console.error(`[info_cliente_mkw.js] Solicitando detalles para ${tipoIdentificadorLog}: ${identificadorCliente}`);

request({
    method: 'POST',
    url: urlGetClientDetails,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientDetailsRequestBody),
    timeout: 20000
}, (error, response, body) => {
    if (error) {
        return errorFatal("Error de conexión al consultar datos del cliente.", error);
    }
    let clientDetailsResponse;
    try {
        clientDetailsResponse = JSON.parse(body);
    } catch (e) {
        return errorFatal("Respuesta no válida (no JSON) del servidor.", body);
    }

    if (response.statusCode !== 200 || clientDetailsResponse.estado !== 'exito' || !clientDetailsResponse.datos || clientDetailsResponse.datos.length === 0) {
        return responder({ success: false, message: `No se encontraron datos para el ${tipoIdentificadorLog}: ${identificadorCliente}.`, clientData: null });
    }
    
    responder({
        success: true,
        message: "Datos del cliente obtenidos correctamente.",
        clientData: clientDetailsResponse.datos[0]
    });
});
