// scripts/facturas_mkw.js
const request = require('request');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
    errorFatal("Configuración de MikroWISP incompleta en .env.");
}

if (accion === 'listar') {
    if (!identificadorPrincipal) {
        return responder({ success: false, message: "Se requiere DNI para listar facturas." });
    }
    const dniCliente = identificadorPrincipal;
    const urlGetClientDetails = `https://${server_ip}/api/v1/GetClientsDetails`;
    const clientDetailsRequestBody = { token: api_token, cedula: dniCliente };

    request({ method: 'POST', url: urlGetClientDetails, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clientDetailsRequestBody)}, 
    (clientError, clientResponse, clientBody) => {
        if (clientError) return responder({ success: false, message: "Error de conexión al verificar DNI.", details: clientError.message });
        let clientDetailsResponse;
        try { clientDetailsResponse = JSON.parse(clientBody); } 
        catch (e) { return responder({ success: false, message: "Respuesta no válida del servidor al verificar DNI.", details: clientBody });}
        
        if (clientResponse.statusCode !== 200 || clientDetailsResponse.estado !== 'exito' || !clientDetailsResponse.datos || clientDetailsResponse.datos.length === 0) {
            return responder({ success: false, message: `DNI no encontrado o error al verificar: ${clientDetailsResponse.mensaje || 'Cliente no existe.'}` });
        }
        
        const idClienteMikrowisp = clientDetailsResponse.datos[0].id;
        if (!idClienteMikrowisp) return responder({ success: false, message: "No se pudo obtener el ID interno del cliente." });
        
        const urlListarFacturas = `https://${server_ip}/api/v1/GetInvoices`;
        const invoicesRequestBody = { token: api_token, idcliente: parseInt(idClienteMikrowisp), limit: 5 };
        
        request({ method: 'POST', url: urlListarFacturas, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicesRequestBody)}, 
        (invoiceError, invoiceResponse, invoiceBody) => {
            if (invoiceError) return responder({ success: false, message: "Error de conexión al listar facturas.", details: invoiceError.message });
            let invoiceListResponse;
            try { invoiceListResponse = JSON.parse(invoiceBody); } 
            catch (e) { return responder({ success: false, message: "Respuesta no válida del servidor de facturas.", details: invoiceBody });}

            if (invoiceResponse.statusCode !== 200 || invoiceListResponse.estado !== 'exito') {
                return responder({ success: false, message: `Error del servidor de facturas: ${invoiceListResponse.mensaje || 'Respuesta no exitosa.'}`});
            }

            if (invoiceListResponse.facturas && Array.isArray(invoiceListResponse.facturas)) {
                const facturasFiltradas = invoiceListResponse.facturas
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
        });
    });
} else {
    responder({ success: false, message: "Acción no reconocida. Usar 'listar'." });
}
