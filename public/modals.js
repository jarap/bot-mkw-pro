// public/modals.js
// Módulo para gestionar todos los modales de la aplicación.

import * as api from './api.js';
import * as render from './render.js';

// --- Lógica del Modal de Confirmación (Genérico) ---
function showConfirmationModal(title, text, onOk) {
    const overlay = document.getElementById('confirm-modal-overlay');
    const titleEl = document.getElementById('confirm-modal-title');
    const textEl = document.getElementById('confirm-modal-text');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    if (!overlay || !titleEl || !textEl || !okBtn || !cancelBtn) return;

    titleEl.textContent = title;
    textEl.textContent = text;
    overlay.classList.add('show');

    // Limpiamos listeners anteriores para evitar ejecuciones múltiples
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newOkBtn.addEventListener('click', () => {
        onOk();
        hideConfirmationModal();
    });
    newCancelBtn.addEventListener('click', hideConfirmationModal);
}

function hideConfirmationModal() {
    const overlay = document.getElementById('confirm-modal-overlay');
    if (overlay) overlay.classList.remove('show');
}

export function showCustomAlert(title, text) {
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
    
    showConfirmationModal(title, text, () => {
        if (cancelBtn) cancelBtn.style.display = 'inline-block'; // Restaurar para futuros usos
    });
}

// --- Lógica del Modal de Detalles del Ticket ---
function showTicketModal(ticket) {
    const overlay = document.getElementById('ticket-modal-overlay');
    if (!overlay) return;

    document.getElementById('modal-ticket-id').textContent = ticket.ID_Ticket || 'N/A';
    document.getElementById('modal-ticket-date').textContent = ticket.Timestamp || 'N/A';
    document.getElementById('modal-ticket-client').textContent = ticket['Nombre_Cliente'] || 'N/A';
    document.getElementById('modal-ticket-number').textContent = ticket['Numero_Cliente'] || 'N/A';
    document.getElementById('modal-ticket-agent').textContent = ticket['Agente_Asignado'] || 'N/A';
    document.getElementById('modal-ticket-status').innerHTML = `<span class="status-badge status-${(ticket.Estado || '').toLowerCase().replace(/ /g, '-')}">${ticket.Estado || 'N/A'}</span>`;
    document.getElementById('modal-ticket-sentiment').innerHTML = render.getSentimentHTML(ticket.Sentimiento);
    document.getElementById('modal-ticket-message').textContent = ticket['Mensaje_Inicial'] || 'No disponible.';
    
    const closeBtn = document.getElementById('modal-close-ticket-btn');
    closeBtn.dataset.ticketId = ticket.ID_Ticket;
    closeBtn.disabled = (ticket.Estado || '').toLowerCase() === 'cerrado';

    overlay.classList.add('show');
}

function hideTicketModal() {
    const overlay = document.getElementById('ticket-modal-overlay');
    if (overlay) overlay.classList.remove('show');
}

// --- Lógica del Modal de Ventas (Añadir/Editar) ---
function openSalesModal(type, data = {}, salesData) {
    const overlay = document.getElementById('sales-modal-overlay');
    const titleEl = document.getElementById('sales-modal-title');
    const formFieldsEl = document.getElementById('sales-form-fields');
    const form = document.getElementById('sales-form');

    if (!overlay || !titleEl || !formFieldsEl || !form) return;

    const mode = data.id ? 'edit' : 'add';
    titleEl.textContent = `${mode === 'add' ? 'Añadir' : 'Editar'} ${type}`;
    
    let formHTML = '';
    switch (type) {
        case 'planes':
            formHTML = `
                <input type="text" name="nombre" placeholder="Nombre del Plan" value="${data.nombre || ''}" required>
                <input type="number" name="precioMensual" placeholder="Precio Mensual" value="${data.precioMensual || ''}" required>
                <input type="number" name="velocidadBajada" placeholder="Velocidad de Bajada (Mbps)" value="${data.velocidadBajada || ''}" required>
                <input type="number" name="velocidadSubida" placeholder="Velocidad de Subida (Mbps)" value="${data.velocidadSubida || ''}" required>
                <textarea name="idealPara" rows="3" placeholder="Ideal para...">${data.idealPara || ''}</textarea>
            `;
            break;
        case 'promociones':
            const zonasCheckboxes = (salesData.zonasCobertura.listado || []).map(zona => `
                <label><input type="checkbox" name="zonasAplicables" value="${zona}" ${(data.zonasAplicables || []).includes(zona) ? 'checked' : ''}> ${zona}</label>
            `).join('');
            formHTML = `
                <input type="text" name="nombre" placeholder="Nombre de la Promoción" value="${data.nombre || ''}" required>
                <textarea name="descripcion" rows="3" placeholder="Descripción">${data.descripcion || ''}</textarea>
                <label><input type="checkbox" name="activo" ${data.activo ? 'checked' : ''}> Promoción Activa</label>
                <div class="checkbox-group"><label>Zonas Aplicables</label>${zonasCheckboxes}</div>
            `;
            break;
        case 'preguntasFrecuentes':
            formHTML = `
                <input type="text" name="pregunta" placeholder="Pregunta del cliente" value="${data.pregunta || ''}" required>
                <textarea name="respuesta" rows="4" placeholder="Respuesta oficial">${data.respuesta || ''}</textarea>
            `;
            break;
    }
    formFieldsEl.innerHTML = formHTML;
    
    form.dataset.type = type;
    form.dataset.id = data.id || '';

    overlay.classList.add('show');
}

function closeSalesModal() {
    const overlay = document.getElementById('sales-modal-overlay');
    if (overlay) overlay.classList.remove('show');
}

// --- Inicializadores de Eventos para Modales ---
export function initializeModals(getSalesDataCallback) {
    // Ticket Modal
    document.getElementById('close-modal-btn')?.addEventListener('click', hideTicketModal);
    document.getElementById('ticket-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'ticket-modal-overlay') hideTicketModal(); });
    document.getElementById('tickets-table-body')?.addEventListener('click', (e) => {
        const viewButton = e.target.closest('.view-ticket-btn');
        if (viewButton) {
            const ticketData = JSON.parse(viewButton.dataset.ticket.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
            showTicketModal(ticketData);
        }
    });
    document.getElementById('modal-close-ticket-btn')?.addEventListener('click', (e) => {
        const ticketId = e.target.dataset.ticketId;
        showConfirmationModal('Confirmar Cierre', `¿Estás seguro de que quieres cerrar el ticket ${ticketId}?`, async () => {
            try {
                await api.closeTicket(ticketId);
                showCustomAlert('Éxito', 'Ticket cerrado correctamente.');
                hideTicketModal();
                // TODO: Forzar recarga de tickets en la UI
            } catch (error) {
                showCustomAlert('Error', 'No se pudo cerrar el ticket.');
            }
        });
    });

    // Sales Modal
    document.getElementById('close-sales-modal-btn')?.addEventListener('click', closeSalesModal);
    document.getElementById('sales-modal-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'sales-modal-overlay') closeSalesModal(); });
    
    document.getElementById('add-plan-btn')?.addEventListener('click', () => openSalesModal('planes', {}, getSalesDataCallback()));
    document.getElementById('add-promo-btn')?.addEventListener('click', () => openSalesModal('promociones', {}, getSalesDataCallback()));
    document.getElementById('add-faq-btn')?.addEventListener('click', () => openSalesModal('preguntasFrecuentes', {}, getSalesDataCallback()));
    
    document.body.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        if (editButton) {
            const itemData = JSON.parse(editButton.dataset.item.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
            openSalesModal(editButton.dataset.type, itemData, getSalesDataCallback());
        }
        const deleteButton = e.target.closest('.delete-btn');
        if (deleteButton) {
            const { type, id } = deleteButton.dataset;
            showConfirmationModal('Confirmar Eliminación', '¿Estás seguro?', async () => {
                await api.deleteItem(type, id);
                // TODO: Forzar recarga de datos de ventas
            });
        }
    });

    document.getElementById('sales-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { type, id } = e.target.dataset;
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        // Procesamiento específico por tipo
        if (type === 'promociones') {
            data.activo = data.activo === 'on';
            data.zonasAplicables = formData.getAll('zonasAplicables');
        } else if (type === 'planes') {
            data.precioMensual = Number(data.precioMensual);
            data.velocidadBajada = Number(data.velocidadBajada);
            data.velocidadSubida = Number(data.velocidadSubida);
        }

        if (id) {
            await api.updateItem(type, id, data);
        } else {
            await api.addItem(type, data);
        }
        closeSalesModal();
        // TODO: Forzar recarga de datos de ventas
    });
}
