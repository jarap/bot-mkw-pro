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

// --- INICIO DE MODIFICACIONES: Funciones para el Gestor de Menús ---

export const getMenus = () => fetchData('/api/menus');

export const createMenu = (menuId) => fetchData('/api/menus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuId }),
});

export const deleteMenu = (menuId) => fetchData(`/api/menus/${menuId}`, {
    method: 'DELETE',
});

export const updateMenuDetails = (menuId, data) => fetchData(`/api/menus/${menuId}/details`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const addMenuOption = (menuId, optionData) => fetchData(`/api/menus/${menuId}/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(optionData),
});

export const deleteMenuOption = (menuId, optionData) => fetchData(`/api/menus/${menuId}/options`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(optionData),
});

// --- FIN DE MODIFICACIONES ---


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

export const saveVentasConfig = (data) => fetchData('/api/config/ventas', {
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
