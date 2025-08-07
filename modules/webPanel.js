// modules/webPanel.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const qrcode = require('qrcode');
const chalk = require('chalk');

function createWebPanel(app, server, whatsappClient, firestoreHandler, redisClient) {
    const wss = new WebSocketServer({ server });
    
    app.use(session({
        secret: process.env.SESSION_SECRET || 'fallback-secret-por-si-acaso',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }
    }));
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());

    const checkAuth = (req, res, next) => req.session.loggedin ? next() : res.redirect('/');

    app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
    
    app.post('/login', (req, res) => {
        try {
            const users = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'users.json')));
            const { username, password } = req.body;
            if (users[username] && users[username] === password) {
                req.session.loggedin = true;
                req.session.username = username;
                res.redirect('/panel');
            } else {
                res.send('Usuario o Contraseña Incorrecta!');
            }
        } catch (error) {
            res.send('Error al leer el archivo de usuarios.');
        }
    });

    app.get('/panel', checkAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'mkwap.html')));
    
    app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

    // --- API Endpoints ---
    app.get('/api/status', checkAuth, (req, res) => res.json({ status: whatsappClient.getStatus() }));
    app.get('/api/connect', checkAuth, (req, res) => { whatsappClient.initialize(); res.json({message: "Initializing..."}); });
    app.get('/api/disconnect', checkAuth, (req, res) => { whatsappClient.disconnect(); res.json({message: "Disconnecting..."}); });
    
    app.post('/api/send-manual', checkAuth, async (req, res) => {
        const { recipient, message } = req.body;
        try {
            const chatId = `549${recipient.replace(/\D/g, '')}@c.us`;
            await whatsappClient.sendMessage(chatId, message);
            res.json({ status: 'success', message: 'Mensaje enviado.' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    app.get('/api/tickets', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getAllTickets();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/salesdata', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getSalesData();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/tickets/close', checkAuth, async (req, res) => {
        const { ticketId } = req.body;
        if (!ticketId) return res.status(400).json({ status: 'error', message: 'Falta el ID del ticket.' });
        try {
            await firestoreHandler.updateTicket(ticketId, { 'Estado': 'Cerrado', 'isOpen': false });
            broadcastKPIs();
            res.json({ status: 'success', message: 'Ticket cerrado correctamente.' });
        } catch (error) {
            res.status(500).json({ status: 'error', message: 'No se pudo cerrar el ticket.' });
        }
    });

    app.get('/api/activesessions', checkAuth, async (req, res) => {
        try {
            const sessionKeys = await redisClient.keys('session_client:*');
            if (sessionKeys.length === 0) return res.json({ success: true, data: [] });
            const sessions = [];
            for (const key of sessionKeys) {
                const sessionData = await redisClient.get(key);
                if (sessionData) sessions.push(sessionData);
            }
            res.json({ success: true, data: sessions });
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener sesiones activas de Redis:'), error);
            res.status(500).json({ success: false, message: 'No se pudo obtener las sesiones activas.' });
        }
    });

    // --- ENDPOINTS CRUD GENÉRICOS ---
    app.post('/api/data/:collection', checkAuth, async (req, res) => {
        const { collection } = req.params;
        const result = await firestoreHandler.addItem(collection, req.body);
        res.status(result.success ? 201 : 500).json(result);
    });

    app.put('/api/data/:collection/:id', checkAuth, async (req, res) => {
        const { collection, id } = req.params;
        const result = await firestoreHandler.updateItem(collection, id, req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.delete('/api/data/:collection/:id', checkAuth, async (req, res) => {
        const { collection, id } = req.params;
        const result = await firestoreHandler.deleteItem(collection, id);
        res.status(result.success ? 200 : 500).json(result);
    });

    // --- INICIO DE LA MODIFICACIÓN ---
    // --- ENDPOINTS PARA CONFIGURACIÓN DE EMPRESA ---
    app.get('/api/config/empresa', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getCompanyConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/empresa', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateCompanyConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });
    // --- FIN DE LA MODIFICACIÓN ---


    // --- Lógica de WebSocket ---
    const wssClients = new Set();
    wss.on('connection', (ws) => {
        wssClients.add(ws);
        console.log('Cliente conectado al panel de control.');
        ws.on('close', () => {
            wssClients.delete(ws);
            console.log('Cliente del panel desconectado.');
        });
    });

    function broadcast(data) {
        const message = JSON.stringify(data);
        wssClients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(message);
            }
        });
    }

    async function broadcastKPIs() {
        const openTicketsCount = await firestoreHandler.countOpenTickets();
        broadcast({ type: 'kpiUpdate', data: { openTickets: openTicketsCount } });
    }

    whatsappClient.on('statusChange', (status) => broadcast({ type: 'status', data: status }));
    whatsappClient.on('qr', (qr) => qrcode.toDataURL(qr).then(url => broadcast({ type: 'qr', data: url })));
    whatsappClient.on('sessionsUpdate', () => {
        broadcastKPIs();
        broadcast({ type: 'sessionsChanged' });
    });
    
    setInterval(broadcastKPIs, 60000);

    return { broadcast };
}

module.exports = createWebPanel;
