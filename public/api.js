// public/api.js
// Módulo para gestionar todas las llamadas a la API del servidor.

/**
 * Realiza una petición fetch y maneja la respuesta.
 * @param {string} url - La URL del endpoint.
 * @param {object} [options={}] - Opciones para la petición fetch (método, headers, body).
 * @returns {Promise<any>} Los datos de la respuesta en formato JSON.
 */
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.message || `HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success === false) {
             throw new Error(result.message || 'La API devolvió un error no exitoso.');
        }
        return result.data || result;
    } catch (error) {
        console.error(`[API ERROR] Fallo en la petición a ${url}:`, error);
        throw error;
    }
}

// --- Funciones de obtención de datos (GET) ---

export const getBotStatus = () => fetchData('/api/status');
export const getTickets = () => fetchData('/api/tickets');
export const getActiveSessions = () => fetchData('/api/activesessions');
export const getSalesData = () => fetchData('/api/salesdata');
export const getCompanyConfig = () => fetchData('/api/config/empresa');
export const getVentasConfig = () => fetchData('/api/config/ventas');
export const getCalendarEvents = () => fetchData('/api/calendar/events');
export const getCalendarEventsCount = (days) => fetchData(`/api/calendar/events/count?days=${days}`);
export const getSoporteConfig = () => fetchData('/api/config/soporte');
export const getAllMenuItems = () => fetchData('/api/menu-items');


// --- Funciones de acción (POST, PUT, DELETE) ---

export const connectBot = () => fetchData('/api/actions/connect', { method: 'POST' });
export const disconnectBot = () => fetchData('/api/actions/disconnect', { method: 'POST' });
export const sendManualMessage = (recipient, message) => fetchData('/api/actions/send-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient, message }),
});
export const closeTicket = (ticketId) => fetchData(`/api/tickets/${ticketId}/close`, { method: 'POST' });

export const saveCompanyConfig = (data) => fetchData('/api/config/empresa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const saveVentasConfig = (data) => fetchData('/api/config/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const saveSoporteConfig = (data) => fetchData('/api/config/soporte', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const addItem = (collection, data) => fetchData(`/api/data/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const updateItem = (collection, id, data) => fetchData(`/api/data/${collection}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const deleteItem = (collection, id) => fetchData(`/api/data/${collection}/${id}`, {
    method: 'DELETE',
});

export const addMenuItem = (data) => fetchData('/api/menu-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const updateMenuItem = (id, data) => fetchData(`/api/menu-items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const deleteMenuItem = (id) => fetchData(`/api/menu-items/${id}`, {
    method: 'DELETE',
});

// --- INICIO DE MODIFICACIÓN ---
export const getPagosConfig = () => fetchData('/api/config/pagos');

export const savePagosConfig = (data) => fetchData('/api/config/pagos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});
// --- FIN DE MODIFICACIÓN ---
