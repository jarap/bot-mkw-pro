// public/ui.js
// Módulo para manejar las interacciones y actualizaciones de la interfaz de usuario.

import * as render from './render.js';

let allTickets = [];
let currentFilterStatus = 'all';

/**
 * Actualiza el logo y el nombre de la empresa en la cabecera del panel.
 * @param {object} config - El objeto de configuración de la empresa.
 */
export function updateHeaderBranding(config) {
    const logoElement = document.getElementById('header-logo');
    const nameElement = document.getElementById('header-company-name');

    if (logoElement && config.logoUrl) {
        logoElement.src = config.logoUrl;
    }
    if (nameElement && config.nombreEmpresa) {
        nameElement.textContent = config.nombreEmpresa;
    }
}

export function updateStatusUI(status) {
    const statusText = document.getElementById('status-text');
    const statusCard = statusText ? statusText.closest('.kpi-card') : null;
    const qrCard = document.getElementById('qr-card');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const sendManualBtn = document.getElementById('send-manual-btn');
    
    if (!statusText || !statusCard) return;

    statusText.textContent = status.replace(/_/g, ' ');
    
    const dashboardSection = document.getElementById('dashboard');
    if (qrCard) {
        qrCard.style.display = (status === 'ESPERANDO QR' && dashboardSection.classList.contains('active')) ? 'block' : 'none';
    }
    
    statusCard.className = 'card kpi-card';
    switch(status) {
        case 'CONECTADO': statusCard.classList.add('bg-green'); break;
        case 'DESCONECTADO': case 'ERROR': case 'ERROR DE AUTENTICACIÓN':
            statusCard.classList.add('bg-red');
            break;
        case 'INICIALIZANDO': case 'ESPERANDO QR': case 'DESCONECTANDO': case 'SERVIDOR_REINICIANDO':
            statusCard.classList.add('bg-orange');
            break;
        default: statusCard.classList.add('bg-blue'); break;
    }

    const isConnected = status === 'CONECTADO';
    if(connectBtn) connectBtn.disabled = isConnected || status === 'INICIALIZANDO';
    if(disconnectBtn) disconnectBtn.disabled = !isConnected;
    if(sendManualBtn) sendManualBtn.disabled = !isConnected;
}

export function showFeedback(message, type) {
    const feedbackEl = document.getElementById('send-feedback');
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback-message feedback-${type}`;
    setTimeout(() => {
        feedbackEl.className = 'feedback-message';
        feedbackEl.textContent = '';
    }, 5000);
}

function applyFilters() {
    const searchTicketInput = document.getElementById('search-ticket-input');
    const ticketsTableBody = document.getElementById('tickets-table-body');
    if(!searchTicketInput || !ticketsTableBody) return;

    const searchTerm = searchTicketInput.value.toLowerCase();
    let filteredTickets = allTickets;

    if (currentFilterStatus !== 'all') {
        if (currentFilterStatus === 'open') {
            filteredTickets = filteredTickets.filter(ticket => (ticket.Estado || '').toLowerCase() !== 'cerrado');
        } else {
            filteredTickets = filteredTickets.filter(ticket => (ticket.Estado || '').toLowerCase() === currentFilterStatus.toLowerCase());
        }
    }

    if (searchTerm) {
        filteredTickets = filteredTickets.filter(ticket => {
            const clientName = (ticket['Nombre_Cliente'] || '').toLowerCase();
            const agentName = (ticket['Agente_Asignado'] || '').toLowerCase();
            const ticketId = (ticket['ID_Ticket'] || '').toLowerCase();
            return clientName.includes(searchTerm) || agentName.includes(searchTerm) || ticketId.includes(searchTerm);
        });
    }

    render.renderTickets(ticketsTableBody, filteredTickets);
}

export function initializeUISidebar() {
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidebar = document.querySelector('.sidebar');
    menuToggleBtn?.addEventListener('click', () => sidebar.classList.toggle('show'));
}

// --- INICIO DE LA MODIFICACIÓN ---
export function initializeUINavigation(forceReloadSalesData, loadAndRenderCompanyConfig, loadAndRenderVentasConfig) {
// --- FIN DE LA MODIFICACIÓN ---
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const mainSections = document.querySelectorAll('.main-section');
    const settingsGrid = document.querySelector('.settings-grid');
    const clickableKpis = document.querySelectorAll('.clickable-kpi');
    const backToSettingsButtons = document.querySelectorAll('.back-to-settings-btn');

    function navigateToTab(targetId) {
        navLinks.forEach(navLink => navLink.parentElement.classList.remove('active'));
        
        const linkToActivate = document.querySelector(`.sidebar-nav a[data-target="${targetId}"]`);
        if (linkToActivate) {
             linkToActivate.parentElement.classList.add('active');
        } else {
            // --- INICIO DE LA MODIFICACIÓN ---
            const parentTab = ['planes', 'promociones', 'faq', 'ajustes-empresa', 'zonas-cobertura', 'ajustes-bot-venta'].includes(targetId) ? 'ajustes' : null;
            // --- FIN DE LA MODIFICACIÓN ---
            if (parentTab) {
                const parentLink = document.querySelector(`.sidebar-nav a[data-target="${parentTab}"]`);
                parentLink?.parentElement.classList.add('active');
            }
        }

        mainSections.forEach(section => section.classList.toggle('active', section.id === targetId));

        const salesTabs = ['planes', 'promociones', 'faq', 'zonas-cobertura'];
        if (salesTabs.includes(targetId)) {
            forceReloadSalesData();
        }

        if (targetId === 'ajustes-empresa') {
            loadAndRenderCompanyConfig();
        }

        // --- INICIO DE LA MODIFICACIÓN ---
        if (targetId === 'ajustes-bot-venta') {
            loadAndRenderVentasConfig();
        }
        // --- FIN DE LA MODIFICACIÓN ---
    }

    navLinks.forEach(link => {
        if (link.dataset.target) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToTab(link.dataset.target);
            });
        }
    });

    settingsGrid?.addEventListener('click', (e) => {
        e.preventDefault();
        const card = e.target.closest('.settings-card');
        if (card && card.dataset.target) {
            navigateToTab(card.dataset.target);
        }
    });

    backToSettingsButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToTab(button.dataset.target);
        });
    });

    clickableKpis.forEach(kpi => {
        kpi.addEventListener('click', () => {
            const targetTab = kpi.dataset.targetTab;
            const filter = kpi.dataset.filter;
            if (targetTab) navigateToTab(targetTab);
            if (filter === 'open') {
                currentFilterStatus = 'open';
                document.querySelectorAll('#ticket-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                applyFilters();
            }
        });
    });
}

export function initializeTicketFilters(initialTickets) {
    allTickets = initialTickets;
    const searchTicketInput = document.getElementById('search-ticket-input');
    const ticketFilterButtons = document.getElementById('ticket-filter-buttons');

    searchTicketInput?.addEventListener('input', applyFilters);

    ticketFilterButtons?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentFilterStatus = e.target.dataset.status;
            document.querySelectorAll('#ticket-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            applyFilters();
        }
    });
}
