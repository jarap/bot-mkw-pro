// modules/whatsappClient.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const { EventEmitter } = require('events');
const chalk = require('chalk');
const chrono = require('chrono-node');

const { getClientDetails } = require('./mikrowispClient');
const calendarHandler = require('./calendar_handler');
const firestoreHandler = require('./firestore_handler');
const iaHandler = require('./ia_handler');
const redisClient = require('./redisClient');
const localNlpHandler = require('./local_nlp_handler');

const supportGroupPool = {};
const TIMEOUT_MS = 15 * 60 * 1000;
const STATE_TTL_SECONDS = 12 * 60 * 60; // 12 horas

const SALES_LEADS_GROUP_ID = process.env.SALES_LEADS_GROUP_ID;


class WhatsAppClient extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.status = 'DESCONECTADO';
        this.initializeSupportPool();
    }

    initializeSupportPool() {
        const groupIds = process.env.SUPPORT_CHAT_GROUP_IDS || '';
        groupIds.split(',').forEach(id => {
            if (id) supportGroupPool[id.trim()] = 'free';
        });
        console.log(chalk.green(`✅ Pool de ${Object.keys(supportGroupPool).length} grupos de soporte inicializado.`));
    }

    initialize() {
        if (this.client || this.status === 'INICIALIZANDO') return;
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
        const chat = await message.getChat();
        if (chat.isGroup) {
            await this.handleGroupMessage(message);
        } else {
            await this.handleClientMessage(message);
        }
    }

    async handleClientMessage(message) {
        const chatId = message.from;
        const userMessage = message.body.trim();
        console.log(chalk.blue(`📥 Mensaje de cliente ${chatId}:`) + ` ${userMessage}`);

        const activeSession = await redisClient.get(`session_client:${chatId}`);
        if (activeSession) {
            await this.relayToAgent(activeSession, message);
            return;
        }

        if (userMessage.toLowerCase() === '!fin') {
            await redisClient.del(`state:${chatId}`);
            await this.client.sendMessage(chatId, 'Ok, hemos reiniciado la conversación. Puedes empezar de nuevo.');
            return;
        }

        let currentState = await redisClient.get(`state:${chatId}`);
        
        if (!currentState) {
            const result = await getClientDetails(chatId.replace('@c.us', '').slice(-10));
            if (result.success) {
                currentState = { isClient: true, clientData: result.data };
                await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                await this.sendWelcomeMessage(chatId, result.data);
                await this.handleRegisteredClient(chatId, userMessage, currentState);
            } else {
                console.log(chalk.yellow(`   -> Nuevo prospecto. Iniciando conversación de ventas con IA...`));
                currentState = { isClient: false, awaiting: 'IN_CONVERSATION', chatHistory: [] };
                await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
                await this.handleNewProspect(chatId, userMessage, currentState);
            }
        } else {
            if (currentState.isClient) {
                await this.handleRegisteredClient(chatId, userMessage, currentState);
            } else {
                await this.handleNewProspect(chatId, userMessage, currentState);
            }
        }
    }

    async handleRegisteredClient(chatId, userMessage, currentState) {
        const intencion = localNlpHandler.clasificarIntencionLocal(userMessage);
        if (intencion === 'soporte' || userMessage.toLowerCase().includes('ayuda')) {
            await this.createSupportTicket(chatId, userMessage, currentState.clientData);
        } else {
            const welcomeBackMessage = `¡Hola de nuevo, ${currentState.clientData.nombre}! 😊\n\nRecordá que a través de este chat podés solicitar *soporte técnico* para tu servicio. Si tenés algún problema, no dudes en describirlo y te ayudaremos.`;
            await this.client.sendMessage(chatId, welcomeBackMessage);
        }
    }

    async handleNewProspect(chatId, userMessage, currentState) {
        let chatHistory = currentState.chatHistory || [];
        chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
        
        console.log(chalk.cyan(`   -> Enviando historial a Gemini para continuar conversación de ventas...`));
        let aiResponse = await iaHandler.handleSalesConversation(chatHistory);
        
        // --- INICIO DE LA MODIFICACIÓN ---
        // Se elimina la detección por palabras clave y se implementa la detección por frase secreta.
        const addressDetectionFlag = '[DIRECCION_DETECTADA]';
        let addressDetected = false;

        if (aiResponse.includes(addressDetectionFlag)) {
            addressDetected = true;
            // Limpiamos la respuesta para que el cliente no vea la frase secreta
            aiResponse = aiResponse.replace(addressDetectionFlag, '').trim();
        }

        chatHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
        currentState.chatHistory = chatHistory;
        
        await this.client.sendMessage(chatId, aiResponse);
        
        if (addressDetected) {
            console.log(chalk.green(`   -> IA ha detectado una dirección. Notificando a ventas...`));
            
            currentState.awaiting = 'ADDRESS_CHECK_IN_PROGRESS';

            if (SALES_LEADS_GROUP_ID) {
                const prospectName = 'Prospecto'; // Nombre genérico
                const notification = `*Lead de Venta para Verificar Cobertura* 📍\n\n*Nombre:* ${prospectName}\n*Número:* ${chatId.replace('@c.us', '')}\n*Posible Dirección:* "${userMessage}"\n\nPor favor, verificar y contactar al cliente.`;
                await this.client.sendMessage(SALES_LEADS_GROUP_ID, notification);
                await this.client.sendMessage(chatId, `¡Perfecto! Un asesor comercial ya recibió tu dirección y va a confirmar la disponibilidad. Te responderá por este mismo chat a la brevedad. ¡Muchas gracias! 👍`);
            } else {
                console.warn(chalk.yellow('⚠️ SALES_LEADS_GROUP_ID no está configurado en .env. No se puede notificar al equipo de ventas.'));
                await this.client.sendMessage(chatId, `¡Recibido! Estamos procesando tu consulta.`);
            }
        }
        // --- FIN DE LA MODIFICACIÓN ---

        await redisClient.set(`state:${chatId}`, currentState, STATE_TTL_SECONDS);
    }

    async handleGroupMessage(message) {
        const groupId = message.from;
        const triageGroupId = process.env.TRIAGE_GROUP_ID;
        console.log(chalk.cyan(`📥 Mensaje recibido en GRUPO [ID: ${groupId}]:`) + ` "${message.body.trim()}"`);
        if (groupId === triageGroupId) {
            await this.handleTriageGroupMessage(message);
        } else if (supportGroupPool[groupId] === 'busy') {
            await this.handleSupportChatMessage(message);
        }
    }

    async handleTriageGroupMessage(message) {
        if (!message.hasQuotedMsg) return;
        
        const triageGroupId = process.env.TRIAGE_GROUP_ID;
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
                const agentName = agentContact.pushname || agentContact.number;
                session.agentName = agentName;

                await firestoreHandler.updateTicket(session.ticketId, {
                    Agente_Asignado: agentName,
                    Estado: 'En Progreso'
                });

                await redisClient.set(`session:${session.ticketId}`, session);
                await redisClient.set(`session_client:${session.clientChatId}`, session);
                await redisClient.set(`session_group:${session.assignedGroup}`, session);


                await this.client.sendMessage(triageGroupId, `✅ El agente *${agentName}* ha tomado el caso del cliente ${session.clientName}. La conversación continúa en el grupo de chat asignado.`);
                await this.client.sendMessage(freeGroup, `*Nuevo Caso Asignado*\n\n*Cliente:* ${session.clientName}\n*Agente:* ${agentName}\n\n*Mensaje Original:* "${session.initialMessage}"\n\n*Puedes empezar a responder en este chat.*`);
                
                this.resetInactivityTimeout(session);
                this.emit('sessionsUpdate');

            } else {
                await this.client.sendMessage(triageGroupId, '🔴 No hay grupos de chat disponibles.');
            }
        }
    }

    async handleSupportChatMessage(message) {
        const session = await redisClient.get(`session_group:${message.from}`);
        if (!session) return;
    
        const messageBody = message.body.trim();
        const lowerMessageBody = messageBody.toLowerCase();
    
        if (session.pendingAppointment) {
            if (lowerMessageBody === 'si' || lowerMessageBody === 'sí') {
                const appointment = session.pendingAppointment;
                const eventDate = new Date(appointment.eventDate);
                const eventEndDate = new Date(appointment.eventEndDate);

                const result = await calendarHandler.createEvent(appointment.title, appointment.description, eventDate, eventEndDate);
                
                await this.client.sendMessage(message.from, result.message);
                if (result.success) {
                    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                    const friendlyDate = eventDate.toLocaleDateString('es-AR', options);
                    await this.client.sendMessage(session.clientChatId, `👍 ¡Buenas noticias! Te hemos agendado una visita técnica para el ${friendlyDate} hs.`);
                }
            } else {
                await this.client.sendMessage(message.from, '✅ Agendamiento cancelado.');
            }
            delete session.pendingAppointment;
            await redisClient.set(`session:${session.ticketId}`, session);
            return;
        }

        if (messageBody.startsWith('/')) {
            const command = messageBody.split(' ')[0].toLowerCase();
            if (command === '/fin') {
                await this.closeSupportSession(session, 'resuelto por el agente');
                return;
            }
            if (command === '/agendar') {
                const commandText = messageBody.substring('/agendar'.length).trim();
                const parsedDate = chrono.es.parseDate(commandText, new Date(), { forwardDate: true });
                if (!parsedDate) {
                    return this.client.sendMessage(message.from, '🔴 No pude entender la fecha y hora. Intenta de nuevo (ej: "mañana a las 10hs", "viernes 15:30").');
                }
                const eventDate = parsedDate;
                if ((lowerMessageBody.includes('tarde') || lowerMessageBody.includes('noche')) && eventDate.getHours() >= 1 && eventDate.getHours() < 12) {
                    eventDate.setHours(eventDate.getHours() + 12);
                }
                const eventEndDate = new Date(eventDate.getTime() + 60 * 60 * 1000);
                const title = `Visita Técnica - ${session.clientName}`;
                const description = `Cliente: ${session.clientName}\nCelular: ${session.clientChatId.replace('@c.us','')}\nProblema: ${commandText}`;
                session.pendingAppointment = { title, description, eventDate: eventDate.toISOString(), eventEndDate: eventEndDate.toISOString() };
                
                await redisClient.set(`session:${session.ticketId}`, session);

                const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                const friendlyDate = eventDate.toLocaleDateString('es-AR', options);
                await this.client.sendMessage(message.from, `🗓️ Estás por agendar una visita para el *${friendlyDate} hs*.\n\n¿Es correcto? Responde *si* o *no*.`);
                return;
            }
            const quickReply = await firestoreHandler.getQuickReply(command);
            if (quickReply) {
                const personalizedReply = quickReply
                    .replace(/{cliente}/g, session.clientName)
                    .replace(/{agente}/g, session.agentName || 'el agente asignado');
                await this.client.sendMessage(session.clientChatId, personalizedReply);
            } else {
                await this.client.sendMessage(message.from, `🔴 Comando "${command}" no reconocido.`);
            }
        } else {
            await this.relayToClient(session, message);
        }
    }

    async createSupportTicket(clientChatId, userMessage, clientData) {
        const clientName = clientData.nombre;
        const triageGroupId = process.env.TRIAGE_GROUP_ID;

        if (!triageGroupId) {
            console.error(chalk.red('❌ ERROR CRÍTICO: La variable TRIAGE_GROUP_ID no está configurada en el archivo .env.'));
            return this.client.sendMessage(clientChatId, 'La función de soporte no está configurada correctamente en el servidor.');
        }

        try {
            console.log(chalk.yellow(`   -> Intentando crear ticket para el grupo de triaje: ${triageGroupId}`));
            const triageChat = await this.client.getChatById(triageGroupId);
            if (!triageChat || !triageChat.isGroup) {
                throw new Error(`El ID ${triageGroupId} no corresponde a un grupo o el bot no es miembro.`);
            }

            const sentimiento = localNlpHandler.analizarSentimientoLocal(userMessage);
            console.log(chalk.cyan(`   -> Sentimiento local detectado: ${sentimiento}`));

            let notification = `*🚨 Nuevo Ticket de Soporte 🚨*\n\n*Cliente:* ${clientName}\n*Sentimiento:* ${sentimiento}\n*Mensaje:* "${userMessage}"\n\n*Para tomar este caso, responde a ESTE mensaje.*`;
            
            console.log(chalk.yellow(`   -> Enviando notificación al grupo de triaje...`));
            const ticketMsg = await this.client.sendMessage(triageGroupId, notification);
            console.log(chalk.green(`   -> Notificación enviada con éxito.`));

            const sessionData = {
                ticketId: ticketMsg.id.id,
                clientChatId,
                clientName,
                initialMessage: userMessage,
                status: 'pending',
                assignedGroup: null,
                agentId: null,
                agentName: null,
                lastActivity: Date.now()
            };
            await redisClient.set(`session:${sessionData.ticketId}`, sessionData);
            
            const ticketData = {
                Timestamp: new Date().toLocaleString('es-AR'),
                ID_Ticket: ticketMsg.id.id,
                Nombre_Cliente: clientName,
                Numero_Cliente: clientChatId.replace('@c.us', ''),
                Agente_Asignado: 'N/A',
                Mensaje_Inicial: userMessage,
                Estado: 'Pendiente',
                Sentimiento: sentimiento,
                isOpen: true 
            };
            await firestoreHandler.logTicket(ticketData);
            
            await this.client.sendMessage(clientChatId, '✅ Tu solicitud ha sido enviada. Un agente la tomará en breve.');
            this.emit('sessionsUpdate');

        } catch (error) {
            console.error(chalk.red.bold('❌ ERROR CRÍTICO al crear ticket de soporte:'));
            console.error(chalk.red(`   -> Mensaje de error: ${error.message}`));
            console.error(chalk.red(`   -> Stack trace: ${error.stack}`));
            
            await this.client.sendMessage(clientChatId, 'Lo siento, tuvimos un problema interno al crear tu solicitud de soporte.');
        }
    }

    async relayToAgent(session, clientMessage) {
        try {
            const groupChat = await this.client.getChatById(session.assignedGroup);
            if (clientMessage.hasMedia) {
                const media = await clientMessage.downloadMedia();
                await groupChat.sendMessage(media, { caption: `*Archivo adjunto de ${session.clientName}:*` });
            } else {
                await groupChat.sendMessage(`*Mensaje de ${session.clientName}:*\n${clientMessage.body}`);
            }
            this.resetInactivityTimeout(session);
        } catch (e) {
            console.error(chalk.red(`❌ FATAL: No se pudo retransmitir el mensaje al grupo ${session.assignedGroup}.`), e);
            await this.client.sendMessage(session.clientChatId, "⚠️ Hubo un problema en la comunicación con nuestro equipo.");
        }
    }

    async relayToClient(session, agentMessage) {
        try {
            const clientChat = await this.client.getChatById(session.clientChatId);
            if (agentMessage.hasMedia) {
                const media = await agentMessage.downloadMedia();
                await clientChat.sendMessage(media, { caption: agentMessage.body });
            } else {
                await this.client.sendMessage(agentMessage.body);
            }
            this.resetInactivityTimeout(session);
        } catch (e) {
            console.error(chalk.red(`❌ FATAL: No se pudo retransmitir el mensaje al cliente ${session.clientChatId}.`), e);
            await this.client.sendMessage(session.assignedGroup, `🔴 *Error:* No se pudo enviar tu mensaje al cliente.`);
        }
    }

    async closeSupportSession(session, reason) {
        await redisClient.del(`session:${session.ticketId}`);
        await redisClient.del(`session_client:${session.clientChatId}`);
        if(session.assignedGroup) {
            await redisClient.del(`session_group:${session.assignedGroup}`);
            supportGroupPool[session.assignedGroup] = 'free';
        }
        
        await firestoreHandler.updateTicket(session.ticketId, { 
            Estado: 'Cerrado',
            isOpen: false
        });

        await this.client.sendMessage(session.clientChatId, `Tu sesión de soporte ha finalizado (motivo: ${reason}). Si necesitas algo más, no dudes en escribirnos de nuevo. ¡Que tengas un buen día!`);
        
        await redisClient.del(`state:${session.clientChatId}`);
        console.log(chalk.magenta(`   -> Estado del cliente ${session.clientChatId} reseteado.`));
        
        if (session.assignedGroup) {
            await this.client.sendMessage(session.assignedGroup, `✅ La sesión con *${session.clientName}* ha sido cerrada y este grupo está libre.`);
        }
        console.log(chalk.green(`Sesión con ${session.clientName} cerrada. Razón: ${reason}.`));
        this.emit('sessionsUpdate');
    }

    resetInactivityTimeout(session) {
        if (session.timeoutId) clearTimeout(session.timeoutId);
        
        session.lastActivity = Date.now();
        redisClient.set(`session:${session.ticketId}`, session);

        session.timeoutId = setTimeout(() => {
            this.closeSupportSession(session, 'inactividad');
        }, TIMEOUT_MS);
    }
    
    async sendWelcomeMessage(chatId, clientData) {
        let responseMessage = `*¡Hola, ${clientData.nombre}!* 👋\n\n`;
        responseMessage += `Soy I-Bot, tu asistente virtual de UltraWIFI.\n\n`;
        responseMessage += `Resumen de tu cuenta:\n`;
        responseMessage += `*Estado:* ${clientData.estado}\n`;
        responseMessage += `*Deuda Total:* ${clientData.facturacion.total_facturas}\n\n`;
        if (clientData.servicios && clientData.servicios.length > 0) {
            responseMessage += `*Servicios Contratados:*\n`;
            clientData.servicios.forEach(servicio => {
                const statusEmisor = servicio.estado_emisor_texto || 'N/A';
                const statusAntena = servicio.estado_antena_texto || 'N/A';
                responseMessage += `\n  - Serv.ID_${servicio.id} - Plan: *${servicio.perfil}*\n`;
                responseMessage += `    └ _Estado Emisor:_ *${statusEmisor}* | _Tu Antena:_ *${statusAntena}*\n`;
                let analysisMessage = '';
                if (statusEmisor.includes('❌')) {
                    analysisMessage = `   └ 🔴 *Diagnóstico:* Problema detectado en nuestra red. No reinicies tus equipos.`;
                } else if (statusAntena.includes('❌')) {
                    analysisMessage = `   └ 🟡 *Diagnóstico:* Tu antena parece desconectada. Te recomendamos reiniciar tus equipos.`;
                } else if (statusEmisor.includes('✅') && statusAntena.includes('✅')) {
                    analysisMessage = `   └ 🟢 *Diagnóstico:* ¡Todo en orden!`;
                }
                responseMessage += `${analysisMessage}\n`;
            });
        }
        responseMessage += `\n\nPara solicitar *soporte técnico*, simplemente describe tu problema.`;
        this.client.sendMessage(chatId, responseMessage);
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
