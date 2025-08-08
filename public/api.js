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
        // Se ajusta para manejar respuestas que no necesariamente tienen un campo 'success'
        if (result.success === false) {
             throw new Error(result.message || 'La API devolvió un error no exitoso.');
        }
        return result.data || result;
    } catch (error) {
        console.error(`[API ERROR] Fallo en la petición a ${url}:`, error);
        throw error; // Relanzamos el error para que el llamador pueda manejarlo.
    }
}

// --- Funciones de obtención de datos (GET) ---

export const getBotStatus = () => fetchData('/api/status');
export const getTickets = () => fetchData('/api/tickets');
export const getActiveSessions = () => fetchData('/api/activesessions');
export const getSalesData = () => fetchData('/api/salesdata');
export const getCompanyConfig = () => fetchData('/api/config/empresa');
// --- INICIO DE LA MODIFICACIÓN ---
export const getVentasConfig = () => fetchData('/api/config/ventas');
// --- FIN DE LA MODIFICACIÓN ---

// --- Funciones de acción (POST, PUT, DELETE) ---

export const connectBot = () => fetchData('/api/connect');
export const disconnectBot = () => fetchData('/api/disconnect');

export const sendManualMessage = (recipient, message) => fetchData('/api/send-manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient, message }),
});

export const closeTicket = (ticketId) => fetchData('/api/tickets/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId }),
});

export const saveCompanyConfig = (data) => fetchData('/api/config/empresa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

// --- INICIO DE LA MODIFICACIÓN ---
export const saveVentasConfig = (data) => fetchData('/api/config/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});
// --- FIN DE LA MODIFICACIÓN ---

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
