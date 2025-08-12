// scripts/facturas_mkw.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
// La línea require('dotenv').config(); ha sido eliminada.

function responder(data) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}

function errorFatal(mensaje, detallesError = null) {
    console.error(`[facturas_mkw.js] ERROR: ${mensaje}`);
    if (detallesError) console.error("Detalles:", detallesError);
    responder({ success: false, message: mensaje, details: detallesError?.message || detallesError });
}

const accion = process.argv[2];
const identificadorPrincipal = process.argv[3];

const server_ip = process.env.MKW_SERVER_IP;
const api_token = process.env.MKW_API_TOKEN;

if (!server_ip || !api_token) {
    errorFatal("Configuración de MikroWISP incompleta. Las variables de entorno no se cargaron.");
}

async function listarFacturas() {
    if (!identificadorPrincipal) {
        return errorFatal("Se requiere DNI para listar facturas.");
    }

    const dniCliente = identificadorPrincipal;
    const urlGetClientDetails = `https://${server_ip}/api/v1/GetClientsDetails`;
    const clientDetailsRequestBody = { token: api_token, cedula: dniCliente };

    try {
        const clientResponse = await axios.post(urlGetClientDetails, clientDetailsRequestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const clientDetails = clientResponse.data;
        if (clientDetails.estado !== 'exito' || !clientDetails.datos || clientDetails.datos.length === 0) {
            return responder({ success: false, message: `DNI no encontrado o error al verificar: ${clientDetails.mensaje || 'Cliente no existe.'}` });
        }

        const idClienteMikrowisp = clientDetails.datos[0].id;
        if (!idClienteMikrowisp) {
            return responder({ success: false, message: "No se pudo obtener el ID interno del cliente." });
        }

        const urlListarFacturas = `https://${server_ip}/api/v1/GetInvoices`;
        const invoicesRequestBody = { token: api_token, idcliente: parseInt(idClienteMikrowisp), limit: 5 };

        const invoiceResponse = await axios.post(urlListarFacturas, invoicesRequestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const invoiceList = invoiceResponse.data;

        if (invoiceList.estado !== 'exito') {
            return responder({ success: false, message: `Error del servidor de facturas: ${invoiceList.mensaje || 'Respuesta no exitosa.'}` });
        }

        if (invoiceList.facturas && Array.isArray(invoiceList.facturas)) {
            const facturasFiltradas = invoiceList.facturas
                .filter(f => ["no pagado", "vencido"].includes(String(f.estado).toLowerCase()))
                .map(f => ({
                    id_factura: String(f.id),
                    fecha_vencimiento: f.vencimiento,
                    total_formateado: f.total2 || f.total
                }))
                .sort((a, b) => new Date(b.fecha_vencimiento) - new Date(a.fecha_vencimiento));

            if (facturasFiltradas.length > 0) {
                responder({ success: true, facturas: facturasFiltradas });
            } else {
                responder({ success: true, message: "No se encontraron facturas pendientes o vencidas.", facturas: [] });
            }
        } else {
            responder({ success: true, message: "No hay facturas para este cliente.", facturas: [] });
        }

    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        errorFatal("Error en la comunicación con la API de MikroWISP.", errorMessage);
    }
}

if (accion === 'listar') {
    listarFacturas();
} else {
    responder({ success: false, message: "Acción no reconocida. Usar 'listar'." });
}
