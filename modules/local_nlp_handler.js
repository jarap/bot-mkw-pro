// modules/local_nlp_handler.js
// Este módulo maneja el procesamiento de lenguaje natural de forma local,
// sin depender de APIs externas, para tareas simples y rápidas como
// clasificación de intención y análisis de sentimiento.

const chalk = require('chalk');

// --- PALABRAS CLAVE PARA CLASIFICACIÓN (REFINADAS Y AMPLIADAS) ---

const KEYWORDS_VENTAS = ['precio', 'plan', 'costo', 'cobertura', 'contratar', 'servicio nuevo', 'velocidad', 'megas', 'instalan', 'conectan', 'ofrecen', 'informacion', 'colocan', 'ponen', 'dan', 'tienen'];
const KEYWORDS_SOPORTE = ['no funciona', 'lento', 'corte', 'sin internet', 'problema', 'falla', 'reclamo', 'no anda', 'servicio técnico', 'visita'];

const KEYWORDS_ENOJADO = ['mierda', 'puta', 'carajo', 'desastre', 'verguenza', 'odio', 'basura', 'nunca anda'];
const KEYWORDS_FRUSTRADO = ['lento', 'corta', 'no puedo', 'ayuda por favor', 'solucion', 'necesito'];
const KEYWORDS_CONTENTO = ['gracias', 'excelente', 'solucionado', 'genial', 'perfecto', 'muy bien'];


/**
 * Clasifica la intención de un mensaje basado en palabras clave.
 * @param {string} userMessage - El mensaje del usuario.
 * @returns {string} 'ventas', 'soporte', o 'desconocido'.
 */
function clasificarIntencionLocal(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Damos prioridad a las palabras de soporte. Si hay una, es soporte.
    if (KEYWORDS_SOPORTE.some(kw => message.includes(kw))) {
        console.log(chalk.cyan('   -> Intención local detectada: soporte'));
        return 'soporte';
    }
    // Si no es soporte, verificamos si es ventas.
    if (KEYWORDS_VENTAS.some(kw => message.includes(kw))) {
        console.log(chalk.cyan('   -> Intención local detectada: ventas'));
        return 'ventas';
    }
    
    // Si no coincide con ninguna, lo marcamos como desconocido.
    console.log(chalk.cyan('   -> Intención local detectada: desconocido'));
    return 'desconocido';
}

/**
 * Analiza el sentimiento de un mensaje basado en palabras clave.
 * @param {string} userMessage - El mensaje del usuario.
 * @returns {string} 'enojado', 'frustrado', 'contento', o 'neutro'.
 */
function analizarSentimientoLocal(userMessage) {
    const message = userMessage.toLowerCase();

    if (KEYWORDS_ENOJADO.some(kw => message.includes(kw))) {
        return 'enojado';
    }
    if (KEYWORDS_FRUSTRADO.some(kw => message.includes(kw))) {
        return 'frustrado';
    }
    if (KEYWORDS_CONTENTO.some(kw => message.includes(kw))) {
        return 'contento';
    }

    return 'neutro';
}

module.exports = {
    clasificarIntencionLocal,
    analizarSentimientoLocal,
};
