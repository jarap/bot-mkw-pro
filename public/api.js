// public/api.js
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }
        if (result.success === false) {
             throw new Error(result.message || 'La API devolvió un error no exitoso.');
        }
        return result.data || result;
    } catch (error) {
        console.error(`[API ERROR] Fallo en la petición a ${url}:`, error);
        throw error;
    }
}

// --- Sesión y Usuarios ---
export const getUserSession = () => fetchData('/api/user/session');
export const getUsers = () => fetchData('/api/users');
export const addUser = (data) => fetchData('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});
export const updateUser = (username, data) => fetchData(`/api/users/${username}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});
export const deleteUser = (username) => fetchData(`/api/users/${username}`, { method: 'DELETE' });

// --- Datos Generales (GET) ---
export const getBotStatus = () => fetchData('/api/status');
export const getTickets = () => fetchData('/api/tickets');
export const getActiveSessions = () => fetchData('/api/activesessions');
export const getSalesData = () => fetchData('/api/salesdata');
export const getCompanyConfig = () => fetchData('/api/config/empresa');
export const getVentasConfig = () => fetchData('/api/config/ventas');
export const getSoporteConfig = () => fetchData('/api/config/soporte');
export const getPagosConfig = () => fetchData('/api/config/pagos');
export const getCalendarEvents = () => fetchData('/api/calendar/events');
export const getCalendarEventsCount = (days) => fetchData(`/api/calendar/events/count?days=${days}`);
export const getAllMenuItems = () => fetchData('/api/menu-items');
export const getComprobantes = () => fetchData('/api/comprobantes');

// --- Acciones (POST, PUT, DELETE) ---
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

export const savePagosConfig = (data) => fetchData('/api/config/pagos', {
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

export const asignarPago = (comprobanteId, data) => fetchData(`/api/comprobantes/${comprobanteId}/asignar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

export const rechazarPago = (comprobanteId) => fetchData(`/api/comprobantes/${comprobanteId}/rechazar`, {
    method: 'POST',
});
