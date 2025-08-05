// modules/mikrowispApi.js
const express = require('express');
const chalk = require('chalk');

// El token ahora se lee desde las variables de entorno (archivo .env)
const API_TOKEN = process.env.MIKROWISP_API_TOKEN;

function createMikrowispApi(app, whatsappClient) {
    app.use(express.json());

    // Middleware de autenticación
    const authenticateToken = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token == null) return res.status(401).json({ error: 'Token no proporcionado' });
        if (token !== API_TOKEN) return res.status(403).json({ error: 'Token inválido' });
        next();
    };

    app.get('/send-message', authenticateToken, async (req, res) => {
        const now = new Date();
        const horaActual = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        const { destinatario, mensaje } = req.query;

        console.log(chalk.magenta(`\n📡 Petición de Mikrowisp para enviar a: ${chalk.bold(destinatario)} - 🕒 ${horaActual}`));

        if (!destinatario || !mensaje) {
            return res.status(400).json({ status: 'error', message: 'Faltan los parámetros "destinatario" o "mensaje"' });
        }

        const numeroLimpio = destinatario.replace(/\D/g, '');
        const chatId = `549${numeroLimpio}@c.us`;
        const mensajeSinCorchetes = mensaje.replace(/[{}]/g, '');
        const mensajeFinal = `*MENSAJE AUTOMÁTICO*\n\n${mensajeSinCorchetes}`;

        console.log(chalk.cyan(`   Mensaje final a enviar: "${mensajeFinal}"`));

        try {
            if (whatsappClient.getStatus() !== 'CONECTADO') {
                throw new Error('El cliente de WhatsApp no está conectado. No se puede enviar el mensaje.');
            }
            await whatsappClient.sendMessage(chatId, mensajeFinal);
            console.log(chalk.green(`Mensaje enviado exitosamente a ${chatId} ✅`));
            res.status(200).json({ status: 'success', message: 'Mensaje enviado correctamente' });
        } catch (error) {
            console.error(chalk.red(`❌ Error al enviar mensaje a ${chatId}:`), error.message);
            res.status(500).json({ status: 'error', message: 'El bot no pudo enviar el mensaje.', details: error.message });
        }
    });

    return app;
}

module.exports = createMikrowispApi;
