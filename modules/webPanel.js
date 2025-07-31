// modules/webPanel.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const qrcode = require('qrcode');

function createWebPanel(app, server, whatsappClient) {
    const wss = new WebSocketServer({ server });

    app.use(session({
        secret: 'una-clave-muy-secreta-para-mkw',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }
    }));
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(bodyParser.urlencoded({ extended: true }));

    const checkAuth = (req, res, next) => {
        if (req.session.loggedin) {
            next();
        } else {
            res.redirect('/');
        }
    };

    app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
    app.post('/login', (req, res) => {
        const { username, password } = req.body;
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'users.json')));
        if (users[username] && users[username] === password) {
            req.session.loggedin = true;
            req.session.username = username;
            res.redirect('/panel');
        } else {
            res.send('Usuario o Contraseña Incorrecta!');
        }
    });
    app.get('/panel', checkAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'mkwap.html')));
    app.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/'));
    });
    app.get('/api/connect', checkAuth, (req, res) => {
        if (whatsappClient.getStatus() === 'DESCONECTADO' || whatsappClient.getStatus() === 'ERROR') {
            whatsappClient.initialize();
            res.json({ message: 'Comando de conexión enviado.' });
        } else {
            res.json({ message: 'El cliente ya está conectado o en proceso.' });
        }
    });
    app.get('/api/disconnect', checkAuth, (req, res) => {
        whatsappClient.disconnect();
        res.json({ message: 'Comando de reinicio enviado. El servicio se reiniciará en breve.' });
        setTimeout(() => {
            console.log('REINICIANDO EL SERVICIO...');
            process.exit(1);
        }, 1000);
    });
    app.get('/api/status', checkAuth, (req, res) => res.json({ status: whatsappClient.getStatus() }));

    wss.on('connection', (ws) => {
        console.log('Cliente conectado al panel de control.');
        ws.on('close', () => console.log('Cliente del panel desconectado.'));
    });

    function broadcast(data) {
        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(JSON.stringify(data));
            }
        });
    }

    whatsappClient.on('statusChange', (status) => broadcast({ type: 'status', data: status }));
    whatsappClient.on('qr', async (qr) => {
        try {
            const qrDataURL = await qrcode.toDataURL(qr);
            broadcast({ type: 'qr', data: qrDataURL });
        } catch (err) {
            console.error('Error al generar QR para el panel web:', err);
        }
    });

    // Retornamos la función de broadcast para que app.js pueda usarla.
    return { broadcast };
}

module.exports = createWebPanel;

