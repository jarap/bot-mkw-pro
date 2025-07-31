// app.js
const http = require('http');
const express = require('express');
const chalk = require('chalk');

// Módulos de nuestra aplicación
const whatsappClient = require('./modules/whatsappClient');
const createMikrowispApi = require('./modules/mikrowispApi');
const createWebPanel = require('./modules/webPanel');

// --- INICIAR API PARA MIKROWISP (Puerto 3000) ---
const mikrowispApp = express();
createMikrowispApi(mikrowispApp, whatsappClient);
const mikrowispServer = http.createServer(mikrowispApp);
mikrowispServer.listen(3000, () => {
    // Este log no se enviará al panel porque la función de broadcast aún no existe.
    console.log(chalk.blue('🚀 API para Mikrowisp escuchando en el puerto 3000'));
});


// --- INICIAR PANEL DE CONTROL WEB (Puerto 6780) ---
const webPanelApp = express();
const webPanelServer = http.createServer(webPanelApp);
// Modificamos para capturar la función de broadcast que retorna el módulo del panel.
const { broadcast } = createWebPanel(webPanelApp, webPanelServer, whatsappClient);

webPanelServer.listen(6780, () => {
    // Este tampoco se enviará.
    console.log(chalk.magenta('🖥️  Panel de Control Web escuchando en el puerto 6780'));
});

// --- INICIO DE LA NUEVA FUNCIONALIDAD: CONSOLA EN VIVO ---
// Guardamos las funciones originales de la consola.
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Sobrescribimos console.log
console.log = function(...args) {
    originalLog.apply(console, args); // Mantenemos el log original en la terminal de PM2
    const message = args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg, null, 2) : arg).join(' ');
    // Usamos la función de broadcast para enviar el log al panel web.
    if (broadcast) broadcast({ type: 'log', data: { level: 'log', message } });
};

// Sobrescribimos console.error
console.error = function(...args) {
    originalError.apply(console, args);
    const message = args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg, null, 2) : arg).join(' ');
    if (broadcast) broadcast({ type: 'log', data: { level: 'error', message } });
};

// Sobrescribimos console.warn
console.warn = function(...args) {
    originalWarn.apply(console, args);
    const message = args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg, null, 2) : arg).join(' ');
    if (broadcast) broadcast({ type: 'log', data: { level: 'warn', message } });
};
// --- FIN DE LA NUEVA FUNCIONALIDAD ---

console.log(chalk.green.bold('Aplicación Bot-MKW iniciada y sistema de logs activado.'));

// Se inicia la conexión del bot automáticamente al arrancar la aplicación.
console.log(chalk.yellow('Iniciando conexión automática del bot...'));
whatsappClient.initialize();

