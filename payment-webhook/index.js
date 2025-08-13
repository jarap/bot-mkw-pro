// payment-webhook/index.js
// VERSIÓN 7: Añade verificación de estado (activado/desactivado) desde Firestore.

const axios = require('axios');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- Variables de Entorno ---
const MKW_SERVER_IP = process.env.MKW_SERVER_IP;
const MKW_API_TOKEN = process.env.MKW_API_TOKEN;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MKW_PASARELA_PAGO = process.env.MKW_PASARELA_PAGO;

// --- Inicialización de Firebase ---
// Este bloque intenta conectarse a Firestore usando las credenciales.
try {
    const serviceAccount = require('./google-credentials.json'); // Requiere que el archivo esté en esta carpeta
    if (!getApps().length) {
        initializeApp({ credential: cert(serviceAccount) });
    }
    console.log('Firebase Admin SDK inicializado correctamente.');
} catch (error) {
    console.error('Error fatal al inicializar Firebase Admin SDK:', error);
    // Si no puede conectar a la DB, no podrá funcionar, pero lo manejamos en la función de abajo.
}
// ------------------------------------

/**
 * Consulta en Firestore si el procesamiento de pagos está activado.
 * @returns {Promise<boolean>} - True si está activado, false si no.
 */
async function arePaymentsEnabled() {
    // Verificamos si la inicialización de Firebase fue exitosa.
    if (!getApps().length) {
        console.error('Firebase no está inicializado, no se puede verificar el estado de los pagos. Asumiendo que están activados por seguridad.');
        return true;
    }
    try {
        const db = getFirestore();
        const docRef = db.collection('configuracion').doc('pagos');
        const doc = await docRef.get();
        // Por defecto, si no existe la configuración o el valor no es explícitamente 'false', los pagos están ACTIVADOS.
        if (!doc.exists || doc.data().pagosQrActivos !== false) {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error al leer la configuración de pagos desde Firestore. Asumiendo que están activados por seguridad.', error);
        return true; // En caso de error, es más seguro procesar el pago para no perderlo.
    }
}


exports.paymentWebhook = async (req, res) => {
    console.log('--- Nueva notificación IPN recibida ---');

    // 1. Verificamos si el sistema de pagos está activado ANTES de hacer nada.
    const paymentsEnabled = await arePaymentsEnabled();
    if (!paymentsEnabled) {
        console.log('El procesamiento de pagos por QR está desactivado. Ignorando notificación.');
        return res.status(200).send('Payment processing is disabled.');
    }

    const notification = req.query;
    console.log('Datos recibidos en la URL:', notification);

    if (notification.id === '123456' && notification.topic === 'payment') {
        console.log('Notificación de prueba de la herramienta IPN detectada. Respondiendo 200 OK.');
        return res.status(200).send('Test notification received successfully.');
    }

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
        const paymentDetails = await getPaymentDetails(paymentId);

        if (paymentDetails.status !== 'approved') {
            console.log(`Pago ${paymentId} no está aprobado (estado: ${paymentDetails.status}).`);
            return res.status(200).send('Payment not approved');
        }

        if (!paymentDetails.external_reference) {
            console.error(`Error: El pago ${paymentId} no tiene 'external_reference' (ID de factura).`);
            return res.status(400).send('Missing external_reference');
        }

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

async function getPaymentDetails(paymentId) {
    const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
        });
        console.log('Detalles del pago obtenidos de Mercado Pago.');
        return response.data;
    } catch (error) {
        console.error('Error al obtener detalles del pago de Mercado Pago:', error.response ? error.response.data : error.message);
        throw new Error('Could not fetch payment details from Mercado Pago.');
    }
}

async function registerPaymentInMikrowisp(idFactura, monto, paymentIdMP) {
    const url = `https://${MKW_SERVER_IP}/api/v1/PaidInvoice`;
    const requestBody = {
        token: MKW_API_TOKEN,
        idfactura: parseInt(idFactura, 10),
        pasarela: MKW_PASARELA_PAGO,
        cantidad: monto,
        idtransaccion: paymentIdMP
    };

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
