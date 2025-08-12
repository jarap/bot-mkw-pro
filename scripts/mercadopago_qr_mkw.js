// scripts/mercadopago_qr_mkw.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function responder(data) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
}

const montoFactura = parseFloat(process.argv[2]);
const tituloOrden = process.argv[3];
const idFacturaExterna = process.argv[4];
const descripcionItem = process.argv[5];

if (isNaN(montoFactura) || !tituloOrden || !idFacturaExterna || !descripcionItem) {
    responder({ success: false, message: "Faltan argumentos o el monto no es válido." });
}

let mpConfig;
try {
    mpConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mercadopago_credentials.json'), 'utf8'));
} catch (error) {
    responder({ success: false, message: "Error al cargar credenciales de Mercado Pago." });
}

const { access_token, user_id, external_pos_id } = mpConfig;
if (!access_token || !user_id || !external_pos_id) {
    responder({ success: false, message: "Credenciales de Mercado Pago incompletas." });
}

const API_BASE_URL = 'https://api.mercadopago.com';
const commonHeaders = {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
};

(async () => {
    try {
        const orderApiUrl = `${API_BASE_URL}/instore/orders/qr/seller/collectors/${user_id}/pos/${external_pos_id}/qrs`;
        const orderPayload = {
            external_reference: idFacturaExterna,
            title: tituloOrden,
            description: `Cobro por: ${descripcionItem}`,
            total_amount: montoFactura,
            items: [{
                title: descripcionItem,
                unit_price: montoFactura,
                quantity: 1,
                unit_measure: "unit",
                total_amount: montoFactura
            }],
        };

        const response = await axios.put(orderApiUrl, orderPayload, { headers: commonHeaders });
        
        if (response.data && response.data.qr_data) {
            responder({
                success: true,
                message: "Datos QR generados exitosamente.",
                qr_data_string: response.data.qr_data,
            });
        } else {
            throw new Error("La respuesta de Mercado Pago no incluyó 'qr_data'.");
        }
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message || "Error desconocido.";
        console.error(`[MP QR ERROR] ${errorMessage}`);
        responder({ success: false, message: `Error al generar QR: ${errorMessage}` });
    }
})();
