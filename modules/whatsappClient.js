// modules/whatsappClient.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const { EventEmitter } = require('events');
const chalk = require('chalk');

class WhatsAppClient extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.status = 'DESCONECTADO';
    }

    initialize() {
        if (this.client || this.status === 'INICIALIZANDO') {
            return;
        }
        this.updateStatus('INICIALIZANDO');
        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: "bot_mkw" }),
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
             webVersionCache: {
              type: 'remote',
              remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        this.client.on('qr', (qr) => {
            this.updateStatus('ESPERANDO QR');
            this.emit('qr', qr);
        });
        this.client.on('ready', () => this.updateStatus('CONECTADO'));
        this.client.on('disconnected', (reason) => {
            this.client = null;
            this.updateStatus('DESCONECTADO');
        });
        this.client.on('auth_failure', () => this.updateStatus('ERROR DE AUTENTICACIÓN'));
        this.client.on('message', this.handleMessage.bind(this));
        this.client.initialize().catch(() => this.updateStatus('ERROR'));
    }

    async disconnect() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.updateStatus('DESCONECTADO');
        }
    }

    handleMessage(message) {
        // --- INICIO DE LA MODIFICACIÓN ---
        // Filtro para ignorar los estados de WhatsApp y no mostrarlos en consola.
        if (message.from === 'status@broadcast') {
            return;
        }
        // --- FIN DE LA MODIFICACIÓN ---

        if (!this.client) return;
        console.log(chalk.blue(`📥 Mensaje recibido de ${chalk.bold(message.from)}:`) + ` ${message.body}`);
        if (message.body.toLowerCase() === '!ping') {
            this.client.sendMessage(message.from, 'pong');
        }
    }

    async sendMessage(chatId, message) {
        if (this.status !== 'CONECTADO' || !this.client) {
            throw new Error('El cliente no está conectado.');
        }
        return this.client.sendMessage(chatId, message);
    }

    updateStatus(newStatus) {
        if (this.status === newStatus) return;
        this.status = newStatus;
        this.emit('statusChange', this.status);
    }

    getStatus() {
        return this.status;
    }
}

module.exports = new WhatsAppClient();

