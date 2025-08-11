// modules/calendar_handler.js
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const chalk = require('chalk');

const creds = require('../google-credentials.json');
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

const jwtClient = new JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth: jwtClient });

async function createEvent(title, description, startTime, endTime) {
    if (!CALENDAR_ID) {
        console.error(chalk.red('❌ GOOGLE_CALENDAR_ID no está configurado en .env'));
        return { success: false, message: 'La función de calendario no está configurada.' };
    }
    try {
        const event = {
            summary: title,
            description: description,
            start: { dateTime: startTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
            end: { dateTime: endTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
        };
        const response = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
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

async function getEvents() {
    if (!CALENDAR_ID) return { success: false, message: 'Función de calendario no configurada.' };
    try {
        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const timeMax = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        const response = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = response.data.items.map(event => ({
            title: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            description: event.description || ''
        }));
        return { success: true, data: events };
    } catch (error) {
        console.error(chalk.red('❌ Error al obtener eventos de Google Calendar:'), error.message);
        return { success: false, message: 'No se pudieron obtener los eventos.' };
    }
}

// --- INICIO DE MODIFICACIÓN: Nueva función para contar eventos ---
/**
 * Cuenta los eventos en Google Calendar desde hoy hasta un número específico de días en el futuro.
 * @param {number} days - El número de días hacia el futuro para contar eventos.
 * @returns {Promise<object>} Un objeto con el conteo de eventos o un mensaje de error.
 */
async function countUpcomingEvents(days = 15) {
    if (!CALENDAR_ID) {
        return { success: false, message: 'La función de calendario no está configurada.' };
    }
    try {
        const now = new Date();
        const timeMin = new Date();
        timeMin.setHours(0, 0, 0, 0); // Desde el inicio del día de hoy

        const timeMax = new Date(timeMin);
        timeMax.setDate(timeMin.getDate() + days); // Hasta el final del último día del rango

        const response = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
        });

        const count = response.data.items ? response.data.items.length : 0;
        console.log(chalk.blue(`🗓️  Se encontraron ${count} eventos para los próximos ${days} días.`));
        return { success: true, data: { count } };
    } catch (error) {
        console.error(chalk.red(`❌ Error al contar eventos para ${days} días:`), error.message);
        return { success: false, message: 'No se pudo obtener el conteo de eventos.' };
    }
}
// --- FIN DE MODIFICACIÓN ---

module.exports = {
    createEvent,
    getEvents,
    countUpcomingEvents, // Exportamos la nueva función
};
