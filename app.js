// app.js
require('dotenv').config();
const http = require('http');
const express = require('express');
const chalk =require('chalk');

const whatsappClient = require('./modules/whatsappClient');
const createMikrowispApi = require('./modules/mikrowispApi');
const createWebPanel = require('./modules/webPanel');
const firestoreHandler = require('./modules/firestore_handler'); 
// Importamos el cliente de Redis para que se conecte y para pasarlo al panel
const redisClient = require('./modules/redisClient');

// --- INICIAR API PARA MIKROWISP (Puerto 3000) ---
const mikrowispApp = express();
createMikrowispApi(mikrowispApp, whatsappClient);
const mikrowispServer = http.createServer(mikrowispApp);
mikrowispServer.listen(3000, () => {
    console.log(chalk.blue('🚀 API para Mikrowisp escuchando en el puerto 3000'));
});

// --- INICIAR PANEL DE CONTROL WEB (Puerto 6780) ---
const webPanelApp = express();
const webPanelServer = http.createServer(webPanelApp);
// MODIFICADO: Pasamos firestoreHandler y el NUEVO redisClient
const { broadcast } = createWebPanel(webPanelApp, webPanelServer, whatsappClient, firestoreHandler, redisClient);
webPanelServer.listen(6780, () => {
    console.log(chalk.magenta('🖥️  Panel de Control Web escuchando en el puerto 6780'));
});

// --- Lógica de la Consola en Vivo (Sin cambios) ---
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
    originalLog.apply(console, args);
    const message = args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg, null, 2) : arg).join(' ');
    if (broadcast) broadcast({ type: 'log', data: { level: 'log', message } });
};
console.error = function(...args) {
    originalError.apply(console, args);
    const message = args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg, null, 2) : arg).join(' ');
    if (broadcast) broadcast({ type: 'log', data: { level: 'error', message } });
};
console.warn = function(...args) {
    originalWarn.apply(console, args);
    const message = args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg, null, 2) : arg).join(' ');
    if (broadcast) broadcast({ type: 'log', data: { level: 'warn', message } });
};

// --- Inicialización del Bot ---
(async () => {
    try {
        whatsappClient.initialize();
    } catch (error) {
        console.error(chalk.red.bold('❌ Error fatal al inicializar el bot:'), error);
    }
})();
