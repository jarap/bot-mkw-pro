// public/ui.js
// Módulo para manejar las interacciones y actualizaciones de la interfaz de usuario.

import * as api from './api.js';
import * as render from './render.js';

let allTickets = [];
let currentFilterStatus = 'all';

// --- INICIO DE LA MODIFICACIÓN ---
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
// --- FIN DE LA MODIFICACIÓN ---

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
    switch (status) {
        case 'CONECTADO': statusCard.classList.add('bg-green'); break;
        case 'DESCONECTADO': case 'ERROR': statusCard.classList.add('bg-red'); break;
        case 'INICIALIZANDO': case 'ESPERANDO QR': case 'DESCONECTANDO': statusCard.classList.add('bg-orange'); break;
        default: statusCard.classList.add('bg-blue'); break;
    }

    const isConnected = status === 'CONECTADO';
    if(connectBtn) connectBtn.disabled = isConnected || status === 'INICIALIZANDO';
    if(disconnectBtn) disconnectBtn.disabled = !isConnected;
    if(sendManualBtn) sendManualBtn.disabled = !isConnected;
}

export function showFeedback(message, type) {
    const sendFeedback = document.getElementById('send-feedback');
    if (!sendFeedback) return;
    sendFeedback.textContent = message;
    sendFeedback.className = `feedback-message feedback-${type}`;
    setTimeout(() => {
        sendFeedback.className = 'feedback-message';
        sendFeedback.textContent = '';
    }, 5000);
}

export function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('show');
}

export function navigateToTab(targetId) {
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const mainSections = document.querySelectorAll('.main-section');

    console.log(`[PUNTO DE CONTROL] Navegando a la pestaña: ${targetId}`);
    navLinks.forEach(navLink => navLink.parentElement.classList.remove('active'));
    
    const linkToActivate = document.querySelector(`.sidebar-nav a[data-target="${targetId}"]`);
    if (linkToActivate) {
        linkToActivate.parentElement.classList.add('active');
    } else {
        const ajustesLink = document.querySelector('.sidebar-nav a[data-target="ajustes"]');
        if (ajustesLink) ajustesLink.parentElement.classList.add('active');
    }

    mainSections.forEach(section => section.classList.toggle('active', section.id === targetId));
    handleTabLoad(targetId);
}

function applyFilters() {
    const searchTicketInput = document.getElementById('search-ticket-input');
    const ticketsTableBody = document.getElementById('tickets-table-body');
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
        filteredTickets = filteredTickets.filter(ticket => 
            Object.values(ticket).some(val => 
                String(val).toLowerCase().includes(searchTerm)
            )
        );
    }

    render.renderTickets(ticketsTableBody, filteredTickets);
}

async function handleTabLoad(targetId) {
    const ticketsTableBody = document.getElementById('tickets-table-body');
    const sessionsTableBody = document.getElementById('sessions-table-body');
    const planesTableBody = document.getElementById('planes-table-body');
    const promosTableBody = document.getElementById('promos-table-body');
    const faqTableBody = document.getElementById('faq-table-body');
    const companyConfigForm = document.getElementById('company-config-form');

    switch (targetId) {
        case 'history':
        case 'dashboard':
            if (allTickets.length === 0) {
                try {
                    allTickets = await api.getTickets();
                    render.renderTickets(ticketsTableBody, allTickets);
                    render.renderDashboardCharts(allTickets);
                } catch (e) { console.error("Error al cargar tickets:", e); }
            }
            break;
        case 'sessions':
            try {
                const sessions = await api.getActiveSessions();
                render.renderActiveSessions(sessionsTableBody, sessions);
            } catch (e) { console.error("Error al cargar sesiones activas:", e); }
            break;
        case 'planes':
            try {
                const salesData = await api.getSalesData();
                render.renderPlanes(planesTableBody, salesData.planes);
            } catch (e) { console.error("Error al cargar planes:", e); }
            break;
        case 'promociones':
            try {
                const salesData = await api.getSalesData();
                render.renderPromos(promosTableBody, salesData.promociones, salesData.zonasCobertura);
            } catch (e) { console.error("Error al cargar promociones:", e); }
            break;
        case 'faq':
            try {
                const salesData = await api.getSalesData();
                render.renderFaqs(faqTableBody, salesData.preguntasFrecuentes);
            } catch (e) { console.error("Error al cargar preguntas frecuentes:", e); }
            break;
        case 'ajustes-empresa':
            try {
                const config = await api.getCompanyConfig();
                render.renderCompanyConfigForm(companyConfigForm, config);
            } catch (e) { console.error("Error al cargar config de empresa:", e); }
            break;
    }
}

export function initializeUISidebar() {
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    menuToggleBtn?.addEventListener('click', toggleSidebar);
}

export function initializeUINavigation() {
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const settingsGrid = document.querySelector('.settings-grid');
    const clickableKpis = document.querySelectorAll('.clickable-kpi');

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

export function initializeTicketFilters() {
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
