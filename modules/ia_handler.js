// modules/ia_handler.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAuth } = require('google-auth-library');
const chalk = require('chalk');
const firestoreHandler = require('./firestore_handler');
const textToSpeech = require('@google-cloud/text-to-speech');

const auth = new GoogleAuth({
    keyFilename: './google-credentials.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, auth);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const ttsClient = new textToSpeech.TextToSpeechClient({ auth });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGenerativeAIWithRetry(apiCall) {
    let attempts = 0;
    const maxAttempts = 5;
    let delayTime = 8000; 

    while (attempts < maxAttempts) {
        try {
            return await apiCall();
        } catch (error) {
            attempts++;
            if (error.status === 503 && attempts < maxAttempts) {
                console.warn(chalk.yellow(`   -> API sobrecargada (intento ${attempts}/${maxAttempts}). Reintentando en ${delayTime / 1000}s...`));
                await delay(delayTime);
                delayTime *= 2;
            } else {
                console.error(chalk.red(`❌ Error final en la llamada a la API después de ${attempts} intentos:`), error);
                throw error;
            }
        }
    }
}

async function analizarComprobante(archivoBase64, mimeType, promptPersonalizado) {
    console.log(chalk.cyan(`   -> Analizando comprobante (${mimeType}) con Gemini...`));
    try {
        const apiCall = () => model.generateContent([promptPersonalizado, {
            inlineData: { data: archivoBase64, mimeType },
        }]);
        
        const result = await callGenerativeAIWithRetry(apiCall);
        const response = await result.response;
        const text = response.text();
        const jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        console.log(chalk.green('   -> Análisis de comprobante exitoso.'));
        return JSON.parse(jsonString);

    } catch (error) {
        return { error: "La IA no pudo procesar el archivo después de varios intentos." };
    }
}

async function transcribirAudio(mimeType, audioBase64) {
    console.log(chalk.cyan('   -> Transcribiendo audio con Gemini...'));
    try {
        const apiCall = () => model.generateContent(["Transcribe este audio en español:", {
            inlineData: { mimeType, data: audioBase64 },
        }]);

        const result = await callGenerativeAIWithRetry(apiCall);
        const response = await result.response;
        return response.text();
    } catch (error) {
        return "[Error en la transcripción]";
    }
}

async function sintetizarVoz(text) {
    console.log(chalk.cyan('   -> Sintetizando voz con Google TTS...'));
    try {
        const request = {
            input: { text: text },
            voice: { languageCode: 'es-US', name: 'es-US-Wavenet-A' },
            audioConfig: { audioEncoding: 'OGG_OPUS' },
        };
        const [response] = await ttsClient.synthesizeSpeech(request);
        return response.audioContent.toString('base64');
    } catch (error) {
        console.error(chalk.red('❌ Error al sintetizar voz:'), error);
        return null;
    }
}

async function buildKnowledgeBase() {
    console.log(chalk.cyan('   -> Construyendo base de conocimiento desde Firestore...'));
    
    const ventasConfigSnap = await firestoreHandler.db.collection('configuracion').doc('ventas').get();
    const ventasConfig = ventasConfigSnap.exists ? ventasConfigSnap.data() : {};

    const planesSnap = await firestoreHandler.db.collection('planes').orderBy('precioMensual').get();
    const planes = planesSnap.docs.map(doc => doc.data());

    const promosQuery = await firestoreHandler.db.collection('promociones').where('activo', '==', true).get();
    const promociones = promosQuery.docs.map(doc => doc.data());

    const faqsSnap = await firestoreHandler.db.collection('preguntasFrecuentes').get();
    const faqs = faqsSnap.docs.map(doc => doc.data());

    console.log(chalk.green('   -> Base de conocimiento construida con éxito.'));
    return { ventasConfig, planes, promociones, faqs };
}

async function handleSalesConversation(chatHistory) {
    try {
        const { ventasConfig, planes, promociones, faqs } = await buildKnowledgeBase();

        let knowledgeString = "";
        knowledgeString += `Descripción General: ${ventasConfig.descripcionGeneral || 'Somos una empresa de internet local.'}\n`;
        knowledgeString += `Costo de Instalación Estándar: $${(ventasConfig.costoInstalacion || 0).toLocaleString('es-AR')}\n\n`;

        if (planes.length > 0) {
            knowledgeString += "Planes de Internet Disponibles:\n";
            planes.forEach(plan => {
                knowledgeString += `- Nombre: ${plan.nombre}, Velocidad: ${plan.velocidadBajada} Mbps, Precio: $${(plan.precioMensual || 0).toLocaleString('es-AR')}, Ideal para: ${plan.idealPara}\n`;
            });
            knowledgeString += "\n";
        }

        if (promociones.length > 0) {
            knowledgeString += "¡Promociones Activas HOY!:\n";
            promociones.forEach(promo => {
                knowledgeString += `- ${promo.nombre}: ${promo.descripcion}\n`;
            });
            knowledgeString += "\n";
        }

        if (faqs.length > 0) {
            knowledgeString += "Preguntas Frecuentes Comunes:\n";
            faqs.forEach(faq => {
                knowledgeString += `- P: ${faq.pregunta}\n  R: ${faq.respuesta}\n`;
            });
        }
        
        const reglasConversacion = (ventasConfig.reglasConversacion || '1. Sé amable.') + 
            `\n\n**REGLAS DE CIERRE (MUY IMPORTANTE):**` +
            `\n\n**ESCENARIO 1: El cliente da su dirección.**` +
            `\nSi el último MENSAJE DEL USUARIO contiene una dirección (calle, barrio, etc.), tu respuesta debe confirmar la cobertura, presentar la oferta, terminar con una pregunta de confirmación (ej: '¿Quieres que un asesor se ponga en contacto?') Y añadir la frase secreta: [DIRECCION_DETECTADA].` +
            `\n\n**ESCENARIO 2: El cliente quiere contratar directamente.**` +
            `\nSi el cliente NO ha dado una dirección, pero expresa un deseo claro de contratar o hablar con un asesor (ej: "quiero contratar", "cómo hago?", "pasame con un vendedor", "metele pata"), tu respuesta debe ser ÚNICAMENTE la pregunta de confirmación (ej: 'Perfecto. ¿Quieres que un asesor comercial se ponga en contacto contigo para darte todos los detalles y finalizar la contratación?') Y añadir la frase secreta: [CIERRE_DIRECTO].`;

        const systemPrompt = `${ventasConfig.mensajeBienvenida || 'Eres I-Bot, un asistente de ventas.'}
        
        **Base de Conocimiento (ÚNICA fuente de verdad):**
        ---
        ${knowledgeString}
        ---

        **Reglas de Conversación (INQUEBRABLES):**
        ${reglasConversacion}
        `;
        
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: "¡Entendido! Estoy listo para asistir al cliente con la información y reglas proporcionadas, incluyendo la detección de direcciones y la intención de cierre directo." }] },
                ...chatHistory.slice(0, -1)
            ]
        });

        const lastUserMessage = chatHistory[chatHistory.length - 1].parts[0].text;
        
        const apiCall = () => chat.sendMessage(lastUserMessage);
        const result = await callGenerativeAIWithRetry(apiCall);

        const response = await result.response;
        return response.text().trim();

    } catch (error) {
        return "Lo siento, tuve un problema procesando tu consulta. Un asesor humano la revisará a la brevedad.";
    }
}

async function analizarConfirmacion(userMessage) {
    const prompt = `Eres un experto analista de intenciones con especialización en el dialecto español rioplatense (Argentina). Un cliente está respondiendo a la pregunta "¿Deseas contratar el servicio?". Analiza su mensaje y determina si la intención es afirmativa.
    
    RESPONDE ÚNICAMENTE CON "SI" O "NO".

    Considera como afirmativas respuestas como:
    - "si dale"
    - "si metele"
    - "metele pata"
    - "de una"
    - "joya"
    - "si por favor"
    - "claro"
    - "obvio"
    - "si quiero"

    Mensaje del cliente: "${userMessage}"`;
    try {
        const apiCall = () => model.generateContent(prompt);
        const result = await callGenerativeAIWithRetry(apiCall);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();
        
        return text === 'SI' ? 'SI' : 'NO';
    } catch (error) {
        return 'NO';
    }
}

async function analizarIntencionGeneral(userMessage) {
    const configResult = await firestoreHandler.getSoporteConfig();
    if (!configResult.success) {
        console.error(chalk.red('❌ Error crítico: No se pudo cargar la configuración de soporte para analizar intención. Escalando a pregunta general.'));
        return 'pregunta_general'; // Valor por defecto seguro
    }

    try {
        const promptTemplate = configResult.data.promptIntencionGeneral;
        const prompt = promptTemplate.replace('{userMessage}', userMessage);

        const apiCall = () => model.generateContent(prompt);
        const result = await callGenerativeAIWithRetry(apiCall);
        const response = await result.response;
        const text = response.text().trim().toLowerCase();

        return ['soporte', 'ventas'].includes(text) ? text : 'pregunta_general';
    } catch (error) {
        return 'pregunta_general';
    }
}

async function analizarSentimiento(userMessage) {
    const configResult = await firestoreHandler.getSoporteConfig();
    if (!configResult.success) {
        console.error(chalk.red('❌ Error crítico: No se pudo cargar la configuración de soporte para analizar sentimiento. Usando "neutro".'));
        return 'neutro'; // Valor por defecto seguro
    }

    try {
        const promptTemplate = configResult.data.promptAnalisisSentimiento;
        const prompt = promptTemplate.replace('{userMessage}', userMessage);
        
        const apiCall = () => model.generateContent(prompt);
        const result = await callGenerativeAIWithRetry(apiCall);
        const response = await result.response;
        const text = response.text().trim().toLowerCase();
        
        return ['enojado', 'frustrado', 'contento'].includes(text) ? text : 'neutro';
    } catch (error) {
        return 'neutro';
    }
}

async function answerSupportQuestion(chatHistory) {
    // --- INICIO DE MODIFICACIÓN ---
    // 1. Cargar la configuración y verificar si es exitosa.
    const configResult = await firestoreHandler.getSoporteConfig();
    if (!configResult.success) {
        console.error(chalk.red('❌ Error crítico: No se pudo cargar la configuración de soporte desde Firestore. Escalando a ticket.'));
        return '[ESCALATE_TICKET]'; // Devuelve la señal de control para crear un ticket.
    }
    const config = configResult.data;
    // --- FIN DE MODIFICACIÓN ---

    try {
        console.log(chalk.cyan('   -> Buscando respuesta en FAQs de Soporte con historial...'));
        const supportFaqs = await firestoreHandler.getSupportFaqs();

        if (supportFaqs.length === 0) {
            return "[ESCALATE_TICKET]";
        }

        let knowledgeString = "Preguntas Frecuentes de Soporte:\n";
        supportFaqs.forEach(faq => {
            knowledgeString += `- P: ${faq.pregunta}\n  R: ${faq.respuesta}\n`;
        });

        const userMessage = chatHistory[chatHistory.length - 1].parts[0].text;
        const modelHistory = chatHistory.slice(0, -1);
        
        // --- INICIO DE MODIFICACIÓN ---
        // 2. Ensamblar el prompt final usando la configuración estructurada.
        const finalSystemPrompt = `${config.personalidad}

**Tu Proceso de Diagnóstico (Seguí estos pasos en orden):**
${config.instruccionesDiagnostico}

**Base de Conocimiento (ÚNICA fuente de verdad):**
---
${knowledgeString}
---

**Historial de la Conversación (para entender el contexto):**
---
${JSON.stringify(modelHistory)}
---

**Pregunta del Cliente:**
${userMessage}
`;
        // --- FIN DE MODIFICACIÓN ---

        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: "Contexto del sistema cargado." }] },
                { role: 'model', parts: [{ text: "Entendido." }] },
                ...modelHistory
            ]
        });

        const apiCall = () => chat.sendMessage(finalSystemPrompt);
        const result = await callGenerativeAIWithRetry(apiCall);
        const response = await result.response;
        return response.text().trim();

    } catch (error) {
        return "Tuvimos un problema al procesar tu consulta. Un agente la revisará a la brevedad.";
    }
}

module.exports = {
    handleSalesConversation,
    analizarConfirmacion,
    analizarIntencionGeneral,
    analizarSentimiento,
    answerSupportQuestion,
    transcribirAudio,
    sintetizarVoz,
    analizarComprobante,
};
