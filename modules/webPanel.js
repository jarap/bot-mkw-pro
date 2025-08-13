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
const { llamarScriptExterno } = require('./external_scripts');

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

    // --- Rutas de Autenticación y Vistas ---
    app.get('/', (req, res) => {
        if (req.session.loggedin) {
            res.sendFile(path.join(__dirname, '..', 'public', 'mkwap.html'));
        } else {
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
        }
    });

    app.post('/login', (req, res) => {
        const { username, password } = req.body;
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'users.json'), 'utf8'));
        if (users[username] && users[username] === password) {
            req.session.loggedin = true;
            req.session.username = username;
            res.redirect('/');
        } else {
            res.send('Usuario o contraseña incorrectos');
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });

    // --- API Endpoints ---

    app.get('/api/tickets', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getAllTickets();
        res.status(result.success ? 200 : 500).json(result);
    });
    
    app.get('/api/activesessions', checkAuth, async (req, res) => {
        try {
            const sessionKeys = await redisClient.keys('session:*');
            if (sessionKeys.length === 0) {
                return res.json({ success: true, data: [] });
            }
            const sessions = [];
            for (const key of sessionKeys) {
                const sessionData = await redisClient.get(key);
                if (sessionData) {
                    sessions.push(sessionData);
                }
            }
            res.json({ success: true, data: sessions });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener sesiones de Redis.' });
        }
    });

    app.get('/api/salesdata', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getSalesData();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/comprobantes', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getAllComprobantes();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/actions/connect', checkAuth, (req, res) => {
        whatsappClient.initialize();
        res.json({ success: true, message: 'Inicializando...' });
    });

    app.post('/api/actions/disconnect', checkAuth, async (req, res) => {
        await whatsappClient.disconnect();
        res.json({ success: true, message: 'Desconectando...' });
    });

    app.post('/api/actions/send-message', checkAuth, async (req, res) => {
        const { recipient, message } = req.body;
        const chatId = `549${recipient}@c.us`;
        try {
            await whatsappClient.sendMessage(chatId, message);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    app.post('/api/tickets/:id/close', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateTicket(req.params.id, { Estado: 'Cerrado' });
        if (result.success) broadcast({ type: 'ticketsChanged' });
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/comprobantes/:id/asignar', checkAuth, async (req, res) => {
        try {
            const comprobanteId = req.params.id;
            const doc = await firestoreHandler.db.collection('comprobantesRecibidos').doc(comprobanteId).get();
            if (!doc.exists) {
                return res.status(404).json({ success: false, message: 'Comprobante no encontrado.' });
            }
            const comprobante = doc.data();

            const dniCliente = comprobante.cliente?.cedula;
            if (!dniCliente) {
                return res.status(400).json({ success: false, message: 'El cliente en el comprobante no tiene DNI para buscar facturas.' });
            }

            const facturasResult = await llamarScriptExterno('scripts/factura_mkw.js', ['listar', dniCliente]);
            if (!facturasResult.success || !facturasResult.facturas || facturasResult.facturas.length === 0) {
                return res.status(400).json({ success: false, message: 'No se encontraron facturas pendientes para este cliente.' });
            }

            const facturaAPagar = facturasResult.facturas[0];
            const montoIA = comprobante.resultadoIA.monto;
            const fechaIA = comprobante.resultadoIA.fecha;
            const referenciaIA = comprobante.resultadoIA.referencia;

            const pagoResult = await llamarScriptExterno('scripts/asignar_pago_mkw.js', [
                facturaAPagar.id_factura,
                montoIA,
                fechaIA,
                'Transferencia Bot',
                referenciaIA
            ]);

            if (!pagoResult.success) {
                return res.status(500).json({ success: false, message: `Error al registrar pago en MikroWISP: ${pagoResult.message}`, details: pagoResult.details });
            }
            
            const result = await firestoreHandler.updateComprobante(comprobanteId, { estado: 'Aprobado' });
            if (result.success) broadcast({ type: 'receiptsChanged' });
            res.status(result.success ? 200 : 500).json(result);

        } catch (error) {
            console.error(chalk.red('❌ Error en el proceso de asignación de pago:'), error);
            res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }
    });

    app.post('/api/comprobantes/:id/rechazar', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateComprobante(req.params.id, { estado: 'Rechazado' });
        if (result.success) broadcast({ type: 'receiptsChanged' });
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/data/:collection', checkAuth, async (req, res) => {
        const result = await firestoreHandler.addItem(req.params.collection, req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.put('/api/data/:collection/:id', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateItem(req.params.collection, req.params.id, req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.delete('/api/data/:collection/:id', checkAuth, async (req, res) => {
        const result = await firestoreHandler.deleteItem(req.params.collection, req.params.id);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/config/empresa', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getCompanyConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/empresa', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateCompanyConfig(req.body);
        if (result.success) broadcast({ type: 'companyConfig', data: req.body });
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

    app.get('/api/config/soporte', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getSoporteConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/soporte', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updateSoporteConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/config/pagos', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getPagosConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/pagos', checkAuth, async (req, res) => {
        const result = await firestoreHandler.updatePagosConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/upload/logo', checkAuth, upload.single('logo'), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });
        }
        res.json({ success: true, filePath: `/uploads/${req.file.filename}` });
    });

    app.get('/api/calendar/events', checkAuth, async (req, res) => {
        const result = await calendarHandler.getEvents();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/calendar/events/count', checkAuth, async (req, res) => {
        const days = parseInt(req.query.days, 10) || 15;
        const result = await calendarHandler.countUpcomingEvents(days);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/menu-items', checkAuth, async (req, res) => {
        const result = await firestoreHandler.getAllMenuItems();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/menu-items', checkAuth, async (req, res) => {
        try {
            const result = await firestoreHandler.addMenuItem(req.body);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    });
    
    app.put('/api/menu-items/:id', checkAuth, async (req, res) => {
        try {
            const result = await firestoreHandler.updateMenuItem(req.params.id, req.body);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    });
    
    app.delete('/api/menu-items/:id', checkAuth, async (req, res) => {
        const result = await firestoreHandler.deleteMenuItem(req.params.id);
        res.status(result.success ? 200 : 500).json(result);
    });

    // --- WebSocket Server ---
    const wssClients = new Set();
    wss.on('connection', async (ws) => {
        wssClients.add(ws);
        console.log('Nuevo cliente del panel conectado.');

        try {
            ws.send(JSON.stringify({ type: 'status', data: whatsappClient.getStatus() }));
            const configResult = await firestoreHandler.getCompanyConfig();
            if (configResult.success) {
                ws.send(JSON.stringify({ type: 'companyConfig', data: configResult.data }));
            }
        } catch (error) {
            console.error(chalk.red('❌ Error al enviar datos iniciales por WebSocket:'), error);
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
    
    whatsappClient.on('receiptsUpdate', () => broadcast({ type: 'receiptsChanged' }));
    
    setInterval(broadcastKPIs, 60000);

    return { broadcast };
}

module.exports = createWebPanel;
