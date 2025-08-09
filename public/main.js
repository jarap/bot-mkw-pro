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
        // --- INICIO DE MODIFICACIÓN: Estado para el gestor de menús ---
        menus: [],
        selectedMenuId: null
        // --- FIN DE MODIFICACIÓN ---
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
        // --- INICIO DE MODIFICACIÓN: Contenedor para el editor de menús ---
        menuEditorContainer: document.getElementById('ajustes-bot-soporte')?.querySelector('.card-body')
        // --- FIN DE MODIFICACIÓN ---
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

    // --- INICIO DE MODIFICACIÓN: Función para cargar y renderizar el gestor de menús ---
    async function loadAndRenderMenuEditor() {
        if (!dom.menuEditorContainer) return;
        try {
            const menusData = await api.getMenus();
            state.menus = menusData;
            render.renderMenuEditor(dom.menuEditorContainer, state.menus, state);
        } catch (error) {
            dom.menuEditorContainer.innerHTML = `<p class="error-message">No se pudo cargar el gestor de menús.</p>`;
        }
    }
    // --- FIN DE MODIFICACIÓN ---

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
            // --- INICIO DE MODIFICACIÓN: Callback para la nueva sección ---
            'ajustes-bot-soporte': loadAndRenderMenuEditor
            // --- FIN DE MODIFICACIÓN ---
        };
        ui.initializeUINavigation(navigationCallbacks);

        modals.initializeModals(modals.openSalesModal, forceReloadSalesData);

        document.body.addEventListener('click', (e) => {
            const viewButton = e.target.closest('.view-ticket-btn');
            if (viewButton && viewButton.dataset.ticketId) {
                const ticketData = state.tickets.find(t => t.ID_Ticket === viewButton.dataset.ticketId);
                if (ticketData) modals.showTicketModal(ticketData);
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

        dom.zonasTableBody?.addEventListener('click', (e) => {
            const deleteButton = e.target.closest('.delete-zona-btn');
            if (deleteButton) {
                const index = parseInt(deleteButton.dataset.index, 10);
                modals.showConfirmationModal('Confirmar Eliminación', `¿Seguro?`, () => {
                    const currentList = [...(state.salesData.zonasCobertura.listado || [])];
                    if (index > -1) {
                        currentList.splice(index, 1);
                        handleUpdateZonas(currentList);
                    }
                });
            }
        });

        dom.addSupportFaqBtn?.addEventListener('click', () => modals.openSalesModal('soporteFAQ', {}, state.salesData));

        // --- INICIO DE MODIFICACIÓN: Event Listeners para el Gestor de Menús ---
        dom.menuEditorContainer?.addEventListener('click', async (e) => {
            // Seleccionar un menú de la lista
            const menuItem = e.target.closest('li[data-menu-id]');
            if (menuItem) {
                state.selectedMenuId = menuItem.dataset.menuId;
                await loadAndRenderMenuEditor(); // Recargamos para reflejar la selección
            }

            // Crear un nuevo menú
            const createBtn = e.target.closest('#create-menu-btn');
            if (createBtn) {
                const newMenuId = prompt('Introduce el ID para el nuevo menú (ej: "facturacion"):');
                if (newMenuId && !state.menus.find(m => m.id === newMenuId)) {
                    await api.createMenu(newMenuId);
                    await loadAndRenderMenuEditor();
                } else if (newMenuId) {
                    modals.showCustomAlert('Error', 'Ya existe un menú con ese ID.');
                }
            }

            // Eliminar un menú
            const deleteMenuBtn = e.target.closest('.delete-menu-btn');
            if (deleteMenuBtn) {
                const menuId = deleteMenuBtn.dataset.menuId;
                modals.showConfirmationModal('Confirmar Eliminación', `¿Seguro que quieres eliminar el menú "${menuId}"? Esta acción no se puede deshacer.`, async () => {
                    await api.deleteMenu(menuId);
                    state.selectedMenuId = null; // Deseleccionamos
                    await loadAndRenderMenuEditor();
                });
            }

            // Añadir una nueva opción
            const addOptionBtn = e.target.closest('#add-option-btn');
            if (addOptionBtn) {
                const menuId = addOptionBtn.dataset.menuId;
                modals.openMenuOptionModal(state.menus, async (newOption) => {
                    await api.addMenuOption(menuId, newOption);
                    await loadAndRenderMenuEditor();
                });
            }

            // Eliminar una opción
            const deleteOptionBtn = e.target.closest('.delete-option-btn');
            if (deleteOptionBtn) {
                const menuId = deleteOptionBtn.dataset.menuId;
                const optionIndex = parseInt(deleteOptionBtn.dataset.optionIndex, 10);
                const menu = state.menus.find(m => m.id === menuId);
                const optionToDelete = menu?.options[optionIndex];
                if (optionToDelete) {
                    modals.showConfirmationModal('Confirmar Eliminación', `¿Seguro que quieres eliminar la opción "${optionToDelete.text}"?`, async () => {
                        await api.deleteMenuOption(menuId, optionToDelete);
                        await loadAndRenderMenuEditor();
                    });
                }
            }
        });

        // Guardar cambios en los detalles del menú
        dom.menuEditorContainer?.addEventListener('submit', async (e) => {
            if (e.target.id === 'menu-details-form') {
                e.preventDefault();
                const menuId = e.target.dataset.menuId;
                const formData = new FormData(e.target);
                const data = { title: formData.get('title'), description: formData.get('description') };
                try {
                    await api.updateMenuDetails(menuId, data);
                    modals.showCustomAlert('Éxito', 'Detalles del menú guardados.');
                    await loadAndRenderMenuEditor();
                } catch (error) {
                    modals.showCustomAlert('Error', 'No se pudieron guardar los cambios.');
                }
            }
        });
        // --- FIN DE MODIFICACIÓN ---
    }

    initializeWebSocket();
    initializeEventListeners();
});
