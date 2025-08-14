// modules/webPanel.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs'); // <-- INICIO DE CORRECCIÓN: Se vuelve a añadir el módulo 'fs'
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

    const checkRole = (allowedRoles) => {
        return (req, res, next) => {
            if (!req.session.loggedin) {
                return res.status(401).json({ success: false, message: 'No autenticado. Por favor, inicie sesión.' });
            }
            const userRole = req.session.role;
            if (allowedRoles.includes(userRole)) {
                next();
            } else {
                res.status(403).json({ success: false, message: 'Acceso denegado. No tiene permiso para realizar esta acción.' });
            }
        };
    };

    app.get('/', (req, res) => {
        if (req.session.loggedin) {
            res.sendFile(path.join(__dirname, '..', 'public', 'mkwap.html'));
        } else {
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
        }
    });

    app.post('/login', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).send('Usuario y contraseña son requeridos.');
        }

        try {
            const user = await firestoreHandler.getUserByUsername(username);

            if (user && user.password === password) {
                req.session.loggedin = true;
                req.session.username = username;
                req.session.role = user.role;
                res.redirect('/');
            } else {
                res.status(401).send('Usuario o contraseña incorrectos');
            }
        } catch (error) {
            console.error(chalk.red('❌ Error durante el login:'), error);
            res.status(500).send('Error interno del servidor durante la autenticación.');
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });

    app.get('/api/user/session', (req, res) => {
        if (req.session.loggedin) {
            res.json({ success: true, data: { username: req.session.username, role: req.session.role } });
        } else {
            res.status(401).json({ success: false, message: 'No autenticado.' });
        }
    });

    const readRoles = ['admin', 'supervisor', 'operator'];
    app.get('/api/tickets', checkRole(readRoles), async (req, res) => {
        const result = await firestoreHandler.getAllTickets();
        res.status(result.success ? 200 : 500).json(result);
    });
    
    app.get('/api/activesessions', checkRole(readRoles), async (req, res) => {
        try {
            const sessionKeys = await redisClient.keys('session:*');
            if (sessionKeys.length === 0) return res.json({ success: true, data: [] });
            const sessions = await Promise.all(sessionKeys.map(key => redisClient.get(key)));
            res.json({ success: true, data: sessions.filter(Boolean) });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener sesiones de Redis.' });
        }
    });

    app.get('/api/comprobantes', checkRole(readRoles), async (req, res) => {
        const result = await firestoreHandler.getAllComprobantes();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/calendar/events', checkRole(readRoles), async (req, res) => {
        const result = await calendarHandler.getEvents();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/calendar/events/count', checkRole(readRoles), async (req, res) => {
        const days = parseInt(req.query.days, 10) || 15;
        const result = await calendarHandler.countUpcomingEvents(days);
        res.status(result.success ? 200 : 500).json(result);
    });

    const actionRoles = ['admin', 'supervisor'];
    app.get('/api/salesdata', checkRole(actionRoles), async (req, res) => {
        const result = await firestoreHandler.getSalesData();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/actions/connect', checkRole(actionRoles), (req, res) => {
        whatsappClient.initialize();
        res.json({ success: true, message: 'Inicializando...' });
    });

    app.post('/api/actions/disconnect', checkRole(actionRoles), async (req, res) => {
        await whatsappClient.disconnect();
        res.json({ success: true, message: 'Desconectando...' });
    });

    app.post('/api/actions/send-message', checkRole(actionRoles), async (req, res) => {
        const { recipient, message } = req.body;
        const chatId = `549${recipient}@c.us`;
        try {
            await whatsappClient.sendMessage(chatId, message);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    app.post('/api/tickets/:id/close', checkRole(actionRoles), async (req, res) => {
        const result = await firestoreHandler.updateTicket(req.params.id, { Estado: 'Cerrado' });
        if (result.success) broadcast({ type: 'ticketsChanged' });
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/comprobantes/:id/asignar', checkRole(actionRoles), async (req, res) => {
        try {
            const comprobanteId = req.params.id;
            const doc = await firestoreHandler.db.collection('comprobantesRecibidos').doc(comprobanteId).get();
            if (!doc.exists) return res.status(404).json({ success: false, message: 'Comprobante no encontrado.' });
            const comprobante = doc.data();
            const dniCliente = comprobante.cliente?.cedula;
            if (!dniCliente) return res.status(400).json({ success: false, message: 'El cliente en el comprobante no tiene DNI.' });
            const facturasResult = await llamarScriptExterno('scripts/factura_mkw.js', ['listar', dniCliente]);
            if (!facturasResult.success || !facturasResult.facturas || facturasResult.facturas.length === 0) return res.status(400).json({ success: false, message: 'No se encontraron facturas pendientes.' });
            const facturaAPagar = facturasResult.facturas[0];
            const { monto, fecha, referencia } = comprobante.resultadoIA;
            const pagoResult = await llamarScriptExterno('scripts/asignar_pago_mkw.js', [facturaAPagar.id_factura, monto, fecha, 'Transferencia Bot', referencia]);
            if (!pagoResult.success) return res.status(500).json({ success: false, message: `Error en MikroWISP: ${pagoResult.message}`, details: pagoResult.details });
            const result = await firestoreHandler.updateComprobante(comprobanteId, { estado: 'Aprobado' });
            if (result.success) broadcast({ type: 'receiptsChanged' });
            res.status(result.success ? 200 : 500).json(result);
        } catch (error) {
            console.error(chalk.red('❌ Error en asignación de pago:'), error);
            res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }
    });

    app.post('/api/comprobantes/:id/rechazar', checkRole(actionRoles), async (req, res) => {
        const result = await firestoreHandler.updateComprobante(req.params.id, { estado: 'Rechazado' });
        if (result.success) broadcast({ type: 'receiptsChanged' });
        res.status(result.success ? 200 : 500).json(result);
    });

    const adminOnly = ['admin'];
    app.post('/api/data/:collection', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.addItem(req.params.collection, req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.put('/api/data/:collection/:id', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.updateItem(req.params.collection, req.params.id, req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.delete('/api/data/:collection/:id', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.deleteItem(req.params.collection, req.params.id);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/config/empresa', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.getCompanyConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/empresa', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.updateCompanyConfig(req.body);
        if (result.success) broadcast({ type: 'companyConfig', data: req.body });
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/config/ventas', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.getVentasConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/ventas', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.updateVentasConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/config/soporte', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.getSoporteConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/soporte', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.updateSoporteConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/config/pagos', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.getPagosConfig();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/config/pagos', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.updatePagosConfig(req.body);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/upload/logo', checkRole(adminOnly), upload.single('logo'), (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });
        res.json({ success: true, filePath: `/uploads/${req.file.filename}` });
    });

    app.get('/api/menu-items', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.getAllMenuItems();
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/menu-items', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.addMenuItem(req.body);
        res.status(result.success ? 201 : 400).json(result);
    });
    
    app.put('/api/menu-items/:id', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.updateMenuItem(req.params.id, req.body);
        res.status(result.success ? 200 : 400).json(result);
    });
    
    app.delete('/api/menu-items/:id', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.deleteMenuItem(req.params.id);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.get('/api/users', checkRole(adminOnly), async (req, res) => {
        const result = await firestoreHandler.getAllUsers();
        if (result.success && result.data) {
            Object.keys(result.data).forEach(username => {
                delete result.data[username].password;
            });
        }
        res.status(result.success ? 200 : 500).json(result);
    });

    app.post('/api/users', checkRole(adminOnly), async (req, res) => {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: 'Datos incompletos.' });
        }
        const existingUser = await firestoreHandler.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'El nombre de usuario ya existe.' });
        }
        const result = await firestoreHandler.addUser(username, { password, role });
        res.status(result.success ? 201 : 500).json(result);
    });

    app.put('/api/users/:username', checkRole(adminOnly), async (req, res) => {
        const { username } = req.params;
        const { password, role } = req.body;
        
        const userData = {};
        if (password) userData.password = password;
        if (role) userData.role = role;

        if (Object.keys(userData).length === 0) {
            return res.status(400).json({ success: false, message: 'No hay datos para actualizar.' });
        }

        const result = await firestoreHandler.updateUser(username, userData);
        res.status(result.success ? 200 : 500).json(result);
    });

    app.delete('/api/users/:username', checkRole(adminOnly), async (req, res) => {
        const { username } = req.params;
        const result = await firestoreHandler.deleteUser(username);
        res.status(result.success ? 200 : 500).json(result);
    });

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
