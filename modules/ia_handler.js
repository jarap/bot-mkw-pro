// modules/ia_handler.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAuth } = require('google-auth-library');
const chalk = require('chalk');
const { db } = require('./firestore_handler'); // Importamos db directamente

const auth = new GoogleAuth({
    keyFilename: './firebase-credentials.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, auth);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Construye dinámicamente la base de conocimiento a partir de las nuevas colecciones en Firestore.
 * @returns {Promise<string>} Un string formateado con toda la información para la IA.
 */
async function buildKnowledgeBase() {
    let knowledgeBase = '';

    // 1. Obtener Configuraciones Generales (Estos son documentos dentro de 'knowledge')
    const configSnap = await db.collection('knowledge').doc('configuracionGeneral').get();
    if (configSnap.exists) {
        const configData = configSnap.data();
        knowledgeBase += `Descripción General: ${configData.descripcionGeneral || 'No disponible.'}\n`;
        knowledgeBase += `Costo de Instalación Estándar: $${(configData.costoInstalacion || 0).toLocaleString('es-AR')}\n`;
        knowledgeBase += `Información Adicional: ${configData.infoAdicional || ''}\n\n`;
    }

    // 2. Obtener Planes de Internet (CORRECCIÓN: Se llama desde la raíz)
    const planesSnap = await db.collection('planes').orderBy('precioMensual').get();
    if (!planesSnap.empty) {
        knowledgeBase += "Planes de Internet Disponibles:\n";
        planesSnap.forEach(doc => {
            const plan = doc.data();
            knowledgeBase += `- Nombre: ${plan.nombre}, Velocidad: ${plan.velocidadBajada} Mbps, Precio: $${(plan.precioMensual || 0).toLocaleString('es-AR')}, Ideal para: ${plan.idealPara}\n`;
        });
        knowledgeBase += "\n";
    }

    // 3. Obtener Promociones Activas (CORRECCIÓN: Se llama desde la raíz)
    const now = new Date();
    const today = now.getDay(); // 0=Domingo, 1=Lunes, ...
    const promosQuery = db.collection('promociones').where('activo', '==', true);
    const promosSnap = await promosQuery.get();
    
    if (!promosSnap.empty) {
        const activePromos = [];
        promosSnap.forEach(doc => {
            const promo = doc.data();
            let isValid = true;

            if (promo.fechaInicio && promo.fechaInicio.toDate() > now) isValid = false;
            if (promo.fechaFin && promo.fechaFin.toDate() < now) isValid = false;
            if (promo.diasDeLaSemana && promo.diasDeLaSemana.length > 0 && !promo.diasDeLaSemana.includes(today)) isValid = false;

            if (isValid) {
                activePromos.push(`- ${promo.nombre}: ${promo.descripcion}`);
            }
        });

        if (activePromos.length > 0) {
            knowledgeBase += "¡Promociones Activas HOY!:\n";
            knowledgeBase += activePromos.join('\n') + "\n\n";
        }
    }

    // 4. Obtener Preguntas Frecuentes (CORRECCIÓN: Se llama desde la raíz)
    const faqsSnap = await db.collection('preguntasFrecuentes').get();
    if (!faqsSnap.empty) {
        knowledgeBase += "Preguntas Frecuentes Comunes:\n";
        faqsSnap.forEach(doc => {
            const faq = doc.data();
            knowledgeBase += `- P: ${faq.pregunta}\n  R: ${faq.respuesta}\n`;
        });
    }

    return knowledgeBase;
}


async function handleSalesConversation(chatHistory) {
    try {
        const knowledgeBase = await buildKnowledgeBase();

        if (!knowledgeBase) {
            console.error(chalk.red('❌ La base de conocimiento está vacía. Revisa la estructura en Firestore.'));
            return "Lo siento, no tengo información disponible en este momento. Un asesor se pondrá en contacto contigo.";
        }

        const systemPrompt = `Eres I-Bot, el asistente de ventas virtual de UltraWIFI en San Rafael, Mendoza. Tu personalidad es la de un vecino experto en tecnología: amigable, servicial y usas un lenguaje coloquial argentino (tuteo). Tu misión es entender las necesidades del cliente, explicarle por qué nuestro servicio es la mejor opción y guiarlo para verificar si tenemos cobertura.

        **Base de Conocimiento (ÚNICA fuente de verdad):**
        ---
        ${knowledgeBase}
        ---

        **Reglas de Conversación (INQUEBRANTABLES):**
        1.  **Sé Proactivo con las Promos:** Si hay una sección de "Promociones Activas", ¡menciónala! Es tu mejor herramienta de venta. Por ejemplo, si preguntan por el costo de instalación, responde el precio estándar y añade la promoción si existe.
        2.  **Guía hacia la Cobertura:** Tu objetivo principal es que el cliente te dé su dirección para verificar la cobertura. Después de responder cualquier pregunta, intenta llevar la conversación a ese punto.
        3.  **No Inventes:** Si no sabes algo, derívalo a un humano diciendo: "Esa es una muy buena pregunta. Para darte el dato exacto, prefiero que te contacte uno de los chicos del equipo comercial. ¿Te parece bien si le paso tu número?".
        4.  **Tono y Personalidad:** Usa emojis (👋, 😊, ✅, 🚀, 🤔, 📍) y un tono cercano.`;
        
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: "¡Entendido! Estoy listo para asistir al cliente como un vendedor experto de UltraWIFI." }] },
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
