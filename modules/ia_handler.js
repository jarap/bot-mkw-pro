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

// --- INICIO DE NUEVA FUNCIONALIDAD: GESTIÓN DE REINTENTOS ---

/**
 * Función auxiliar para introducir una pausa.
 * @param {number} ms - Milisegundos a esperar.
 * @returns {Promise}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Llama a la API de Gemini con una estrategia de reintentos con espera exponencial.
 * @param {Function} apiCall - La función asíncrona que realiza la llamada a la API.
 * @returns {Promise<any>} El resultado de la llamada a la API.
 * @throws {Error} Si la llamada falla después de todos los reintentos.
 */
async function callGenerativeAIWithRetry(apiCall) {
    let attempts = 0;
    const maxAttempts = 5;
    let delayTime = 8000; // Empezar con 2 segundos

    while (attempts < maxAttempts) {
        try {
            return await apiCall(); // Intenta hacer la llamada
        } catch (error) {
            attempts++;
            // Si el error es por sobrecarga (503) y aún tenemos intentos, esperamos y reintentamos.
            if (error.status === 503 && attempts < maxAttempts) {
                console.warn(chalk.yellow(`   -> API sobrecargada (intento ${attempts}/${maxAttempts}). Reintentando en ${delayTime / 1000}s...`));
                await delay(delayTime);
                delayTime *= 2; // Duplica el tiempo de espera para el siguiente intento
            } else {
                // Si es otro tipo de error o se acabaron los intentos, lanzamos el error.
                console.error(chalk.red(`❌ Error final en la llamada a la API después de ${attempts} intentos:`), error);
                throw error; // Lanza el error para que la función que llamó lo maneje
            }
        }
    }
}

// --- FIN DE NUEVA FUNCIONALIDAD ---


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

// (El resto de las funciones que usan la IA también se modificarían para usar callGenerativeAIWithRetry)
// Por brevedad, se muestra solo la modificación principal en analizarComprobante y transcribirAudio.

// ... (resto del archivo sin cambios) ...

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
    try {
        const configResult = await firestoreHandler.getSoporteConfig();
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
    try {
        const configResult = await firestoreHandler.getSoporteConfig();
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
    try {
        console.log(chalk.cyan('   -> Buscando respuesta en FAQs de Soporte con historial...'));
        const supportFaqs = await firestoreHandler.getSupportFaqs();

        if (supportFaqs.length === 0) {
            return "[NO_ANSWER]";
        }

        let knowledgeString = "Preguntas Frecuentes de Soporte:\n";
        supportFaqs.forEach(faq => {
            knowledgeString += `- P: ${faq.pregunta}\n  R: ${faq.respuesta}\n`;
        });

        const userMessage = chatHistory[chatHistory.length - 1].parts[0].text;
        const modelHistory = chatHistory.slice(0, -1);
        
        const configResult = await firestoreHandler.getSoporteConfig();
        let systemPrompt = configResult.data.promptRespuestaSoporte;

        systemPrompt = systemPrompt
            .replace('{knowledgeString}', knowledgeString)
            .replace('{chatHistory}', JSON.stringify(modelHistory))
            .replace('{userMessage}', userMessage);

        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: "Contexto del sistema cargado." }] },
                { role: 'model', parts: [{ text: "Entendido." }] },
                ...modelHistory
            ]
        });

        const apiCall = () => chat.sendMessage(systemPrompt);
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
