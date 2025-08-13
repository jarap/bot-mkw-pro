// scripts/asignar_pago_mkw.js
const axios = require('axios');
const path = require('path');
const chalk = require('chalk');

// --- Función de Respuesta y Salida ---
// Esta es la ÚNICA función que debe escribir en console.log
function responder(data) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}

function errorFatal(mensaje, detallesError = null) {
    // Todos los logs de error se envían a console.error para no contaminar la salida JSON
    console.error(chalk.red(`[asignar_pago_mkw.js] ERROR: ${mensaje}`), detallesError || '');
    responder({ success: false, message: mensaje, details: detallesError?.message || detallesError });
}

// --- Carga de Configuración ---
const server_ip = process.env.MKW_SERVER_IP;
const api_token = process.env.MKW_API_TOKEN;

if (!server_ip || !api_token) {
    errorFatal("Configuración de MikroWISP incompleta. Las variables de entorno no se cargaron.");
}

// --- Recepción de Argumentos ---
const idFactura = process.argv[2];
const monto = process.argv[3];
const fecha = process.argv[4];
const metodoPago = process.argv[5] || 'Transferencia Bot';
const referencia = process.argv[6] || 'N/A';

// --- Validación de Argumentos ---
if (!idFactura || !monto || !fecha) {
    errorFatal("Faltan argumentos requeridos. Se necesita: idFactura, monto y fecha.");
}

// --- Lógica Principal ---
async function registrarPago() {
    const url = `https://${server_ip}/api/v1/PaidInvoice`;
    
    const requestBody = {
        token: api_token,
        idfactura: parseInt(idFactura, 10),
        cantidad: parseFloat(monto),
        fecha: fecha,
        pasarela: metodoPago,
        idtransaccion: referencia
        // CORRECCIÓN: Se elimina el campo 'comentario' que no es aceptado por la API.
    };

    console.error(chalk.yellow('📡 Registrando pago en MikroWISP con los siguientes datos:'), requestBody);

    try {
        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000
        });

        const apiData = response.data;

        if (apiData.estado === 'exito') {
            console.error(chalk.green('✅ Pago registrado exitosamente en MikroWISP.'));
            responder({ success: true, message: apiData.mensaje || 'Pago registrado con éxito.' });
        } else {
            errorFatal('La API de MikroWISP devolvió un error.', apiData.mensaje || 'Respuesta no exitosa.');
        }

    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        errorFatal('Error de conexión al intentar registrar el pago en MikroWISP.', errorMessage);
    }
}

// --- Ejecución ---
registrarPago();
