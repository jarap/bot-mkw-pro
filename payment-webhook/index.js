// payment-webhook/index.js
// Cloud Function para recibir notificaciones IPN de Mercado Pago y registrar pagos en Mikrowisp.
// VERSIÓN 6: Corregido el endpoint y los parámetros para la API de Mikrowisp según la documentación.

const axios = require('axios');

// --- Variables de Entorno (se configuran en Google Cloud) ---
const MKW_SERVER_IP = process.env.MKW_SERVER_IP;
const MKW_API_TOKEN = process.env.MKW_API_TOKEN;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MKW_PASARELA_PAGO = process.env.MKW_PASARELA_PAGO;
// --------------------------------------------------------------------


/**
 * Función principal que se ejecuta cuando se llama a la Cloud Function.
 * @param {object} req - El objeto de la petición HTTP.
 * @param {object} res - El objeto de la respuesta HTTP.
 */
exports.paymentWebhook = async (req, res) => {
    console.log('--- Nueva notificación IPN recibida ---');

    const notification = req.query;
    console.log('Datos recibidos en la URL:', notification);

    // 1. Si es la notificación de prueba de la herramienta IPN, respondemos OK y terminamos.
    if (notification.id === '123456' && notification.topic === 'payment') {
        console.log('Notificación de prueba de la herramienta IPN detectada. Respondiendo 200 OK.');
        return res.status(200).send('Test notification received successfully.');
    }

    // 2. Verificamos que sea una notificación de pago
    if (notification.topic !== 'payment') {
        console.log(`Notificación ignorada (tópico: ${notification.topic}).`);
        return res.status(200).send('Notification ignored');
    }

    const paymentId = notification.id;
    if (!paymentId) {
        console.error('Error: No se encontró el "id" del pago en la notificación IPN.');
        return res.status(400).send('Bad Request: Missing payment ID');
    }
    
    console.log(`Procesando notificación para el pago ID: ${paymentId}`);

    try {
        // 3. Obtener los detalles completos del pago desde Mercado Pago
        const paymentDetails = await getPaymentDetails(paymentId);

        // 4. Validar que el pago esté aprobado y tenga los datos necesarios
        if (paymentDetails.status !== 'approved') {
            console.log(`Pago ${paymentId} no está aprobado (estado: ${paymentDetails.status}).`);
            return res.status(200).send('Payment not approved');
        }

        if (!paymentDetails.external_reference) {
            console.error(`Error: El pago ${paymentId} no tiene 'external_reference' (ID de factura).`);
            return res.status(400).send('Missing external_reference');
        }

        // 5. Registrar el pago en Mikrowisp
        const idFactura = paymentDetails.external_reference;
        const montoPagado = paymentDetails.transaction_amount;

        console.log(`Intentando registrar pago en Mikrowisp. Factura: ${idFactura}, Monto: ${montoPagado}`);
        const mkwResponse = await registerPaymentInMikrowisp(idFactura, montoPagado, paymentId);

        if (mkwResponse.estado === 'exito') {
            console.log(`¡Éxito! Pago para factura ${idFactura} registrado en Mikrowisp.`);
            res.status(200).send('Payment registered successfully');
        } else {
            console.error('Error al registrar pago en Mikrowisp:', mkwResponse);
            res.status(500).send('Failed to register payment in Mikrowisp');
        }

    } catch (error) {
        console.error('Error crítico en el webhook:', error.message);
        res.status(500).send('Internal Server Error');
    }
};

/**
 * Obtiene los detalles de un pago específico desde la API de Mercado Pago.
 * @param {string} paymentId - El ID del pago.
 * @returns {Promise<object>} Los detalles del pago.
 */
async function getPaymentDetails(paymentId) {
    const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
            }
        });
        console.log('Detalles del pago obtenidos de Mercado Pago.');
        return response.data;
    } catch (error) {
        console.error('Error al obtener detalles del pago de Mercado Pago:', error.response ? error.response.data : error.message);
        throw new Error('Could not fetch payment details from Mercado Pago.');
    }
}

/**
 * Llama a la API de Mikrowisp para registrar un nuevo pago.
 * @param {string} idFactura - El ID de la factura en Mikrowisp.
 * @param {number} monto - El monto pagado.
 * @param {string} paymentIdMP - El ID del pago de Mercado Pago para el idtransaccion.
 * @returns {Promise<object>} La respuesta de la API de Mikrowisp.
 */
async function registerPaymentInMikrowisp(idFactura, monto, paymentIdMP) {
    // --- INICIO DE CORRECCIÓN ---
    // Se corrige el endpoint a 'PaidInvoice' según la documentación.
    const url = `https://${MKW_SERVER_IP}/api/v1/PaidInvoice`;
    
    // Se ajustan los parámetros del cuerpo de la petición.
    const requestBody = {
        token: MKW_API_TOKEN,
        idfactura: parseInt(idFactura, 10),
        pasarela: MKW_PASARELA_PAGO,
        cantidad: monto, // Se cambia 'monto' por 'cantidad'
        idtransaccion: paymentIdMP // Se añade el ID de transacción para mejor trazabilidad
    };
    // --- FIN DE CORRECCIÓN ---

    try {
        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error('Error en la llamada a la API de Mikrowisp (PaidInvoice):', error.response ? error.response.data : error.message);
        return { estado: 'error', mensaje: 'Fallo la comunicación con Mikrowisp.' };
    }
}
