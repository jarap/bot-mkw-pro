// public/render.js
// Módulo para renderizar (dibujar) HTML en el DOM.

/**
 * Genera el HTML para el icono y texto de sentimiento.
 * @param {string} sentiment - El sentimiento (ej. 'contento', 'enojado').
 * @returns {string} El HTML del badge de sentimiento.
 */
function getSentimentHTML(sentiment) {
    if (!sentiment) {
        return `<span class="sentiment-icon sentiment-neutro"><i class="fas fa-question-circle"></i> N/A</span>`;
    }
    const sentimentLower = sentiment.toLowerCase();
    const icons = {
        'enojado': 'fa-angry',
        'frustrado': 'fa-flushed',
        'neutro': 'fa-meh',
        'contento': 'fa-smile'
    };
    const iconClass = icons[sentimentLower] || 'fa-question-circle';
    const capitalizedSentiment = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
    return `<span class="sentiment-icon sentiment-${sentimentLower}"><i class="fas ${iconClass}"></i> ${capitalizedSentiment}</span>`;
}

export function renderTickets(tableBody, tickets) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!tickets || tickets.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6">No se encontraron tickets.</td></tr>';
        return;
    }
    tickets.forEach(ticket => {
        const row = tableBody.insertRow();
        const statusClass = (ticket.Estado || 'n/a').toLowerCase().replace(/ /g, '-');
        const sanitizedTicket = JSON.stringify(ticket).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        row.innerHTML = `
            <td>${ticket.Timestamp || 'N/A'}</td>
            <td>${ticket['Nombre_Cliente'] || 'N/A'}</td>
            <td>${ticket['Agente_Asignado'] || 'N/A'}</td>
            <td><span class="status-badge status-${statusClass}">${ticket.Estado || 'N/A'}</span></td>
            <td>${getSentimentHTML(ticket.Sentimiento)}</td>
            <td><button class="action-btn-small view-ticket-btn" data-ticket='${sanitizedTicket}'><i class="fas fa-eye"></i> Ver</button></td>
        `;
    });
}

export function renderActiveSessions(tableBody, sessions) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!sessions || sessions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No hay sesiones de soporte activas.</td></tr>';
        return;
    }
    sessions.forEach(session => {
        const row = tableBody.insertRow();
        const now = Date.now();
        const lastActivity = new Date(session.lastActivity).toLocaleString('es-AR');
        const activeTimeMs = now - session.lastActivity;
        const activeTimeMinutes = Math.floor(activeTimeMs / 60000);
        const activeTimeSeconds = Math.floor((activeTimeMs % 60000) / 1000);
        const status = (session.status || 'N/A').replace('_', ' ');
        const statusClass = status.toLowerCase().replace(/ /g, '-');
        row.innerHTML = `
            <td>${session.clientName || 'N/A'}</td>
            <td>${session.agentName || 'Esperando agente...'}</td>
            <td><span class="status-badge status-${statusClass}">${status}</span></td>
            <td>${activeTimeMinutes}m ${activeTimeSeconds}s</td>
            <td>${lastActivity}</td>
        `;
    });
}

export function renderDashboardCharts(tickets) {
    const statusCounts = tickets.reduce((acc, ticket) => {
        const status = ticket.Estado || 'Sin Estado';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const sentimentCounts = tickets.reduce((acc, ticket) => {
        const sentiment = ticket.Sentimiento || 'neutro';
        acc[sentiment] = (acc[sentiment] || 0) + 1;
        return acc;
    }, {});

    const statusCtx = document.getElementById('statusChart')?.getContext('2d');
    if (statusCtx) {
        if (window.statusChartInstance) window.statusChartInstance.destroy();
        window.statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#ffbb55', '#7380ec', '#677483', '#dce1eb'], borderColor: '#f6f6f9', borderWidth: 2 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
        });
    }

    const sentimentCtx = document.getElementById('sentimentChart')?.getContext('2d');
    if (sentimentCtx) {
        const sentimentLabels = ['contento', 'neutro', 'frustrado', 'enojado'];
        const sentimentData = sentimentLabels.map(label => sentimentCounts[label] || 0);
        if (window.sentimentChartInstance) window.sentimentChartInstance.destroy();
        window.sentimentChartInstance = new Chart(sentimentCtx, {
            type: 'bar',
            data: {
                labels: sentimentLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                datasets: [{ data: sentimentData, backgroundColor: ['#41f1b6', '#dce1eb', '#ffbb55', '#ff7782'], borderRadius: 5 }]
            },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } }, plugins: { legend: { display: false } } }
        });
    }
}

export function renderPlanes(tableBody, planes) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    (planes || []).forEach(plan => {
        const row = tableBody.insertRow();
        const sanitizedItem = JSON.stringify(plan).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        row.innerHTML = `
            <td>${plan.nombre || 'N/A'}</td>
            <td>$${(plan.precioMensual || 0).toLocaleString('es-AR')}</td>
            <td>${plan.velocidadBajada || 'N/A'} / ${plan.velocidadSubida || 'N/A'} Mbps</td>
            <td>${plan.idealPara || 'N/A'}</td>
            <td>
                <button class="action-btn-small edit-btn" data-type="planes" data-item='${sanitizedItem}'><i class="fas fa-edit"></i></button>
                <button class="action-btn-small delete-btn" data-type="planes" data-id="${plan.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

export function renderPromos(tableBody, promos, zonas) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    (promos || []).forEach(promo => {
        const row = tableBody.insertRow();
        const sanitizedItem = JSON.stringify(promo).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        const status = promo.activo ? '<span class="status-badge status-en-progreso">Activa</span>' : '<span class="status-badge status-cerrado">Inactiva</span>';
        const validez = promo.fechaInicio && promo.fechaFin ? `${new Date(promo.fechaInicio.seconds * 1000).toLocaleDateString()} - ${new Date(promo.fechaFin.seconds * 1000).toLocaleDateString()}` : 'Indefinida';
        row.innerHTML = `
            <td>${promo.nombre || 'N/A'}</td>
            <td>${promo.descripcion || 'N/A'}</td>
            <td>${status}</td>
            <td>${validez}</td>
            <td>
                <button class="action-btn-small edit-btn" data-type="promociones" data-item='${sanitizedItem}'><i class="fas fa-edit"></i></button>
                <button class="action-btn-small delete-btn" data-type="promociones" data-id="${promo.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

export function renderFaqs(tableBody, faqs) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    (faqs || []).forEach(faq => {
        const row = faqTableBody.insertRow();
        const sanitizedItem = JSON.stringify(faq).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        row.innerHTML = `
            <td>${faq.pregunta || 'N/A'}</td>
            <td>${faq.respuesta || 'N/A'}</td>
            <td>
                <button class="action-btn-small edit-btn" data-type="preguntasFrecuentes" data-item='${sanitizedItem}'><i class="fas fa-edit"></i></button>
                <button class="action-btn-small delete-btn" data-type="preguntasFrecuentes" data-id="${faq.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

export function renderCompanyConfigForm(form, config) {
    if (!form) return;
    const fieldLabels = {
        nombreEmpresa: 'Nombre de la Empresa',
        direccion: 'Dirección',
        telefono: 'Teléfono de Contacto',
        email: 'Email de Contacto',
        logoUrl: 'URL del Logo'
    };
    let formHTML = '';
    for (const key in config) {
        if (Object.hasOwnProperty.call(config, key)) {
            const label = fieldLabels[key] || key;
            formHTML += `
                <div class="form-group">
                    <label for="company-${key}">${label}</label>
                    <input type="text" id="company-${key}" name="${key}" value="${config[key] || ''}">
                </div>
            `;
        }
    }
    formHTML += `<button type="submit">Guardar Configuración de Empresa</button>`;
    form.innerHTML = formHTML;
}
