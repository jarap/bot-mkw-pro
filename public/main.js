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
        salesData: { planes: [], promociones: [], preguntasFrecuentes: [], zonasCobertura: { id: null, listado: [] } },
        companyConfig: {},
        // --- INICIO DE LA MODIFICACIÓN ---
        ventasConfig: {},
        // --- FIN DE LA MODIFICACIÓN ---
        activeSessions: []
    };

    const dom = {
        ticketsTableBody: document.getElementById('tickets-table-body'),
        sessionsTableBody: document.getElementById('sessions-table-body'),
        planesTableBody: document.getElementById('planes-table-body'),
        promosTableBody: document.getElementById('promos-table-body'),
        faqTableBody: document.getElementById('faq-table-body'),
        companyConfigForm: document.getElementById('company-config-form'),
        // --- INICIO DE LA MODIFICACIÓN ---
        ventasConfigForm: document.getElementById('ventas-config-form'),
        // --- FIN DE LA MODIFICACIÓN ---
        zonasTableBody: document.getElementById('zonas-table-body'),
        salesForm: document.getElementById('sales-form'),
        openTicketsValue: document.getElementById('open-tickets-value'),
        qrImage: document.getElementById('qr-image'),
        logIframe: document.getElementById('log-iframe'),
        sendMessageForm: document.getElementById('send-message-form'),
        connectBtn: document.getElementById('connect-btn'),
        disconnectBtn: document.getElementById('disconnect-btn'),
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
    
    async function forceReloadSalesData() {
        try {
            const data = await api.getSalesData();
            state.salesData = data;
            console.log('[PUNTO DE CONTROL] Datos de ventas recargados:', state.salesData);
            
            render.renderPlanes(dom.planesTableBody, state.salesData.planes);
            render.renderPromos(dom.promosTableBody, state.salesData.promociones);
            render.renderFaqs(dom.faqTableBody, state.salesData.preguntasFrecuentes);
            render.renderZonasCobertura(dom.zonasTableBody, state.salesData.zonasCobertura);

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
            if (dom.companyConfigForm) {
                dom.companyConfigForm.innerHTML = `<p class="error-message">No se pudo cargar la configuración.</p>`;
            }
        }
    }

    // --- INICIO DE LA MODIFICACIÓN ---
    async function loadAndRenderVentasConfig() {
        try {
            const configData = await api.getVentasConfig();
            state.ventasConfig = configData;
            render.renderVentasConfigForm(dom.ventasConfigForm, state.ventasConfig);
        } catch (error) {
            console.error("Fallo al cargar la configuración de ventas.", error);
            if (dom.ventasConfigForm) {
                dom.ventasConfigForm.innerHTML = `<p class="error-message">No se pudo cargar la configuración.</p>`;
            }
        }
    }
    // --- FIN DE LA MODIFICACIÓN ---

    function initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => {
            console.log('[PUNTO DE CONTROL] Conexión WebSocket establecida.');
            loadInitialData();
        };

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
                        api.getActiveSessions().then(sessions => {
                            state.activeSessions = sessions;
                            render.renderActiveSessions(dom.sessionsTableBody, state.activeSessions);
                        });
                    }
                    break;
                case 'ticketsChanged':
                    console.log('[PUNTO DE CONTROL] Notificación de cambio en tickets recibida. Recargando lista...');
                    loadInitialData();
                    break;
            }
        };

        ws.onclose = () => {
            console.log('[PUNTO DE CONTROL] Conexión WebSocket perdida. Intentando reconectar...');
            ui.updateStatusUI('SERVIDOR_REINICIANDO');
            setTimeout(() => window.location.reload(), 3000);
        };
    }

    async function handleUpdateZonas(newListado) {
        try {
            const docId = state.salesData.zonasCobertura.id;
            if (!docId) {
                throw new Error("No se encontró el ID del documento de zonas de cobertura.");
            }
            await api.updateItem('zonasCobertura', docId, { listado: newListado });
            modals.showCustomAlert('Éxito', 'La lista de zonas ha sido actualizada.');
            await forceReloadSalesData();
        } catch (error) {
            console.error('Error al actualizar zonas:', error);
            modals.showCustomAlert('Error', `No se pudo actualizar la lista de zonas: ${error.message}`);
        }
    }

    function initializeEventListeners() {
        ui.initializeUISidebar();
        // --- INICIO DE LA MODIFICACIÓN ---
        ui.initializeUINavigation(forceReloadSalesData, loadAndRenderCompanyConfig, loadAndRenderVentasConfig);
        // --- FIN DE LA MODIFICACIÓN ---
        modals.initializeModals(() => state.salesData, forceReloadSalesData);

        dom.connectBtn?.addEventListener('click', () => api.connectBot());
        dom.disconnectBtn?.addEventListener('click', () => api.disconnectBot());

        dom.sendMessageForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const recipient = e.target.elements['manual-recipient'].value.trim();
            const message = e.target.elements['manual-message'].value.trim();
            const sendBtn = e.target.querySelector('button');

            if (!recipient || !message) {
                return ui.showFeedback('Por favor, completa ambos campos.', 'error');
            }
            
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            
            try {
                await api.sendManualMessage(recipient, message);
                ui.showFeedback('Mensaje enviado con éxito.', 'success');
                e.target.elements['manual-message'].value = '';
            } catch (error) {
                ui.showFeedback(error.message, 'error');
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Mensaje';
            }
        });

        dom.companyConfigForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(dom.companyConfigForm);
            const newConfigData = Object.fromEntries(formData.entries());
            try {
                await api.saveCompanyConfig(newConfigData);
                modals.showCustomAlert('Éxito', 'Configuración guardada.');
            } catch (error) {
                modals.showCustomAlert('Error', 'No se pudo guardar la configuración.');
            }
        });

        // --- INICIO DE LA MODIFICACIÓN ---
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
        // --- FIN DE LA MODIFICACIÓN ---

        dom.companyConfigForm?.addEventListener('click', (e) => {
            if (e.target.id === 'change-logo-btn') {
                document.getElementById('logo-file-input')?.click();
            }
        });

        dom.companyConfigForm?.addEventListener('change', async (e) => {
            if (e.target.id === 'logo-file-input' && e.target.files[0]) {
                const file = e.target.files[0];
                const formData = new FormData();
                formData.append('logo', file);

                const changeBtn = document.getElementById('change-logo-btn');
                const originalBtnText = changeBtn.innerHTML;
                changeBtn.disabled = true;
                changeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';

                try {
                    const response = await fetch('/api/upload/logo', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();

                    if (!result.success) throw new Error(result.message);

                    document.getElementById('logo-preview').src = result.filePath;
                    document.getElementById('company-logoUrl').value = result.filePath;
                    
                    ui.showFeedback('Logo subido. No olvides guardar la configuración.', 'success');

                } catch (error) {
                    modals.showCustomAlert('Error de Subida', `No se pudo subir el logo: ${error.message}`);
                } finally {
                    changeBtn.disabled = false;
                    changeBtn.innerHTML = originalBtnText;
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
                if (!newName) {
                    modals.showCustomAlert('Error', 'El nombre de la zona no puede estar vacío.');
                    return;
                }
                const isEditing = e.target.dataset.isEditing === 'true';
                const originalIndex = parseInt(e.target.dataset.originalIndex, 10);
                const currentList = [...(state.salesData.zonasCobertura.listado || [])];
                if (isEditing) {
                    if (originalIndex > -1) currentList[originalIndex] = newName;
                } else {
                    currentList.push(newName);
                }
                await handleUpdateZonas(currentList);

            } else if (type === 'promociones') {
                data.activo = formData.has('activo');
                data.descuentoInstalacion = Number(data.descuentoInstalacion) || 0;

                const zonasContainer = document.getElementById('promo-zonas-container');
                const selectedZonas = [];
                zonasContainer.querySelectorAll('.zone-btn.active').forEach(btn => {
                    selectedZonas.push(btn.dataset.zona);
                });
                data.zonasAplicables = selectedZonas;
                
                if (id) {
                    await api.updateItem(type, id, data);
                } else {
                    await api.addItem(type, data);
                }
                await forceReloadSalesData();

            } else if (type === 'planes') {
                data.precioMensual = Number(data.precioMensual);
                data.velocidadBajada = Number(data.velocidadBajada);
                data.velocidadSubida = Number(data.velocidadSubida);
                if (id) {
                    await api.updateItem(type, id, data);
                } else {
                    await api.addItem(type, data);
                }
                await forceReloadSalesData();
            } else {
                 if (id) {
                    await api.updateItem(type, id, data);
                } else {
                    await api.addItem(type, data);
                }
                await forceReloadSalesData();
            }
            
            document.getElementById('close-sales-modal-btn')?.click();
        });

        dom.zonasTableBody?.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.delete-zona-btn');
            if (deleteButton) {
                const index = parseInt(deleteButton.dataset.index, 10);
                const zona = deleteButton.dataset.zona;
                
                modals.showConfirmationModal('Confirmar Eliminación', `¿Estás seguro de que quieres eliminar la zona "${zona}"?`, () => {
                    const currentList = [...(state.salesData.zonasCobertura.listado || [])];
                    if (index > -1) {
                        currentList.splice(index, 1);
                        handleUpdateZonas(currentList);
                    }
                });
            }
        });

        document.body.addEventListener('click', (e) => {
            if (!e.target.closest('#sales-modal-overlay')) return;

            const zoneBtn = e.target.closest('.zone-btn');
            if (zoneBtn) {
                zoneBtn.classList.toggle('active');
            }
            
            const selectAllBtn = e.target.closest('#select-all-zones');
            if (selectAllBtn) {
                document.querySelectorAll('#promo-zonas-container .zone-btn').forEach(btn => btn.classList.add('active'));
            }

            const deselectAllBtn = e.target.closest('#deselect-all-zones');
            if (deselectAllBtn) {
                document.querySelectorAll('#promo-zonas-container .zone-btn').forEach(btn => btn.classList.remove('active'));
            }
        });
    }

    initializeWebSocket();
    initializeEventListeners();
});
