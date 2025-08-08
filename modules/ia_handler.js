// modules/ia_handler.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAuth } = require('google-auth-library');
const chalk = require('chalk');
const { db } = require('./firestore_handler');

const auth = new GoogleAuth({
    keyFilename: './firebase-credentials.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, auth);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function buildKnowledgeBase() {
    console.log(chalk.cyan('   -> Construyendo base de conocimiento desde Firestore...'));
    
    const ventasConfigSnap = await db.collection('configuracion').doc('ventas').get();
    const ventasConfig = ventasConfigSnap.exists ? ventasConfigSnap.data() : {};

    const planesSnap = await db.collection('planes').orderBy('precioMensual').get();
    const planes = planesSnap.docs.map(doc => doc.data());

    const promosQuery = db.collection('promociones').where('activo', '==', true);
    const promosSnap = await promosQuery.get();
    const promociones = promosSnap.docs.map(doc => doc.data());

    const faqsSnap = await db.collection('preguntasFrecuentes').get();
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

        // --- INICIO DE LA MODIFICACIÓN ---
        // Se añade la nueva regla para la detección de dirección.
        const reglasConversacion = (ventasConfig.reglasConversacion || '1. Sé amable.') + 
            `\n**REGLA CRÍTICA:** Cuando consideres que el usuario ha proporcionado una dirección lo suficientemente clara como para verificar la cobertura (calle y número, barrio, etc.), tu respuesta DEBE terminar obligatoriamente con la frase secreta: [DIRECCION_DETECTADA]`;
        // --- FIN DE LA MODIFICACIÓN ---

        const systemPrompt = `${ventasConfig.mensajeBienvenida || 'Eres I-Bot, un asistente de ventas.'}
        
        **Base de Conocimiento (ÚNICA fuente de verdad):**
        ---
        ${knowledgeString}
        ---

        **Reglas de Conversación (INQUEBRANTABLES):**
        ${reglasConversacion}
        `;
        
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: "¡Entendido! Estoy listo para asistir al cliente con la información y reglas proporcionadas, incluyendo la detección de direcciones." }] },
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

async function analizarSentimiento(userMessage) {
    const prompt = `Analiza el sentimiento del siguiente mensaje de un cliente a su proveedor de internet. Responde únicamente con una de estas cuatro palabras: "enojado", "frustrado", "neutro", "contento". Mensaje: "${userMessage}"`;
    try {
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

module.exports = {
    handleSalesConversation,
    analizarSentimiento,
};
