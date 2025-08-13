// modules/whatsappClient.js
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { EventEmitter } = require('events');
const chalk = require('chalk');
const chrono = require('chrono-node');
const qrcode = require('qrcode');
const { getStorage } = require('firebase-admin/storage');

const { llamarScriptExterno } = require('./external_scripts');
const { getClientDetails } = require('./mikrowispClient');
const calendarHandler = require('./calendar_handler');
const firestoreHandler = require('./firestore_handler');
const iaHandler = require('./ia_handler');
const redisClient = require('./redisClient');

const supportGroupPool = {};
const TIMEOUT_MS = 15 * 60 * 1000;
const STATE_TTL_SECONDS = 3600; // 1 hora
const SALES_LEADS_GROUP_ID = process.env.SALES_LEADS_GROUP_ID;

// --- INICIO DE NUEVA CONSTANTE ---
const AWAIT_DNI_TTL_SECONDS = 60; // 60 segundos de espera para el DNI
// --- FIN DE NUEVA CONSTANTE ---

const storage = getStorage();

class WhatsAppClient extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.status = 'DESCONECTADO';
        this.initializeSupportPool();
    }

    async _updateSessionState(session) {
        if (!session || !session.ticketId) return;
        const savableSession = { ...session };
        delete savableSession.timeoutId;
        await redisClient.set(`session:${session.ticketId}`, savableSession);
        await redisClient.set(`session_client:${session.clientChatId}`, savableSession);
        if (session.assignedGroup) {
            await redisClient.set(`session_group:${session.assignedGroup}`, savableSession);
        }
    }

    initializeSupportPool() {
        const groupIds = process.env.SUPPORT_CHAT_GROUP_IDS || '';
        groupIds.split(',').forEach(id => {
            if (id) supportGroupPool[id.trim()] = 'free';
        });
        console.log(chalk.green(`✅ Pool de ${Object.keys(supportGroupPool).length} grupos de soporte inicializado.`));
    }

    initialize() {
        if (this.client || this.status === 'INICIALIZING') return;
        this.updateStatus('INICIALIZANDO');
        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: "bot_mkw" }),
            puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
            webVersionCache: {
              type: 'remote',
              remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });
        
        this.client.on('qr', (qr) => { this.updateStatus('ESPERANDO QR'); this.emit('qr', qr); });
        this.client.on('ready', this.onReady.bind(this));
        this.client.on('disconnected', this.onDisconnected.bind(this));
        this.client.on('auth_failure', this.onAuthFailure.bind(this));
        this.client.on('message', this.handleMessage.bind(this));
        
        this.client.initialize().catch((err) => {
            console.error(chalk.red('Error en client.initialize():'), err);
            this.updateStatus('ERROR');
        });
    }

    onReady() { this.updateStatus('CONECTADO'); }
    onDisconnected() { this.updateStatus('DESCONECTADO'); }
    onAuthFailure() { this.updateStatus('ERROR DE AUTENTICACIÓN'); }
    
    async disconnect() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.updateStatus('DESCONECTADO');
        }
    }

    async handleMessage(message) {
        if (message.fromMe || message.from === 'status@broadcast' || !this.client) return;
        
        console.log(chalk.gray(`[DEBUG] Mensaje recibido de ${message.from}. Tipo: ${message.type}, Mimetype: ${message.mimetype}`));

        const chat = await message.getChat();
        if (chat.isGroup) {
            await this.handleGroupMessage(message);
            return;
        }

        if (message.type === 'image' || message.type === 'document') {
            await this.procesarComprobanteRecibido(message);
        } else {
            await this.handleClientMessage(message);
        }
    }

    // --- INICIO DE MODIFICACIÓN: Lógica para clientes no identificados ---
    async procesarComprobanteRecibido(message) {
        const chatId = message.from;
        
        try {
            const media = await message.downloadMedia();
            if (!media || !media.data) throw new Error("No se pudo descargar el archivo adjunto.");

            if (!media.mimetype || !(media.mimetype.startsWith('image/') || media.mimetype === 'application/pdf')) {
                console.log(chalk.yellow(`   -> Archivo de tipo '${media.mimetype}' ignorado. No es un comprobante válido.`));
                await this.client.sendMessage(chatId, "El archivo que enviaste no parece ser un comprobante (imagen o PDF). Por favor, intenta de nuevo.");
                return;
            }

            console.log(chalk.blue(`🧾 Archivo recibido de ${chatId}. Iniciando procesamiento de comprobante...`));
            await this.client.sendMessage(chatId, "¡Recibimos tu comprobante! 📄 Un momento por favor, lo estoy analizando... 🤖");

            const bucket = storage.bucket();
            const fileName = `comprobantes/${chatId.replace('@c.us', '')}_${Date.now()}.${media.mimetype.split('/')[1] || 'pdf'}`;
            const file = bucket.file(fileName);
            const fileBuffer = Buffer.from(media.data, 'base64');

            await file.save(fileBuffer, { metadata: { contentType: media.mimetype } });
            
            const [downloadURL] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
            
            console.log(chalk.green(`   -> Archivo subido a Storage. URL: ${downloadURL}`));

            const phoneNumber = chatId.replace('@c.us', '').slice(-10);
            const clientResult = await getClientDetails(phoneNumber);
            
            const configResult = await firestoreHandler.getPagosConfig();
            const prompt = configResult.data.promptAnalisisComprobante;
            const umbral = configResult.data.umbralFiabilidad;
            
            const iaResult = await iaHandler.analizarComprobante(media.data, media.mimetype, prompt);
            console.log(chalk.yellow('   -> Resultado del análisis de IA:'), iaResult);
            
            let clientInfo;
            let logResult;

            // Lógica condicional para cliente conocido vs. desconocido
            if (clientResult.success) {
                // FLUJO PARA CLIENTE CONOCIDO (LÓGICA ORIGINAL)
                const clientData = clientResult.data;
                clientInfo = { id: clientData.id, nombre: clientData.nombre, cedula: clientData.cedula };
                const comprobanteData = {
                    timestamp: new Date(),
                    cliente: clientInfo,
                    remitente: chatId,
                    urlArchivo: downloadURL,
                    resultadoIA: iaResult,
                    estado: 'Pendiente',
                };
                logResult = await firestoreHandler.logComprobante(comprobanteData);

            } else {
                // FLUJO NUEVO PARA CLIENTE DESCONOCIDO
                console.log(chalk.yellow(`   -> Comprobante de un número no registrado. Solicitando DNI.`));
                clientInfo = { nombre: `Remitente: ${chatId.replace('@c.us', '')}`, cedula: '' };
                const comprobanteData = {
                    timestamp: new Date(),
                    cliente: clientInfo,
                    remitente: chatId,
                    urlArchivo: downloadURL,
                    resultadoIA: iaResult,
                    estado: 'Pendiente (No Identificado)',
                };
                logResult = await firestoreHandler.logComprobante(comprobanteData);
                if (logResult.success) {
                    const newState = { step: 'awaiting_dni_for_receipt', lastReceiptId: logResult.id };
                    await redisClient.set(`state:${chatId}`, newState, AWAIT_DNI_TTL_SECONDS);
                    await this.client.sendMessage(chatId, "He recibido tu comprobante. Para poder asociarlo a tu cuenta, por favor, envíame tu DNI o CUIT.");
                }
            }

            if (!logResult.success) {
                throw new Error("No se pudo registrar el comprobante en la base de datos.");
            }

            // Notificación al usuario post-análisis (solo si no se pidió DNI)
            if (clientResult.success) {
                 if (iaResult.error) {
                    await this.client.sendMessage(chatId, `⚠️ No pude analizar el archivo. Motivo: ${iaResult.error}. Un agente lo revisará manualmente.`);
                } else {
                    const fiabilidad = iaResult.confiabilidad_porcentaje || 0;
                    let responseMsg = `¡Análisis completo! 👍\n\n*Entidad:* ${iaResult.entidad || 'N/A'}\n*Monto:* $${iaResult.monto || 'N/A'}\n*Fecha:* ${iaResult.fecha || 'N/A'}\n\n*Fiabilidad:* ${fiabilidad}%\n\n`;
                    
                    if (fiabilidad >= umbral) {
                        responseMsg += "La fiabilidad es alta. Intentaremos procesar tu pago automáticamente. Te notificaremos si hay algún problema.";
                        await firestoreHandler.updateComprobante(logResult.id, { estado: 'Auto-Aprobado' });
                    } else {
                        responseMsg += "La fiabilidad es baja. Un agente revisará tu comprobante a la brevedad para confirmar el pago.";
                    }
                    await this.client.sendMessage(chatId, responseMsg);
                }
            }
            
            this.emit('receiptsUpdate');

        } catch (error) {
            console.error(chalk.red.bold('❌ ERROR CRÍTICO durante el procesamiento de comprobante:'), error);
            await this.client.sendMessage(chatId, "Lo siento, ocurrió un error técnico al procesar tu comprobante. Un agente lo revisará manualmente.");
        }
    }
    // --- FIN DE MODIFICACIÓN ---
    
    async sendAiResponse(chatId, textResponse) {
        const configResult = await firestoreHandler.getSoporteConfig();
        const voiceResponsesEnabled = configResult.success && configResult.data.respuestasPorVozActivas;

        if (!voiceResponsesEnabled) {
            await this.client.sendMessage(chatId, textResponse);
            return;
        }

        const audioBase64 = await iaHandler.sintetizarVoz(textResponse);
        if (audioBase64) {
            try {
                const audioMedia = new MessageMedia('audio/ogg; codecs=opus', audioBase64, 'voice_note.ogg');
                await this.client.sendMessage(chatId, audioMedia, { sendAudioAsVoice: true });
            } catch (e) {
                console.error(chalk.red('❌ Error al enviar el audio como nota de voz:'), e);
                console.log(chalk.yellow('   -> Fallback: Enviando respuesta como texto.'));
                await this.client.sendMessage(chatId, textResponse);
            }
        } else {
            console.log(chalk.yellow('   -> Fallback: Enviando respuesta como texto porque la síntesis falló.'));
            await this.client.sendMessage(chatId, textResponse);
        }
    }

    // --- INICIO DE MODIFICACIÓN: Lógica para capturar DNI post-comprobante ---
    async handleClientMessage(message) {
        const chatId = message.from;
        let userMessage = '';

        if (message.hasMedia && (message.type === 'audio' || message.type === 'ptt')) {
            try {
                const media = await message.downloadMedia();
                if (media && media.data) {
                    const transcribedText = await iaHandler.transcribirAudio(media.mimetype, media.data);
                    
                    if (transcribedText && !transcribedText.includes("[Error")) {
                        userMessage = transcribedText;
                    } else {
                        await this.client.sendMessage(chatId, "Lo siento, no pude entender tu mensaje de voz. ¿Podrías intentarlo de nuevo o escribir tu consulta?");
                    }
                }
            } catch (error) {
                console.error(chalk.red.bold('❌ ERROR CRÍTICO durante el procesamiento de audio:'), error);
                await this.client.sendMessage(chatId, "Hubo un problema técnico al procesar tu audio. Por favor, intenta escribir tu consulta.");
            }
        } else if (message.body && typeof message.body === 'string') {
            userMessage = message.body.trim();
        }
        
        if (!userMessage) {
            return;
        }
        
        console.log(chalk.blue(`📥 Mensaje (procesado) de ${chatId}:`) + ` ${userMessage}`);

        const activeSession = await redisClient.get(`session_client:${chatId}`);
        if (activeSession) {
            const messageToRelay = { ...message, body: userMessage };
            await this.relayToAgent(activeSession, messageToRelay);
            return;
        }

        let currentState = await redisClient.get(`state:${chatId}`);

        // NUEVA LÓGICA: Capturar DNI después de enviar un comprobante
        if (currentState && currentState.step === 'awaiting_dni_for_receipt') {
            const dni = userMessage.replace(/[.-]/g, '');
            console.log(chalk.cyan(`   -> Recibido DNI ${dni} para asociar al comprobante ${currentState.lastReceiptId}`));
            const clientResult = await getClientDetails(dni);

            if (clientResult.success) {
                const clientData = clientResult.data;
                const clientInfo = { id: clientData.id, nombre: clientData.nombre, cedula: clientData.cedula };
                await firestoreHandler.updateComprobante(currentState.lastReceiptId, { cliente: clientInfo, estado: 'Pendiente' });
                await this.client.sendMessage(chatId, `¡Gracias, ${clientData.nombre}! Hemos asociado el comprobante a tu cuenta. Un agente lo revisará a la brevedad.`);
                await redisClient.del(`state:${chatId}`);
                this.emit('receiptsUpdate');
            } else {
                await this.client.sendMessage(chatId, "No pude encontrar una cuenta con ese DNI. Por favor, verifica el número e inténtalo de nuevo. El comprobante será revisado manualmente.");
                // Dejamos que el estado expire solo.
            }
            return; // Finaliza la ejecución para este mensaje
        }

        if (userMessage.toLowerCase() === '!fin') {
            await redisClient.del(`state:${chatId}`);
            await this.client.sendMessage(chatId, 'Ok, hemos reiniciado la conversación. Puedes empezar de nuevo.');
            return;
        }
        
        if (currentState && currentState.awaiting_agent) {
            await this.client.sendMessage(chatId, "¡Hola! Ya tenés una solicitud de soporte abierta. Un agente te responderá a la brevedad. 👍");
            return;
        }
        
        if (!currentState) {
            const phoneNumber = chatId.replace('@c.us', '').slice(-10);
            const resultByPhone = await getClientDetails(phoneNumber);

            if (resultByPhone.success) {
                currentState = { isClient: true, clientData: resultByPhone.data };
                await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                await this.sendWelcomeMessage(chatId, resultByPhone.data, currentState);
            } else {
                const configResult = await firestoreHandler.getVentasConfig();
                const welcomeMessage = configResult.success ? configResult.data.mensajeBienvenida : "¡Hola! Soy tu asistente virtual.";
                await this.client.sendMessage(chatId, `${welcomeMessage}\n\nPara poder ayudarte, responde con tu *DNI/CUIT* si ya eres cliente, o con tu *nombre* si deseas consultar por nuestros servicios.`);
                currentState = { step: 'awaiting_identification' };
                await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
            }
            return;
        }

        switch (currentState.step) {
            case 'awaiting_identification':
                const cleanedMessage = userMessage.replace(/[.-]/g, '');
                if (/^\d{7,8}$/.test(cleanedMessage) || /^\d{11}$/.test(cleanedMessage)) {
                    const result = await getClientDetails(cleanedMessage);
                    if (result.success) {
                        currentState = { isClient: true, clientData: result.data };
                        await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                        await this.sendWelcomeMessage(chatId, result.data, currentState);
                    } else {
                        await this.client.sendMessage(chatId, "No te encontré en nuestro sistema. ¿Podrías decirme tu nombre para consultar por nuestros servicios?");
                        currentState = { isClient: false, chatHistory: [], prospectData: {}, step: 'sales_get_name' };
                        await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                    }
                } else {
                    currentState = { isClient: false, chatHistory: [], prospectData: { name: userMessage } };
                    currentState.chatHistory.push({ role: 'user', parts: [{ text: "Hola" }] });
                    await this.sendAiResponse(chatId, `¡Un gusto, ${userMessage}! 😊 ¿En qué te puedo ayudar hoy?`);
                    await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                }
                break;

            case 'sales_get_name':
                currentState = { isClient: false, chatHistory: [], prospectData: { name: userMessage } };
                await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                await this.handleNewProspect(chatId, userMessage, currentState);
                break;

            default:
                if (currentState.isClient) {
                    await this.handleRegisteredClient(chatId, userMessage, currentState);
                } else {
                    await this.handleNewProspect(chatId, userMessage, currentState);
                }
                break;
        }
    }
    // --- FIN DE MODIFICACIÓN ---

    async handleRegisteredClient(chatId, userMessage, currentState) {
        const isNumericOption = /^\d+$/.test(userMessage);
        const currentOptions = currentState.currentOptions || [];
    
        if (currentState.step === 'awaiting_invoice_selection') {
            if (isNumericOption) {
                const selectedIndex = parseInt(userMessage, 10) - 1;
                const pendingInvoices = currentState.pendingInvoices || [];
                if (selectedIndex >= 0 && selectedIndex < pendingInvoices.length) {
                    const selectedInvoice = pendingInvoices[selectedIndex];
                    currentState.selectedInvoice = selectedInvoice;
                    currentState.step = 'awaiting_qr_confirmation';
                    await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                    await this.client.sendMessage(chatId, `Has seleccionado la factura *#${selectedInvoice.id_factura}* por un total de *${selectedInvoice.total_formateado}*.\n\n¿Deseas generar el código QR de Mercado Pago para abonarla?\n\nResponde *SI* o *NO*.`);
                } else {
                    await this.client.sendMessage(chatId, "⚠️ Opción no válida. Por favor, elige uno de los números de la lista de facturas.");
                }
            } else {
                await this.client.sendMessage(chatId, "Por favor, responde con el número de la factura que quieres pagar.");
            }
            return;
        }

        if (currentState.step === 'awaiting_qr_confirmation') {
            const confirmation = await iaHandler.analizarConfirmacion(userMessage);
            if (confirmation === 'SI') {
                await this.generateAndSendQr(chatId, currentState);
            } else {
                await this.client.sendMessage(chatId, "Entendido. Si necesitas algo más, no dudes en volver a escribir.");
                await redisClient.del(`state:${chatId}`);
            }
            return;
        }

        if (isNumericOption) {
            const selectedNumber = parseInt(userMessage, 10);
    
            if (selectedNumber === 0 && currentState.currentParentId !== 'root') {
                console.log(chalk.green(`   -> Usuario seleccionó la opción: "Volver al Menú Principal"`));
                await this.sendMenu(chatId, 'root', currentState);
                return;
            }
    
            const selectedOption = currentOptions.find(opt => opt.order === selectedNumber);
    
            if (selectedOption) {
                console.log(chalk.green(`   -> Usuario seleccionó la opción: "${selectedOption.title}"`));
                await this.executeMenuAction(chatId, selectedOption, currentState);
            } else {
                await this.client.sendMessage(chatId, "⚠️ Opción no válida. Por favor, elige uno de los números de la lista.");
                await this.sendMenu(chatId, currentState.currentParentId, currentState);
            }
        } else {
            const chatHistory = currentState.chatHistory || [];
            chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
            const faqResponse = await iaHandler.answerSupportQuestion(chatHistory);
            
            if (faqResponse.includes("[NO_ANSWER]")) {
                const apologyMessage = faqResponse.replace("[NO_ANSWER]", "").trim();
                if (apologyMessage) {
                    await this.sendAiResponse(chatId, apologyMessage);
                }
                await this.createSupportTicket(chatId, userMessage, currentState.clientData);
            } else {
                await this.sendAiResponse(chatId, faqResponse);
                currentState.chatHistory = chatHistory;
                currentState.chatHistory.push({ role: 'model', parts: [{ text: faqResponse }] });
                await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
            }
        }
    }
    
    async sendMenu(chatId, parentId, currentState) {
        let menuMessage = '';
        let options = [];
    
        if (parentId === 'root') {
            menuMessage = '*Menú Principal*\n\n';
            options = await firestoreHandler.getMenuItems('root');
        } else {
            const menuHeader = await firestoreHandler.getMenuItemById(parentId);
            if (!menuHeader) {
                console.error(chalk.red(`No se pudo encontrar el encabezado del menú para el padre '${parentId}'.`));
                await this.client.sendMessage(chatId, "Lo siento, tuvimos un problema para mostrar las opciones.");
                return;
            }
            
            menuMessage = `*${menuHeader.title}*\n\n`;
            if (menuHeader.description) {
                menuMessage += `${menuHeader.description}\n\n`;
            }
            options = await firestoreHandler.getMenuItems(parentId);
        }
    
        options.forEach((option) => {
            menuMessage += `*${option.order}* - ${option.title}\n`;
        });
    
        if (parentId !== 'root') {
            menuMessage += `*0* - Volver al Menú Principal\n`;
        }
    
        menuMessage += `\nEliga el número de la opción deseada o escriba su consulta.`;
    
        await this.client.sendMessage(chatId, menuMessage);
    
        currentState.currentParentId = parentId;
        currentState.currentOptions = options;
        await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
        console.log(chalk.magenta(`   -> Menú para padre '${parentId}' enviado y estado actualizado.`));
    }

    async executeMenuAction(chatId, selectedOption, currentState) {
        switch (selectedOption.actionType) {
            case 'submenu':
                await this.sendMenu(chatId, selectedOption.id, currentState);
                break;
            case 'reply':
                await this.client.sendMessage(chatId, selectedOption.description || "Aquí va la información.");
                const parentOfCurrent = currentState.currentOptions[0]?.parent || 'root';
                await this.sendMenu(chatId, parentOfCurrent, currentState);
                break;
            case 'create_ticket':
                const initialMessage = `Cliente seleccionó: "${selectedOption.title}"`;
                await this.createSupportTicket(chatId, initialMessage, currentState.clientData);
                break;
            case 'pay_invoice':
                await this.startInvoicePaymentFlow(chatId, currentState);
                break;
            default:
                console.error(chalk.red(`Tipo de acción desconocida: ${selectedOption.actionType}`));
                await this.client.sendMessage(chatId, "Hubo un problema al procesar tu selección.");
                break;
        }
    }

    async startInvoicePaymentFlow(chatId, currentState) {
        const dni = currentState.clientData?.cedula;
        if (!dni) {
            await this.client.sendMessage(chatId, "No pude encontrar tu DNI para buscar las facturas. Por favor, contacta a soporte.");
            return;
        }

        await this.client.sendMessage(chatId, "Buscando tus facturas pendientes, por favor aguarda un momento... ⏳");

        const result = await llamarScriptExterno('scripts/factura_mkw.js', ['listar', dni]);
        
        console.log('[PUNTO DE CONTROL WC] Respuesta recibida del script:', JSON.stringify(result, null, 2));

        if (!result.success || !result.facturas || result.facturas.length === 0) {
            await this.client.sendMessage(chatId, "¡Buenas noticias! No encontré facturas pendientes de pago a tu nombre. 😊");
            await redisClient.del(`state:${chatId}`);
            return;
        }

        let invoiceMessage = "He encontrado las siguientes facturas pendientes:\n\n";
        result.facturas.forEach((factura, index) => {
            const vencimiento = new Date(factura.fecha_vencimiento).toLocaleDateString('es-AR');
            invoiceMessage += `*${index + 1}* - Factura *#${factura.id_factura}*\n      Vence: ${vencimiento}\n      Total: *${factura.total_formateado}*\n\n`;
        });
        invoiceMessage += "Por favor, responde con el *número* de la factura que deseas abonar.";

        currentState.step = 'awaiting_invoice_selection';
        currentState.pendingInvoices = result.facturas;
        await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);

        await this.client.sendMessage(chatId, invoiceMessage);
    }

    async generateAndSendQr(chatId, currentState) {
        const invoice = currentState.selectedInvoice;
        if (!invoice) {
            await this.client.sendMessage(chatId, "Hubo un error, no tengo una factura seleccionada. Empecemos de nuevo.");
            await redisClient.del(`state:${chatId}`);
            return;
        }
        
        await this.client.sendMessage(chatId, "¡Perfecto! Generando tu código QR, un momento por favor... ⚙️");

        const amount = parseFloat(String(invoice.total_formateado).replace(/[^0-9,-]+/g, "").replace(",", "."));
        const title = `Factura #${invoice.id_factura}`;
        const description = `Pago de servicio de Internet`;

        const result = await llamarScriptExterno('scripts/mercadopago_qr_mkw.js', [amount, title, invoice.id_factura, description]);

        if (result.success && result.qr_data_string) {
            try {
                const qrImage = await qrcode.toDataURL(result.qr_data_string);
                const media = new MessageMedia('image/png', qrImage.split("base64,")[1], 'qr-pago.png');
                await this.client.sendMessage(chatId, media, { caption: '¡Listo! Aquí tienes tu código QR para abonar. Podés escanearlo desde la app de Mercado Pago o cualquier billetera virtual. ¡Gracias!' });
            } catch (qrError) {
                console.error(chalk.red('❌ Error generando la imagen QR:'), qrError);
                await this.client.sendMessage(chatId, "No pude generar la imagen del código QR. Por favor, intenta de nuevo más tarde.");
            }
        } else {
            await this.client.sendMessage(chatId, `Lo siento, no pude generar el código de pago en este momento. El error fue: ${result.message || 'Desconocido'}`);
        }

        await redisClient.del(`state:${chatId}`);
    }

    async handleNewProspect(chatId, userMessage, currentState) {
        if (currentState.awaiting_sales_confirmation) {
            const intencion = await iaHandler.analizarConfirmacion(userMessage);
            if (intencion === 'SI') {
                if (SALES_LEADS_GROUP_ID) {
                    const prospectData = currentState.prospectData || {};
                    let notification = `*✅ Lead de Venta Confirmado*\n\n*Cliente:* ${prospectData.name || 'N/A'}\n*Número:* ${chatId.replace('@c.us', '')}`;
                    if (prospectData.address) notification += `\n*Dirección:* "${prospectData.address}"`;
                    await this.client.sendMessage(SALES_LEADS_GROUP_ID, notification);
                    await this.client.sendMessage(chatId, `¡Excelente! Un asesor se comunicará a la brevedad. ¡Gracias! 👍`);
                }
            } else {
                await this.client.sendMessage(chatId, `Entendido. Si tenés otra consulta, no dudes en preguntar.`);
            }
            await redisClient.del(`state:${chatId}`);
            return;
        }

        let chatHistory = currentState.chatHistory || [];
        chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
        let aiResponse = await iaHandler.handleSalesConversation(chatHistory);
        
        if (aiResponse.includes('[DIRECCION_DETECTADA]') || aiResponse.includes('[CIERRE_DIRECTO]')) {
            if (aiResponse.includes('[DIRECCION_DETECTADA]')) {
                aiResponse = aiResponse.replace('[DIRECCION_DETECTADA]', '').trim();
                currentState.prospectData.address = userMessage; 
            }
            if (aiResponse.includes('[CIERRE_DIRECTO]')) {
                aiResponse = aiResponse.replace('[CIERRE_DIRECTO]', '').trim();
            }
            currentState.awaiting_sales_confirmation = true;
        }

        chatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
        currentState.chatHistory = chatHistory;
        await this.sendAiResponse(chatId, aiResponse);
        await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
    }

    async handleGroupMessage(message) {
        const groupId = message.from;
        const triageGroupId = process.env.TRIAGE_GROUP_ID;
        if (groupId === triageGroupId) {
            await this.handleTriageGroupMessage(message);
        } else if (supportGroupPool[groupId] === 'busy') {
            await this.handleSupportChatMessage(message);
        }
    }

    async handleTriageGroupMessage(message) {
        if (!message.hasQuotedMsg) return;
        const quotedMsg = await message.getQuotedMessage();
        const session = await redisClient.get(`session:${quotedMsg.id.id}`);

        if (session && session.status === 'pending') {
            const agentId = message.author;
            const freeGroup = Object.keys(supportGroupPool).find(id => supportGroupPool[id] === 'free');

            if (freeGroup) {
                supportGroupPool[freeGroup] = 'busy';
                session.status = 'in_progress';
                session.agentId = agentId;
                session.assignedGroup = freeGroup;
                const agentContact = await this.client.getContactById(agentId);
                session.agentName = agentContact.pushname || agentContact.number;

                await firestoreHandler.updateTicket(session.ticketId, { Agente_Asignado: session.agentName, Estado: 'En Progreso' });
                await this._updateSessionState(session);

                await this.client.sendMessage(process.env.TRIAGE_GROUP_ID, `✅ *${session.agentName}* ha tomado el caso. La conversación continúa en el grupo asignado.`);
                await this.client.sendMessage(freeGroup, `*Nuevo Caso Asignado*\n\n*Cliente:* ${session.clientName}\n*Agente:* ${session.agentName}\n\n*Mensaje:* "${session.initialMessage}"\n\n*Puedes empezar a responder.*`);
                this.resetInactivityTimeout(session);
                this.emit('sessionsUpdate');
            } else {
                await this.client.sendMessage(process.env.TRIAGE_GROUP_ID, '🔴 No hay grupos de chat disponibles.');
            }
        }
    }

    async handleSupportChatMessage(message) {
        const session = await redisClient.get(`session_group:${message.from}`);
        if (!session) return;
        const messageBody = message.body.trim().toLowerCase();

        if (session.pendingAppointment) {
            if (messageBody === 'si' || messageBody === 'sí') {
                const appointment = session.pendingAppointment;
                const result = await calendarHandler.createEvent(appointment.title, appointment.description, new Date(appointment.eventDate), new Date(appointment.eventEndDate));
                await this.client.sendMessage(message.from, result.message);
                if (result.success) {
                    const friendlyDate = new Date(appointment.eventDate).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
                    await this.client.sendMessage(session.clientChatId, `👍 ¡Buenas noticias! Te hemos agendado una visita técnica para el ${friendlyDate} hs.`);
                }
            } else {
                await this.client.sendMessage(message.from, '✅ Agendamiento cancelado.');
            }
            delete session.pendingAppointment;
            await this._updateSessionState(session);
            return;
        }

        if (message.body.startsWith('/')) {
            const command = messageBody.split(' ')[0];
            if (command === '/fin') {
                await this.closeSupportSession(session, 'resuelto por el agente');
                return;
            }
            if (command === '/agendar') {
                const commandText = message.body.substring('/agendar'.length).trim();
                const parsedDate = chrono.es.parseDate(commandText, new Date(), { forwardDate: true });
                if (!parsedDate) return this.client.sendMessage(message.from, '🔴 No pude entender la fecha y hora.');
                const eventDate = parsedDate;
                const eventEndDate = new Date(eventDate.getTime() + 60 * 60 * 1000);
                const title = `Visita Técnica - ${session.clientName}`;
                const description = `Cliente: ${session.clientName}\nCelular: ${session.clientChatId.replace('@c.us','')}\nProblema: ${commandText}`;
                session.pendingAppointment = { title, description, eventDate: eventDate.toISOString(), eventEndDate: eventEndDate.toISOString() };
                await this._updateSessionState(session);
                const friendlyDate = eventDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
                await this.client.sendMessage(message.from, `🗓️ Agendando visita para el *${friendlyDate} hs*.\n\n¿Es correcto? Responde *si* o *no*.`);
                return;
            }
        } else {
            await this.relayToClient(session, message);
        }
    }

    async createSupportTicket(clientChatId, userMessage, clientData) {
        const clientName = clientData.nombre;
        const triageGroupId = process.env.TRIAGE_GROUP_ID;
        if (!triageGroupId) return this.client.sendMessage(clientChatId, 'La función de soporte no está configurada.');

        try {
            const sentimiento = await iaHandler.analizarSentimiento(userMessage);
            let notification = `*🚨 Nuevo Ticket de Soporte 🚨*\n\n*Cliente:* ${clientName}\n*Sentimiento:* ${sentimiento}\n*Mensaje:* "${userMessage}"\n\n*Para tomar este caso, responde a ESTE mensaje.*`;
            const ticketMsg = await this.client.sendMessage(triageGroupId, notification);

            const sessionData = { ticketId: ticketMsg.id.id, clientChatId, clientName, initialMessage: userMessage, status: 'pending' };
            await redisClient.set(`session:${sessionData.ticketId}`, sessionData);
            
            const ticketData = { Timestamp: new Date().toLocaleString('es-AR'), ID_Ticket: ticketMsg.id.id, Nombre_Cliente: clientName, Numero_Cliente: clientChatId.replace('@c.us', ''), Estado: 'Pendiente', Sentimiento: sentimiento, isOpen: true };
            await firestoreHandler.logTicket(ticketData);
            
            await this.client.sendMessage(clientChatId, '✅ Tu solicitud ha sido enviada. Un agente la tomará en breve.');
            this.emit('sessionsUpdate');
            await redisClient.set(`state:${clientChatId}`, { awaiting_agent: true }, STATE_TTL_SECONDS);
        } catch (error) {
            console.error(chalk.red.bold('❌ ERROR CRÍTICO al crear ticket:'), error);
            await this.client.sendMessage(clientChatId, 'Lo siento, tuvimos un problema interno al crear tu solicitud.');
        }
    }

    async relayToAgent(session, clientMessage) {
        try {
            const groupChat = await this.client.getChatById(session.assignedGroup);
            if (clientMessage.hasMedia) {
                const media = await clientMessage.downloadMedia();
                await groupChat.sendMessage(media, { caption: `*De ${session.clientName}:*` });
            } else {
                await groupChat.sendMessage(`*${session.clientName}:*\n${clientMessage.body}`);
            }
            this.resetInactivityTimeout(session);
        } catch (e) {
            console.error(chalk.red(`❌ FATAL: No se pudo retransmitir al grupo ${session.assignedGroup}.`), e);
        }
    }

    async relayToClient(session, agentMessage) {
        try {
            if (agentMessage.hasMedia) {
                const media = await agentMessage.downloadMedia();
                await this.client.sendMessage(session.clientChatId, media, { caption: agentMessage.body });
            } else {
                await this.client.sendMessage(session.clientChatId, agentMessage.body);
            }
            this.resetInactivityTimeout(session);
        } catch (e) {
            console.error(chalk.red(`❌ FATAL: No se pudo retransmitir al cliente ${session.clientChatId}.`), e);
        }
    }

    async closeSupportSession(session, reason) {
        await redisClient.del(`session:${session.ticketId}`);
        await redisClient.del(`session_client:${session.clientChatId}`);
        if(session.assignedGroup) {
            await redisClient.del(`session_group:${session.assignedGroup}`);
            supportGroupPool[session.assignedGroup] = 'free';
        }
        await firestoreHandler.updateTicket(session.ticketId, { Estado: 'Cerrado', isOpen: false });
        await this.client.sendMessage(session.clientChatId, `Tu sesión de soporte ha finalizado (motivo: ${reason}). Si necesitas algo más, escríbenos de nuevo.`);
        await redisClient.del(`state:${session.clientChatId}`);
        if (session.assignedGroup) {
            await this.client.sendMessage(session.assignedGroup, `✅ La sesión con *${session.clientName}* ha sido cerrada.`);
        }
        this.emit('sessionsUpdate');
    }

    resetInactivityTimeout(session) {
        if (session.timeoutId) clearTimeout(session.timeoutId);
        session.lastActivity = Date.now();
        this._updateSessionState(session);
        session.timeoutId = setTimeout(() => this.closeSupportSession(session, 'inactividad'), TIMEOUT_MS);
    }
    
    async sendWelcomeMessage(chatId, clientData, currentState, showMenu = true) {
        let responseMessage = `*¡Hola, ${clientData.nombre}!* 👋\n\nSoy I-Bot, tu asistente virtual.\n\n*Resumen de tu cuenta:*\n*Estado:* ${clientData.estado}\n*Deuda Total:* ${clientData.facturacion.total_facturas}\n\n`;
        if (clientData.servicios && clientData.servicios.length > 0) {
            responseMessage += `*Servicios Contratados:*\n`;
            clientData.servicios.forEach(servicio => {
                const statusEmisor = servicio.estado_emisor_texto || 'N/A';
                const statusAntena = servicio.estado_antena_texto || 'N/A';
                responseMessage += `\n  - Plan: *${servicio.perfil}*\n`;
                responseMessage += `    └ _Estado Emisor:_ *${statusEmisor}* | _Tu Antena:_ *${statusAntena}*\n`;
                let analysisMessage = '';
                if (statusEmisor.includes('❌')) analysisMessage = `   └ 🔴 *Diagnóstico:* Problema detectado en nuestra red.`;
                else if (statusAntena.includes('❌')) analysisMessage = `   └ 🟡 *Diagnóstico:* Tu antena parece desconectada.`;
                else if (statusEmisor.includes('✅') && statusAntena.includes('✅')) analysisMessage = `   └ 🟢 *Diagnóstico:* ¡Todo en orden!`;
                responseMessage += `${analysisMessage}\n`;
            });
        }
        
        await this.client.sendMessage(chatId, responseMessage);

        if (showMenu) {
            await this.sendMenu(chatId, 'root', currentState);
        }
    }

    async sendMessage(chatId, message) {
        if (!this.client) throw new Error('El cliente no está conectado.');
        return this.client.sendMessage(chatId, message);
    }

    updateStatus(newStatus) {
        if (this.status === newStatus) return;
        this.status = newStatus;
        console.log(chalk.yellow(`Estado del Bot actualizado a: ${newStatus}`));
        this.emit('statusChange', this.status);
    }
    
    getStatus() {
        return this.status;
    }
}

module.exports = new WhatsAppClient();
