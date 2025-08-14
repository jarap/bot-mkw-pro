// public/ui.js
// Módulo para manejar las interacciones y actualizaciones de la interfaz de usuario.

import * as render from './render.js';

let allTickets = [];
let currentFilterStatus = 'all';

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
        case 'CONECTADO':
            statusCard.classList.add('bg-blue');
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.disabled = false;
            if (sendManualBtn) sendManualBtn.disabled = false;
            break;
        case 'DESCONECTADO':
        case 'ERROR':
        case 'ERROR DE AUTENTICACIÓN':
            statusCard.classList.add('bg-red');
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = true;
            if (sendManualBtn) sendManualBtn.disabled = true;
            break;
        default:
            statusCard.classList.add('bg-orange');
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.disabled = true;
            if (sendManualBtn) sendManualBtn.disabled = true;
            break;
    }
}

function navigateToTab(targetId) {
    document.querySelectorAll('.main-section').forEach(section => {
        section.classList.remove('active');
    });
    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
}

export function initializeUISidebar() {
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    menuToggle?.addEventListener('click', () => {
        sidebar?.classList.toggle('show');
    });
}

export function initializeUINavigation(callbacks) {
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const settingsCards = document.querySelectorAll('.settings-card');
    const backToSettingsButtons = document.querySelectorAll('.back-to-settings');
    const clickableKpis = document.querySelectorAll('.clickable-kpi');

    const handleNavigation = (targetId, clickedElement) => {
        navigateToTab(targetId);
        
        navLinks.forEach(l => l.parentElement.classList.remove('active'));
        if (clickedElement) {
            clickedElement.closest('li').classList.add('active');
        }

        if (callbacks[targetId]) {
            callbacks[targetId]();
        }
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            handleNavigation(link.dataset.target, link);
        });
    });

    settingsCards.forEach(card => {
        card.addEventListener('click', () => {
            const targetId = card.dataset.target;
            // No necesitamos resaltar el menú aquí, solo navegar
            handleNavigation(targetId, null);
        });
    });

    backToSettingsButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = button.dataset.target || 'settings';
            const targetLink = document.querySelector(`.sidebar-nav a[data-target="${targetId}"]`);
            handleNavigation(targetId, targetLink);
        });
    });

    clickableKpis.forEach(kpi => {
        kpi.addEventListener('click', () => {
            const targetTab = kpi.dataset.targetTab;
            const filter = kpi.dataset.filter;
            if (targetTab) {
                const correspondingLink = document.querySelector(`.sidebar-nav a[data-target="${targetTab}"]`);
                if (correspondingLink) {
                    handleNavigation(targetTab, correspondingLink);
                }
            }
            if (filter === 'open') {
                const openFilterButton = document.querySelector('#ticket-filter-buttons .filter-btn[data-status="Pendiente"]');
                openFilterButton?.click();
            }
        });
    });
}

function applyFilters() {
    const searchTicketInput = document.getElementById('search-ticket-input');
    const searchTerm = searchTicketInput ? searchTicketInput.value.toLowerCase() : '';
    
    let filteredTickets = allTickets;

    if (currentFilterStatus !== 'all') {
        if (currentFilterStatus === 'open') {
            filteredTickets = allTickets.filter(ticket => ticket.Estado === 'Pendiente' || ticket.Estado === 'En Progreso');
        } else {
            filteredTickets = allTickets.filter(ticket => ticket.Estado === currentFilterStatus);
        }
    }

    if (searchTerm) {
        filteredTickets = filteredTickets.filter(ticket => 
            (ticket['Nombre_Cliente'] && ticket['Nombre_Cliente'].toLowerCase().includes(searchTerm)) ||
            (ticket['Numero_Cliente'] && ticket['Numero_Cliente'].includes(searchTerm))
        );
    }
    
    const ticketsTableBody = document.getElementById('tickets-table-body');
    render.renderTickets(ticketsTableBody, filteredTickets);
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

export function showFeedback(message, type = 'info') {
    const feedbackContainer = document.createElement('div');
    feedbackContainer.className = `feedback-toast ${type}`;
    feedbackContainer.textContent = message;

    document.body.appendChild(feedbackContainer);
    setTimeout(() => {
        feedbackContainer.classList.add('show');
    }, 10);
    setTimeout(() => {
        feedbackContainer.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(feedbackContainer)) {
                document.body.removeChild(feedbackContainer);
            }
        }, 500);
    }, 4000);
}

export function applyRolePermissions(role) {
    console.log(`Aplicando permisos para el rol: ${role}`);

    const adminOnlyElements = document.querySelectorAll('.admin-only');
    const supervisorOnlyElements = document.querySelectorAll('.supervisor-only');

    if (role === 'operator') {
        adminOnlyElements.forEach(el => el.style.display = 'none');
        supervisorOnlyElements.forEach(el => el.style.display = 'none');
    } else if (role === 'supervisor') {
        adminOnlyElements.forEach(el => el.style.display = 'none');
    }
}
