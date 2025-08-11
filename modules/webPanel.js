// modules/webPanel.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const qrcode = require('qrcode');
const chalk = require('chalk');
const multer = require('multer');
const calendarHandler = require('./calendar_handler');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        cb(null, 'logo-empresa' + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

function createWebPanel(app, server, whatsappClient, firestoreHandler, redisClient) {
    const wss = new WebSocketServer({ server });
    
    app.use(session({ secret: process.env.SESSION_SECRET || 'fallback-secret-por-si-acaso', resave: false, saveUninitialized: true, cookie: { secure: false } }));
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

    app.get('/api/status', checkAuth, (req, res) => res.json({ status: whatsappClient.getStatus() }));
    app.get('/api/connect', checkAuth, (req, res) => { whatsappClient.initialize(); res.json({message: "Initializing..."}); });
    app.get('/api/disconnect', checkAuth, (req, res) => { whatsappClient.disconnect(); res.json({message: "Disconnecting..."}); });
    app.post('/api/send-manual', checkAuth, async (req, res) => {
        const { recipient, message } = req.body;
        try {
            const chatId = `549${recipient.replace(/\D/g, '')}@c.us`;
            await whatsappClient.sendMessage(chatId, message);
            res.json({ success: true, message: 'Mensaje enviado.' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
    app.post('/api/upload/logo', checkAuth, upload.single('logo'), (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'No se ha subido ningún archivo.' });
        res.json({ success: true, filePath: `/uploads/${req.file.filename}` });
    });
    app.get('/api/tickets', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getAllTickets();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/calendar/events', checkAuth, async (req, res) => {
        const result = await calendarHandler.getEvents();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/salesdata', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getSalesData();
        res.status(result.success ? 200 : 500).json(result);
    });
    app.post('/api/tickets/close', checkAuth, async (req, res) => {
        const { ticketId } = req.body;
        if (!ticketId) return res.status(400).json({ success: false, message: 'Falta el ID del ticket.' });
        try {
            await firestoreHandler.updateTicket(ticketId, { 'Estado': 'Cerrado', 'isOpen': false });
            broadcast({ type: 'ticketsChanged' });
            broadcastKPIs();
            res.json({ success: true, message: 'Ticket cerrado correctamente.' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'No se pudo cerrar el ticket.' });
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
    app.get('/api/config/empresa', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getCompanyConfig();
        res.status(result.success ? 200 : 500).json(result);
    });
    app.post('/api/config/empresa', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateCompanyConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/config/ventas', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getVentasConfig();
        res.status(result.success ? 200 : 500).json(result);
    });
    app.post('/api/config/ventas', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateVentasConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

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

    // --- INICIO DE MODIFICACIÓN: Endpoints para el Gestor de Menús Jerárquico ---
    // Se reemplazan los endpoints antiguos por estos nuevos que entienden la estructura padre-hijo.

    // Obtener TODOS los items de menú para construir el árbol en el panel.
    app.get('/api/menu-items', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getAllMenuItems();
        res.status(result.success ? 200 : 500).json(result);
    });

    // Crear un nuevo item de menú.
    app.post('/api/menu-items', checkAuth, async (req, res) => {
        const itemData = req.body;
        if (!itemData || !itemData.title || !itemData.parent) {
            return res.status(400).json({ success: false, message: 'Faltan datos para crear el item.' });
        }
        const result = await firestoreHandler.addMenuItem(itemData);
        res.status(result.success ? 201 : 500).json(result);
    });

    // Actualizar un item de menú existente.
    app.put('/api/menu-items/:id', checkAuth, async (req, res) => {
        const { id } = req.params;
        const itemData = req.body;
        const result = await firestoreHandler.updateMenuItem(id, itemData);
        res.status(result.success ? 200 : 500).json(result);
    });

    // Eliminar un item de menú (y todos sus hijos).
    app.delete('/api/menu-items/:id', checkAuth, async (req, res) => {
        const { id } = req.params;
        const result = await firestoreHandler.deleteMenuItem(id);
        res.status(result.success ? 200 : 500).json(result);
    });

    // --- FIN DE MODIFICACIÓN ---

    const wssClients = new Set();
    wss.on('connection', async (ws) => {
        wssClients.add(ws);
        console.log('Cliente conectado al panel de control.');

        try {
            const currentStatus = whatsappClient.getStatus();
            ws.send(JSON.stringify({ type: 'status', data: currentStatus }));
        } catch (error) {
            console.error(chalk.red('❌ Error al enviar estado inicial del bot por WebSocket:'), error);
        }

        try {
            const configResult = await firestoreHandler.getCompanyConfig();
            if (configResult.success) {
                ws.send(JSON.stringify({ type: 'companyConfig', data: configResult.data }));
            }
        } catch (error) {
            console.error(chalk.red('❌ Error al enviar config de empresa por WebSocket:'), error);
        }

        ws.on('close', () => {
            wssClients.delete(ws);
            console.log('Cliente del panel desconectado.');
        });
    });

    function broadcast(data) {
        const message = JSON.stringify(data);
        wssClients.forEach((client) => {
            if (client.readyState === 1) client.send(message);
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
        broadcast({ type: 'ticketsChanged' });
    });
    
    setInterval(broadcastKPIs, 60000);

    return { broadcast };
}

module.exports = createWebPanel;
