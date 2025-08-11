// public/main.js
// Punto de entrada principal de la aplicación del lado del cliente.
// Orquesta la inicialización de los módulos y la gestión de eventos.

import * as api from './api.js';
import * as ui from './ui.js';
import * as render from './render.js';
import * as modals from './modals.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('[PUNTO DE CONTROL] DOM cargado. Iniciando main.js...');

    let state = {
        tickets: [],
        salesData: { planes: [], promociones: [], preguntasFrecuentes: [], zonasCobertura: { id: null, listado: [] }, soporteFaqs: [] },
        companyConfig: {},
        ventasConfig: {},
        activeSessions: [],
        menuItems: [] 
    };

    let calendarInstance = null;

    const dom = {
        ticketsTableBody: document.getElementById('tickets-table-body'),
        sessionsTableBody: document.getElementById('sessions-table-body'),
        planesTableBody: document.getElementById('planes-table-body'),
        promosTableBody: document.getElementById('promos-table-body'),
        faqTableBody: document.getElementById('faq-table-body'),
        supportFaqTableBody: document.getElementById('support-faq-table-body'),
        addSupportFaqBtn: document.getElementById('add-support-faq-btn'),
        companyConfigForm: document.getElementById('company-config-form'),
        ventasConfigForm: document.getElementById('ventas-config-form'),
        zonasTableBody: document.getElementById('zonas-table-body'),
        salesForm: document.getElementById('sales-form'),
        openTicketsValue: document.getElementById('open-tickets-value'),
        qrImage: document.getElementById('qr-image'),
        logIframe: document.getElementById('log-iframe'),
        sendMessageForm: document.getElementById('send-message-form'),
        connectBtn: document.getElementById('connect-btn'),
        disconnectBtn: document.getElementById('disconnect-btn'),
        calendarContainer: document.getElementById('calendar-container'),
        menuEditorContainer: document.getElementById('ajustes-bot-soporte')?.querySelector('.card-body')
    };

    async function loadInitialData() {
        try {
            const ticketsData = await api.getTickets();
            state.tickets = ticketsData;
            render.renderTickets(dom.ticketsTableBody, state.tickets);
            render.renderDashboardCharts(state.tickets);
            ui.initializeTicketFilters(state.tickets); 
        } catch (error) {
            console.error("Fallo en la carga inicial de tickets.", error);
        }
    }
    
    function renderCurrentTickets() {
        if (dom.ticketsTableBody) {
            render.renderTickets(dom.ticketsTableBody, state.tickets);
        }
    }
    
    async function forceReloadSalesData() {
        try {
            const data = await api.getSalesData();
            state.salesData = data;
            
            render.renderPlanes(dom.planesTableBody, state.salesData.planes);
            render.renderPromos(dom.promosTableBody, state.salesData.promociones);
            render.renderFaqs(dom.faqTableBody, state.salesData.preguntasFrecuentes);
            render.renderZonasCobertura(dom.zonasTableBody, state.salesData.zonasCobertura);
            render.renderSupportFaqs(dom.supportFaqTableBody, state.salesData.soporteFaqs);

        } catch (error) {
            console.error("Fallo en la recarga de datos de ventas.", error);
        }
    }

    async function loadAndRenderCompanyConfig() {
        try {
            const configData = await api.getCompanyConfig();
            state.companyConfig = configData;
            render.renderCompanyConfigForm(dom.companyConfigForm, state.companyConfig);
        } catch (error) {
            console.error("Fallo al cargar la configuración de la empresa.", error);
        }
    }

    async function loadAndRenderVentasConfig() {
        try {
            const configData = await api.getVentasConfig();
            state.ventasConfig = configData;
            render.renderVentasConfigForm(dom.ventasConfigForm, state.ventasConfig);
        } catch (error) {
            console.error("Fallo al cargar la configuración de ventas.", error);
        }
    }
    
    async function loadAndRenderCalendar() {
        if (!dom.calendarContainer) return;
        if (calendarInstance) calendarInstance.destroy();
        try {
            const events = await api.getCalendarEvents();
            calendarInstance = new FullCalendar.Calendar(dom.calendarContainer, {
                initialView: 'dayGridMonth',
                locale: 'es',
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
                events: events,
                eventClick: (info) => modals.showCustomAlert(info.event.title, `Descripción: ${info.event.extendedProps.description || 'No disponible'}`)
            });
            calendarInstance.render();
        } catch (error) {
            dom.calendarContainer.innerHTML = `<p class="error-message">No se pudieron cargar los eventos.</p>`;
        }
    }

    async function loadAndRenderMenuEditor() {
        if (!dom.menuEditorContainer) return;
        try {
            const menuItems = await api.getAllMenuItems();
            state.menuItems = menuItems;
            render.renderMenuEditor(dom.menuEditorContainer, state.menuItems);
        } catch (error) {
            dom.menuEditorContainer.innerHTML = `<p class="error-message">No se pudo cargar el gestor de menús.</p>`;
        }
    }

    function initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => loadInitialData();
        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'companyConfig':
                    state.companyConfig = message.data;
                    ui.updateHeaderBranding(message.data);
                    break;
                case 'status':
                    ui.updateStatusUI(message.data);
                    break;
                case 'qr':
                    if (dom.qrImage) dom.qrImage.src = message.data;
                    ui.updateStatusUI('ESPERANDO QR');
                    break;
                case 'log':
                    if (dom.logIframe?.contentWindow) {
                        dom.logIframe.contentWindow.postMessage(message.data, '*');
                    }
                    break;
                case 'kpiUpdate':
                    if (dom.openTicketsValue && message.data.openTickets !== undefined) {
                        dom.openTicketsValue.textContent = message.data.openTickets;
                    }
                    break;
                case 'sessionsChanged':
                    if (document.getElementById('sessions').classList.contains('active')) {
                        api.getActiveSessions().then(sessions => render.renderActiveSessions(dom.sessionsTableBody, sessions));
                    }
                    break;
                case 'ticketsChanged':
                    loadInitialData();
                    break;
            }
        };
        ws.onclose = () => {
            ui.updateStatusUI('SERVIDOR_REINICIANDO');
            setTimeout(() => window.location.reload(), 3000);
        };
    }

    async function handleUpdateZonas(newListado) {
        try {
            await api.updateItem('zonasCobertura', state.salesData.zonasCobertura.id, { listado: newListado });
            modals.showCustomAlert('Éxito', 'La lista de zonas ha sido actualizada.');
            await forceReloadSalesData();
        } catch (error) {
            modals.showCustomAlert('Error', `No se pudo actualizar la lista de zonas: ${error.message}`);
        }
    }

    function initializeEventListeners() {
        ui.initializeUISidebar();
        
        const navigationCallbacks = {
            'history': renderCurrentTickets,
            'calendar': loadAndRenderCalendar,
            'planes': forceReloadSalesData,
            'promociones': forceReloadSalesData,
            'faq': forceReloadSalesData,
            'zonas-cobertura': forceReloadSalesData,
            'faq-soporte': forceReloadSalesData,
            'ajustes-empresa': loadAndRenderCompanyConfig,
            'ajustes-bot-venta': loadAndRenderVentasConfig,
            'ajustes-bot-soporte': loadAndRenderMenuEditor
        };
        ui.initializeUINavigation(navigationCallbacks);

        modals.initializeModals();

        document.body.addEventListener('click', async (e) => {
            const viewTicketBtn = e.target.closest('.view-ticket-btn');
            if (viewTicketBtn) {
                const ticketId = viewTicketBtn.dataset.ticketId;
                const ticketData = state.tickets.find(t => t.ID_Ticket === ticketId);
                if (ticketData) modals.showTicketModal(ticketData);
                return;
            }

            const editBtn = e.target.closest('.edit-btn');
            if (editBtn) {
                const itemData = JSON.parse(editBtn.dataset.item.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
                modals.openSalesModal(editBtn.dataset.type, itemData, state.salesData);
                return;
            }

            const editZonaBtn = e.target.closest('.edit-zona-btn');
            if (editZonaBtn) {
                const zona = editZonaBtn.dataset.zona;
                const index = editZonaBtn.dataset.index;
                modals.openSalesModal('zona', { nombre: zona, isEditing: true, originalIndex: index });
                return;
            }

            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                const { type, id } = deleteBtn.dataset;
                modals.showConfirmationModal('Confirmar Eliminación', '¿Estás seguro?', async () => {
                    await api.deleteItem(type, id);
                    await forceReloadSalesData();
                });
                return;
            }
            
            const deleteZonaBtn = e.target.closest('.delete-zona-btn');
            if (deleteZonaBtn) {
                const index = parseInt(deleteZonaBtn.dataset.index, 10);
                modals.showConfirmationModal('Confirmar Eliminación', `¿Seguro?`, () => {
                    const currentList = [...(state.salesData.zonasCobertura.listado || [])];
                    if (index > -1) {
                        currentList.splice(index, 1);
                        handleUpdateZonas(currentList);
                    }
                });
                return;
            }

            // --- INICIO DE MODIFICACIÓN: Manejo de errores de validación ---
            const openModalAndSave = async (itemData = {}, parentId, itemId = null) => {
                modals.openMenuItemModal(itemData, parentId, async (formData) => {
                    try {
                        if (itemId) {
                            await api.updateMenuItem(itemId, formData);
                        } else {
                            await api.addMenuItem(formData);
                        }
                        await loadAndRenderMenuEditor();
                    } catch (error) {
                        // Capturamos el error del backend y se lo mostramos al usuario.
                        modals.showCustomAlert('Error de Validación', error.message);
                    }
                });
            };
            // --- FIN DE MODIFICACIÓN ---

            const addRootBtn = e.target.closest('#add-root-item-btn');
            if (addRootBtn) {
                openModalAndSave({}, 'root');
                return;
            }

            const addChildBtn = e.target.closest('.add-child-btn');
            if (addChildBtn) {
                const parentId = addChildBtn.dataset.parentId;
                openModalAndSave({}, parentId);
                return;
            }

            const editItemBtn = e.target.closest('.edit-item-btn');
            if (editItemBtn) {
                const itemId = editItemBtn.dataset.itemId;
                const itemData = state.menuItems.find(item => item.id === itemId);
                if (itemData) {
                    openModalAndSave(itemData, itemData.parent, itemId);
                }
                return;
            }

            const deleteItemBtn = e.target.closest('.delete-item-btn');
            if (deleteItemBtn) {
                const itemId = deleteItemBtn.dataset.itemId;
                const item = state.menuItems.find(i => i.id === itemId);
                if (item) {
                    modals.showConfirmationModal('Confirmar Eliminación', `¿Seguro que quieres eliminar "${item.title}" y todos sus sub-items?`, async () => {
                        try {
                            await api.deleteMenuItem(itemId);
                            await loadAndRenderMenuEditor();
                        } catch (error) {
                            modals.showCustomAlert('Error', 'No se pudo eliminar el item.');
                        }
                    });
                } else {
                    console.error(`Se intentó borrar el item con ID ${itemId} pero no se encontró en el estado.`);
                    modals.showCustomAlert('Error', 'No se pudo encontrar el item para eliminar. Refresca la página.');
                }
                return;
            }
        });

        dom.connectBtn?.addEventListener('click', () => api.connectBot());
        dom.disconnectBtn?.addEventListener('click', () => api.disconnectBot());

        dom.sendMessageForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const recipient = e.target.elements['manual-recipient'].value.trim();
            const message = e.target.elements['manual-message'].value.trim();
            if (!recipient || !message) return ui.showFeedback('Por favor, completa ambos campos.', 'error');
            try {
                await api.sendManualMessage(recipient, message);
                ui.showFeedback('Mensaje enviado con éxito.', 'success');
                e.target.elements['manual-message'].value = '';
            } catch (error) {
                ui.showFeedback(error.message, 'error');
            }
        });

        dom.companyConfigForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newConfigData = Object.fromEntries(new FormData(dom.companyConfigForm).entries());
            try {
                await api.saveCompanyConfig(newConfigData);
                modals.showCustomAlert('Éxito', 'Configuración guardada.');
            } catch (error) {
                modals.showCustomAlert('Error', 'No se pudo guardar la configuración.');
            }
        });

        dom.ventasConfigForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(dom.ventasConfigForm);
            const newConfigData = Object.fromEntries(formData.entries());
            newConfigData.costoInstalacion = Number(newConfigData.costoInstalacion) || 0;
            try {
                await api.saveVentasConfig(newConfigData);
                modals.showCustomAlert('Éxito', 'Configuración del bot de ventas guardada.');
            } catch (error) {
                modals.showCustomAlert('Error', 'No se pudo guardar la configuración.');
            }
        });

        dom.companyConfigForm?.addEventListener('change', async (e) => {
            if (e.target.id === 'logo-file-input' && e.target.files[0]) {
                const formData = new FormData();
                formData.append('logo', e.target.files[0]);
                try {
                    const result = await fetch('/api/upload/logo', { method: 'POST', body: formData }).then(res => res.json());
                    if (!result.success) throw new Error(result.message);
                    document.getElementById('logo-preview').src = result.filePath;
                    document.getElementById('company-logoUrl').value = result.filePath;
                    ui.showFeedback('Logo subido. No olvides guardar la configuración.', 'success');
                } catch (error) {
                    modals.showCustomAlert('Error de Subida', `No se pudo subir el logo: ${error.message}`);
                }
            }
        });

        dom.salesForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { type, id } = e.target.dataset;
            const formData = new FormData(e.target);
            let data = Object.fromEntries(formData.entries());

            if (type === 'zona') {
                const newName = data.nombre.trim();
                if (!newName) return modals.showCustomAlert('Error', 'El nombre de la zona no puede estar vacío.');
                const currentList = [...(state.salesData.zonasCobertura.listado || [])];
                if (e.target.dataset.isEditing === 'true') {
                    currentList[parseInt(e.target.dataset.originalIndex, 10)] = newName;
                } else {
                    currentList.push(newName);
                }
                await handleUpdateZonas(currentList);
            } else {
                if (type === 'promociones') {
                    data.activo = formData.has('activo');
                    data.descuentoInstalacion = Number(data.descuentoInstalacion) || 0;
                    const selectedZonas = [];
                    document.querySelectorAll('#promo-zonas-container .zone-btn.active').forEach(btn => selectedZonas.push(btn.dataset.zona));
                    data.zonasAplicables = selectedZonas;
                } else if (type === 'planes') {
                    data.precioMensual = Number(data.precioMensual);
                    data.velocidadBajada = Number(data.velocidadBajada);
                    data.velocidadSubida = Number(data.velocidadSubida);
                }
                await (id ? api.updateItem(type, id, data) : api.addItem(type, data));
                await forceReloadSalesData();
            }
            document.getElementById('close-sales-modal-btn')?.click();
        });

        dom.addSupportFaqBtn?.addEventListener('click', () => modals.openSalesModal('soporteFAQ', {}, state.salesData));
    }

    initializeWebSocket();
    initializeEventListeners();
});
