// modules/sheet_handler.js
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const chalk = require('chalk');

const creds = require('../google-credentials.json'); 
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, new JWT({
  email: creds.client_email,
  key: creds.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
}));

let quickReplies = new Map();
let knowledgeBase = [];

async function initializeSheet() {
  try {
    await doc.loadInfo();
    console.log(chalk.green(`✅ Conectado a la hoja de cálculo: "${doc.title}"`));
    
    const quickRepliesSheet = doc.sheetsByTitle['Respuestas_Rapidas'];
    if (quickRepliesSheet) {
        const rows = await quickRepliesSheet.getRows();
        quickReplies.clear();
        rows.forEach(row => {
            const atajo = row.get('Atajo');
            const mensaje = row.get('Mensaje_Completo');
            if (atajo && mensaje) quickReplies.set(atajo.toLowerCase(), mensaje);
        });
        console.log(chalk.green(`✅ ${quickReplies.size} respuestas rápidas cargadas.`));
    } else {
        console.warn(chalk.yellow("⚠️ Pestaña 'Respuestas_Rapidas' no encontrada."));
    }

    const knowledgeSheet = doc.sheetsByTitle['Conocimiento_IA'];
    if (knowledgeSheet) {
        const rows = await knowledgeSheet.getRows();
        knowledgeBase = rows.map(row => ({
            tipo: row.get('Tipo'),
            pregunta: row.get('Pregunta_Clave'),
            respuesta: row.get('Respuesta_Oficial')
        })).filter(item => item.tipo && item.pregunta && item.respuesta);
        console.log(chalk.green(`✅ ${knowledgeBase.length} entradas de conocimiento para IA cargadas.`));
    } else {
        console.warn(chalk.yellow("⚠️ Pestaña 'Conocimiento_IA' no encontrada. La IA no tendrá contexto."));
    }

  } catch (error) {
    console.error(chalk.red('❌ Error crítico al conectar con Google Sheets:'), error.message);
    process.exit(1); 
  }
}

async function logTicket(ticketData) {
  try {
    const sheet = doc.sheetsByTitle['Registro_Tickets'];
    if (!sheet) throw new Error("La pestaña 'Registro_Tickets' no fue encontrada.");
    await sheet.addRow(ticketData);
    console.log(chalk.blue(`📝 Ticket ${ticketData.ID_Ticket} registrado en Google Sheets.`));
  } catch (error) {
    console.error(chalk.red('❌ Error al registrar ticket en Google Sheets:'), error.message);
  }
}

async function updateTicket(ticketId, updateData) {
    try {
        const sheet = doc.sheetsByTitle['Registro_Tickets'];
        if (!sheet) throw new Error("La pestaña 'Registro_Tickets' no fue encontrada.");
        const rows = await sheet.getRows();
        const rowToUpdate = rows.find(row => row.get('ID_Ticket') === ticketId);
        if (rowToUpdate) {
            for (const key in updateData) {
                if (rowToUpdate.get(key) !== undefined) rowToUpdate.set(key, updateData[key]);
            }
            await rowToUpdate.save();
            console.log(chalk.blue(`📝 Ticket ${ticketId} actualizado en Google Sheets.`));
        } else {
            console.warn(chalk.yellow(`⚠️ No se encontró el ticket ${ticketId} para actualizar en la hoja.`));
        }
    } catch (error) {
        console.error(chalk.red('❌ Error al actualizar ticket en Google Sheets:'), error.message);
    }
}

async function getAllTickets() {
    try {
        const sheet = doc.sheetsByTitle['Registro_Tickets'];
        if (!sheet) throw new Error("La pestaña 'Registro_Tickets' no fue encontrada.");
        
        const rows = await sheet.getRows();
        const tickets = rows.map(row => {
            const rowData = {};
            sheet.headerValues.forEach(header => {
                rowData[header] = row.get(header);
            });
            return rowData;
        }).reverse();
        
        return { success: true, data: tickets };
    } catch (error) {
        console.error(chalk.red('❌ Error al obtener todos los tickets:'), error.message);
        return { success: false, message: 'No se pudo obtener el historial de tickets.' };
    }
}

async function countOpenTickets() {
    try {
        const sheet = doc.sheetsByTitle['Registro_Tickets'];
        if (!sheet) return 0;
        
        const rows = await sheet.getRows();
        const openTickets = rows.filter(row => {
            const estado = row.get('Estado');
            return estado && estado.toLowerCase() !== 'cerrado';
        });
        
        return openTickets.length;
    } catch (error) {
        console.error(chalk.red('❌ Error al contar tickets abiertos:'), error.message);
        return 0;
    }
}

/**
 * Cuenta los clientes únicos que han sido atendidos.
 * @returns {Promise<number>} El número de clientes únicos.
 */
async function countUniqueClients() {
    try {
        const sheet = doc.sheetsByTitle['Registro_Tickets'];
        if (!sheet) return 0;
        
        const rows = await sheet.getRows();
        const clientNames = rows.map(row => row.get('Nombre_Cliente')).filter(name => name);
        
        const uniqueClients = new Set(clientNames);
        
        return uniqueClients.size;
    } catch (error) {
        console.error(chalk.red('❌ Error al contar clientes únicos:'), error.message);
        return 0;
    }
}

async function getKnowledgeData() {
    try {
        const knowledgeSheet = doc.sheetsByTitle['Conocimiento_IA'];
        const quickRepliesSheet = doc.sheetsByTitle['Respuestas_Rapidas'];
        let knowledgeData = [];
        let quickRepliesData = [];

        if (knowledgeSheet) {
            const rows = await knowledgeSheet.getRows();
            knowledgeData = rows.map(row => ({
                Tipo: row.get('Tipo'),
                Pregunta_Clave: row.get('Pregunta_Clave'),
                Respuesta_Oficial: row.get('Respuesta_Oficial')
            }));
        }

        if (quickRepliesSheet) {
            const rows = await quickRepliesSheet.getRows();
            quickRepliesData = rows.map(row => ({
                Atajo: row.get('Atajo'),
                Mensaje_Completo: row.get('Mensaje_Completo')
            }));
        }
        
        return { success: true, data: { knowledge: knowledgeData, quickReplies: quickRepliesData } };
    } catch (error) {
        console.error(chalk.red('❌ Error al obtener datos de conocimiento:'), error.message);
        return { success: false, message: 'No se pudo obtener la base de conocimiento.' };
    }
}

function getQuickReply(atajo) {
    return quickReplies.get(atajo.toLowerCase()) || null;
}

function getKnowledgeBase(tipo) {
    return knowledgeBase
        .filter(item => item.tipo.toLowerCase() === tipo.toLowerCase())
        .map(item => `- Pregunta: ${item.pregunta}\n- Respuesta: ${item.respuesta}`)
        .join('\n\n');
}

module.exports = {
  initializeSheet,
  logTicket,
  updateTicket,
  getQuickReply,
  getKnowledgeBase,
  getAllTickets,
  getKnowledgeData,
  countOpenTickets,
  countUniqueClients, // <-- Exportamos la nueva función
};

