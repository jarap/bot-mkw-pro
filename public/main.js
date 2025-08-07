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
        salesData: { planes: [], promociones: [], preguntasFrecuentes: [], zonasCobertura: { listado: [] } },
        companyConfig: {},
        activeSessions: []
    };

    const dom = {
        ticketsTableBody: document.getElementById('tickets-table-body'),
        sessionsTableBody: document.getElementById('sessions-table-body'),
        planesTableBody: document.getElementById('planes-table-body'),
        promosTableBody: document.getElementById('promos-table-body'),
        faqTableBody: document.getElementById('faq-table-body'),
        companyConfigForm: document.getElementById('company-config-form'),
        openTicketsValue: document.getElementById('open-tickets-value'),
        qrImage: document.getElementById('qr-image'),
        logIframe: document.getElementById('log-iframe'),
        sendMessageForm: document.getElementById('send-message-form'),
        connectBtn: document.getElementById('connect-btn'),
        disconnectBtn: document.getElementById('disconnect-btn'),
    };

    async function loadInitialData() {
        try {
            state.tickets = await api.getTickets();
            render.renderTickets(dom.ticketsTableBody, state.tickets);
            render.renderDashboardCharts(state.tickets);
        } catch (error) {
            console.error("Fallo en la carga inicial de tickets.", error);
        }
    }

    function initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}`);

        ws.onopen = () => {
            console.log('[PUNTO DE CONTROL] Conexión WebSocket establecida.');
            api.getBotStatus().then(data => ui.updateStatusUI(data.status));
            loadInitialData();
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            switch (message.type) {
                // --- INICIO DE LA MODIFICACIÓN ---
                case 'companyConfig':
                    state.companyConfig = message.data;
                    ui.updateHeaderBranding(message.data);
                    break;
                // --- FIN DE LA MODIFICACIÓN ---
                case 'status':
                    ui.updateStatusUI(message.data);
                    break;
                case 'qr':
                    if (dom.qrImage) dom.qrImage.src = message.data;
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
            }
        };

        ws.onclose = () => {
            console.log('[PUNTO DE CONTROL] Conexión WebSocket perdida. Intentando reconectar...');
            ui.updateStatusUI('SERVIDOR_REINICIANDO');
            setTimeout(() => window.location.reload(), 3000);
        };
    }

    function initializeEventListeners() {
        ui.initializeUISidebar();
        ui.initializeUINavigation();
        ui.initializeTicketFilters();
        modals.initializeModals(() => state.salesData);

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
    }

    initializeWebSocket();
    initializeEventListeners();
});
