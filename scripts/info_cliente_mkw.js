// scripts/info_cliente_mkw.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
//require('dotenv').config();


function responder(data) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}

function errorFatal(mensaje, detallesError = null) {
    console.error(`[info_cliente_mkw.js] ERROR: ${mensaje}`);
    if (detallesError) console.error("Detalles:", detallesError);
    responder({ success: false, message: mensaje, details: detallesError?.message || detallesError });
}

const identificadorCliente = process.argv[2];

if (!identificadorCliente) {
    errorFatal("Se requiere un DNI o Nro. Celular como argumento.");
}

const server_ip = process.env.MKW_SERVER_IP;
const api_token = process.env.MKW_API_TOKEN;

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

console.error(`[PUNTO 1 - INFO] Solicitando detalles para ${tipoIdentificadorLog}: ${identificadorCliente}`);

(async () => {
    try {
        console.error(`[PUNTO 2 - INFO] Petición a MikroWisp:`, JSON.stringify(clientDetailsRequestBody, null, 2));
        const response = await axios.post(urlGetClientDetails, clientDetailsRequestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000
        });

        const clientDetailsResponse = response.data;
        console.error(`[PUNTO 3 - INFO] Respuesta COMPLETA de MikroWisp:`, JSON.stringify(clientDetailsResponse, null, 2));

        if (clientDetailsResponse.estado !== 'exito' || !clientDetailsResponse.datos || clientDetailsResponse.datos.length === 0) {
            return responder({ success: false, message: `No se encontraron datos para el ${tipoIdentificadorLog}: ${identificadorCliente}.`, clientData: null });
        }
        
        responder({
            success: true,
            message: "Datos del cliente obtenidos correctamente.",
            clientData: clientDetailsResponse.datos[0]
        });

    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        errorFatal("Error de conexión al consultar datos del cliente.", errorMessage);
    }
})();
