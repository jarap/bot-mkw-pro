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

module.exports = {
    createEvent,
};
