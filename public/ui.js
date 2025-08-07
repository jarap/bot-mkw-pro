// public/ui.js
// Módulo para manejar las interacciones y actualizaciones de la interfaz de usuario.

import * as api from './api.js';
import * as render from './render.js';

let allTickets = [];
let currentFilterStatus = 'all';

/**
 * Actualiza la interfaz del estado del bot (color y texto).
 * @param {string} status - El nuevo estado del bot.
 */
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

    statusCard.className = 'card kpi-card'; // Reset classes
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

/**
 * Muestra un mensaje de feedback temporal en el formulario de envío manual.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - 'success' o 'error'.
 */
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

/**
 * Muestra u oculta la barra lateral en modo responsive.
 */
export function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('show');
}

/**
 * Cambia a la pestaña de contenido principal especificada.
 * @param {string} targetId - El ID de la sección a mostrar.
 */
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

    // Lógica de carga de datos al cambiar de pestaña
    handleTabLoad(targetId);
}

/**
 * Aplica los filtros de búsqueda y estado a la tabla de tickets.
 */
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

/**
 * Maneja la carga de datos necesaria cuando se activa una pestaña.
 * @param {string} targetId - El ID de la pestaña activada.
 */
async function handleTabLoad(targetId) {
    const ticketsTableBody = document.getElementById('tickets-table-body');
    const sessionsTableBody = document.getElementById('sessions-table-body');
    const planesTableBody = document.getElementById('planes-table-body');
    const promosTableBody = document.getElementById('promos-table-body');
    const faqTableBody = document.getElementById('faq-table-body');
    const companyConfigForm = document.getElementById('company-config-form');

    if ((targetId === 'history' || targetId === 'dashboard') && allTickets.length === 0) {
        try {
            allTickets = await api.getTickets();
            render.renderTickets(ticketsTableBody, allTickets);
            render.renderDashboardCharts(allTickets);
        } catch (e) { console.error("Error al cargar tickets:", e); }
    } 
    if (targetId === 'sessions') {
        try {
            const sessions = await api.getActiveSessions();
            render.renderActiveSessions(sessionsTableBody, sessions);
        } catch (e) { console.error("Error al cargar sesiones:", e); }
    }
    if (['planes', 'promociones', 'faq'].includes(targetId)) {
        try {
            const salesData = await api.getSalesData();
            render.renderPlanes(planesTableBody, salesData.planes);
            render.renderPromos(promosTableBody, salesData.promociones);
            render.renderFaqs(faqTableBody, salesData.preguntasFrecuentes);
        } catch (e) { console.error("Error al cargar datos de ventas:", e); }
    }
    if (targetId === 'ajustes-empresa') {
        try {
            const config = await api.getCompanyConfig();
            render.renderCompanyConfigForm(companyConfigForm, config);
        } catch (e) { console.error("Error al cargar config de empresa:", e); }
    }
}

// --- Inicializadores de Eventos ---
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
