// modules/calendar_handler.js
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const chalk = require('chalk');

const creds = require('../google-credentials.json');
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

const jwtClient = new JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    // El scope 'https://www.googleapis.com/auth/calendar' ya permite leer y escribir.
    scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth: jwtClient });

/**
 * Crea un evento en el Google Calendar configurado.
 * @param {string} title - El título del evento.
 * @param {string} description - La descripción del evento.
 * @param {Date} startTime - El objeto Date de inicio del evento.
 * @param {Date} endTime - El objeto Date de fin del evento.
 * @returns {Promise<object>} Un objeto indicando el éxito o fracaso.
 */
async function createEvent(title, description, startTime, endTime) {
    if (!CALENDAR_ID) {
        console.error(chalk.red('❌ GOOGLE_CALENDAR_ID no está configurado en .env'));
        return { success: false, message: 'La función de calendario no está configurada.' };
    }

    try {
        const event = {
            summary: title,
            description: description,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'America/Argentina/Buenos_Aires',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'America/Argentina/Buenos_Aires',
            },
        };

        const response = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
        });

        if (response.status === 200) {
            console.log(chalk.green(`✅ Evento creado en Google Calendar: "${title}"`));
            return { success: true, message: 'Evento agendado con éxito.' };
        } else {
            throw new Error(`Google Calendar API respondió con status ${response.status}`);
        }
    } catch (error) {
        console.error(chalk.red('❌ Error al crear evento en Google Calendar:'), error.message);
        return { success: false, message: 'No se pudo agendar la visita en el calendario.' };
    }
}

// --- INICIO DE LA MODIFICACIÓN ---
/**
 * Obtiene los eventos del mes actual desde Google Calendar.
 * @returns {Promise<object>} Un objeto con la lista de eventos o un mensaje de error.
 */
async function getEvents() {
    if (!CALENDAR_ID) {
        console.error(chalk.red('❌ GOOGLE_CALENDAR_ID no está configurado en .env'));
        return { success: false, message: 'La función de calendario no está configurada.' };
    }

    try {
        const now = new Date();
        // Primer día del mes actual a las 00:00
        const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        // Último día del mes actual a las 23:59:59
        const timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        console.log(chalk.yellow('🗓️  Solicitando eventos del calendario a Google...'));

        const response = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items;
        if (events && events.length) {
            // Mapeamos los eventos a un formato más simple para el frontend.
            const formattedEvents = events.map(event => ({
                title: event.summary,
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date,
                description: event.description || ''
            }));
            console.log(chalk.green(`✅ Se obtuvieron ${formattedEvents.length} eventos del calendario.`));
            return { success: true, data: formattedEvents };
        } else {
            console.log(chalk.yellow('🟡 No se encontraron eventos para el mes actual.'));
            return { success: true, data: [] };
        }
    } catch (error) {
        console.error(chalk.red('❌ Error al obtener eventos de Google Calendar:'), error.message);
        return { success: false, message: 'No se pudieron obtener los eventos del calendario.' };
    }
}
// --- FIN DE LA MODIFICACIÓN ---


module.exports = {
    createEvent,
    getEvents, // Exportamos la nueva función
};
