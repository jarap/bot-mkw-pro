// modules/ia_handler.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAuth } = require('google-auth-library');
const chalk = require('chalk');
const firestoreHandler = require('./firestore_handler'); // Modificado para llamar al módulo completo

const auth = new GoogleAuth({
    keyFilename: './firebase-credentials.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, auth);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function buildKnowledgeBase() {
    console.log(chalk.cyan('   -> Construyendo base de conocimiento desde Firestore...'));
    
    // Usamos el handler importado para acceder a las funciones
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
        const result = await chat.sendMessage(lastUserMessage);
        const response = await result.response;
        return response.text().trim();

    } catch (error) {
        console.error(chalk.red('❌ Error en handleSalesConversation con Gemini:'), error);
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
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();
        
        if (text === 'SI') {
            return 'SI';
        }
        return 'NO';
    } catch (error) {
        console.error(chalk.red('❌ Error al analizar confirmación con Gemini:'), error);
        return 'NO';
    }
}

// --- INICIO DE MODIFICACIÓN ---
async function analizarIntencionGeneral(userMessage) {
    try {
        const configResult = await firestoreHandler.getSoporteConfig();
        const promptTemplate = configResult.data.promptIntencionGeneral;
        const prompt = promptTemplate.replace('{userMessage}', userMessage);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toLowerCase();

        if (['soporte', 'ventas'].includes(text)) {
            return text;
        }
        return 'pregunta_general';
    } catch (error) {
        console.error(chalk.red('❌ Error al analizar intención general con Gemini:'), error);
        return 'pregunta_general';
    }
}

async function analizarSentimiento(userMessage) {
    try {
        const configResult = await firestoreHandler.getSoporteConfig();
        const promptTemplate = configResult.data.promptAnalisisSentimiento;
        const prompt = promptTemplate.replace('{userMessage}', userMessage);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toLowerCase();
        if (['enojado', 'frustrado', 'contento'].includes(text)) {
            return text;
        }
        return 'neutro';
    } catch (error) {
        console.error(chalk.red('❌ Error al analizar sentimiento con Gemini:'), error);
        return 'neutro';
    }
}

async function answerSupportQuestion(chatHistory) {
    try {
        console.log(chalk.cyan('   -> Buscando respuesta en FAQs de Soporte con historial...'));
        const supportFaqs = await firestoreHandler.getSupportFaqs();

        if (supportFaqs.length === 0) {
            console.log(chalk.yellow('   -> No se encontraron FAQs de soporte en la base de datos.'));
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

        // Reemplazamos los placeholders en el prompt con la información real
        systemPrompt = systemPrompt
            .replace('{knowledgeString}', knowledgeString)
            .replace('{chatHistory}', JSON.stringify(modelHistory))
            .replace('{userMessage}', userMessage);

        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: "Contexto del sistema cargado." }] },
                { role: 'model', parts: [{ text: "Entendido. Estoy listo para asistir al cliente con memoria conversacional, siguiendo las reglas de personalidad y flujo de trabajo para no repetirme." }] },
                ...modelHistory
            ]
        });

        // Enviamos el prompt completo como el primer mensaje del usuario en esta interacción
        const result = await chat.sendMessage(systemPrompt);
        const response = await result.response;
        return response.text().trim();

    } catch (error) {
        console.error(chalk.red('❌ Error en answerSupportQuestion con Gemini:'), error);
        return "Tuvimos un problema al procesar tu consulta. Un agente la revisará a la brevedad.";
    }
}
// --- FIN DE MODIFICACIÓN ---

module.exports = {
    handleSalesConversation,
    analizarConfirmacion,
    analizarIntencionGeneral,
    analizarSentimiento,
    answerSupportQuestion,
};
