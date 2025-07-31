// bot_mkw.js

// Importamos las librerías necesarias
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const chalk = require('chalk'); // Librería para dar color a la consola

console.log(chalk.yellow('Iniciando bot_mkw...'));

// --- CONFIGURACIÓN DE LA API PARA MIKROWISP ---
const app = express();
const port = 3000; // Puedes cambiar este puerto si lo necesitas
const API_TOKEN = 'bd23ed5949e9d7bcc515f040734e1108'; // El token de tu captura

// Middleware para verificar el Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        console.warn(chalk.yellow('⚠️ Petición recibida sin token'));
        return res.status(401).json({ status: 'error', message: 'Acceso no autorizado: Token no proporcionado' });
    }

    if (token !== API_TOKEN) {
        console.warn(chalk.red(`🚫 Petición recibida con token inválido: ${token}`));
        return res.status(403).json({ status: 'error', message: 'Token inválido' });
    }
    
    next();
};

// Creamos un nuevo cliente de WhatsApp.
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "bot_mkw" }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// Evento que se dispara cuando se genera un código QR
client.on('qr', qr => {
    console.log(chalk.cyan('¡Código QR recibido! Escanéalo con tu teléfono.'));
    qrcode.generate(qr, { small: true });
});

// Evento que se dispara cuando el cliente está listo y conectado
client.on('ready', () => {
    console.log(chalk.green.bold('✅ ¡Bot_mkw está conectado a WhatsApp!'));
    
    app.listen(port, () => {
        console.log(chalk.blue(`🚀 API para Mikrowisp escuchando en http://localhost:${port}`));
        console.log(chalk.blue('Listo para recibir órdenes de envío de mensajes.'));
    });
});

// Evento para responder a mensajes directos
client.on('message', message => {
    console.log(chalk.blue(`📥 Mensaje recibido de ${chalk.bold(message.from)}:`) + ` ${message.body}`);
	if(message.body.toLowerCase() === '!ping') {
		client.sendMessage(message.from, 'pong');
        console.log(chalk.yellow(`   Repondiendo 'pong' a ${message.from}`));
	}
    if(message.body.toLowerCase() === '!hola') {
        client.sendMessage(message.from, '¡Hola! Soy bot_mkw, listo para servir.');
        console.log(chalk.yellow(`   Saludando a ${message.from}`));
    }
});

// --- ENDPOINT PARA MIKROWISP ---
app.get('/send-message', authenticateToken, async (req, res) => {
    // --- INICIO DE LA NUEVA MODIFICACIÓN ---
    const now = new Date();
    const horaActual = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    const { destinatario, mensaje } = req.query;
    
    console.log(chalk.magenta(`\n📡 Petición de Mikrowisp para enviar a: ${chalk.bold(destinatario)} - 🕒 ${horaActual}`));
    // --- FIN DE LA NUEVA MODIFICACIÓN ---

    if (!destinatario || !mensaje) {
        return res.status(400).json({ status: 'error', message: 'Faltan los parámetros "destinatario" o "mensaje"' });
    }

    const numeroLimpio = destinatario.replace(/\D/g, '');
    const chatId = `549${numeroLimpio}@c.us`;
    
    const mensajeSinCorchetes = mensaje.replace(/[{}]/g, '');
    const mensajeFinal = `*MENSAJE AUTOMÁTICO*\n\n${mensajeSinCorchetes}`;
    
    console.log(chalk.cyan(`   Mensaje final a enviar: "${mensajeFinal}"`));

    try {
        await client.sendMessage(chatId, mensajeFinal);
        // --- INICIO DE LA NUEVA MODIFICACIÓN ---
        console.log(chalk.green(`Mensaje enviado exitosamente a ${chatId} ✅`));
        // --- FIN DE LA NUEVA MODIFICACIÓN ---
        res.status(200).json({ status: 'success', message: 'Mensaje enviado correctamente' });
    } catch (error) {
        console.error(chalk.red(`❌ Error al enviar mensaje a ${chatId}:`), error.message);
        res.status(500).json({ status: 'error', message: 'El bot no pudo enviar el mensaje.', details: error.message });
    }
});


// Iniciamos el cliente
client.initialize().catch(err => {
    console.error(chalk.red.bold("Error al inicializar el cliente:"), err);
});

// Manejo de errores
client.on('auth_failure', msg => console.error(chalk.red.bold('❌ ERROR DE AUTENTICACIÓN:'), msg));
client.on('disconnected', (reason) => console.log(chalk.yellow('🔌 Cliente desconectado:'), reason));

console.log('El cliente está inicializando, por favor espera...');

