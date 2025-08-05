document.addEventListener('DOMContentLoaded', () => {
    console.log('[PUNTO DE CONTROL] El DOM está cargado. Iniciando script client.js.');

    // --- Referencias a elementos ---
    const ticketsTableBody = document.getElementById('tickets-table-body');
    const sessionsTableBody = document.getElementById('sessions-table-body');
    const planesTableBody = document.getElementById('planes-table-body');
    const promosTableBody = document.getElementById('promos-table-body');
    const faqTableBody = document.getElementById('faq-table-body');
    const configForm = document.getElementById('config-form');
    const openTicketsValue = document.getElementById('open-tickets-value');
    const uniqueClientsValue = document.getElementById('unique-clients-value');

    // Modals
    const ticketModalOverlay = document.getElementById('ticket-modal-overlay');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalCloseTicketBtn = document.getElementById('modal-close-ticket-btn');
    
    const salesModalOverlay = document.getElementById('sales-modal-overlay');
    const closeSalesModalBtn = document.getElementById('close-sales-modal-btn');
    const salesForm = document.getElementById('sales-form');
    const salesModalTitle = document.getElementById('sales-modal-title');
    const salesFormFields = document.getElementById('sales-form-fields');
    
    const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalText = document.getElementById('confirm-modal-text');
    const confirmModalOk = document.getElementById('confirm-modal-ok');
    const confirmModalCancel = document.getElementById('confirm-modal-cancel');

    // Botones
    const addPlanBtn = document.getElementById('add-plan-btn');
    const addPromoBtn = document.getElementById('add-promo-btn');
    const addFaqBtn = document.getElementById('add-faq-btn');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const sendManualBtn = document.getElementById('send-manual-btn');

    // Otros
    const sidebar = document.querySelector('.sidebar');
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const mainSections = document.querySelectorAll('.main-section');
    const statusText = document.getElementById('status-text');
    const statusCard = statusText ? statusText.closest('.kpi-card') : null;
    const qrCard = document.getElementById('qr-card');
    const qrImage = document.getElementById('qr-image');
    const logIframe = document.getElementById('log-iframe');
    const sendMessageForm = document.getElementById('send-message-form');
    const manualRecipient = document.getElementById('manual-recipient');
    const manualMessage = document.getElementById('manual-message');
    const sendFeedback = document.getElementById('send-feedback');
    const searchTicketInput = document.getElementById('search-ticket-input');
    const ticketFilterButtons = document.getElementById('ticket-filter-buttons');
    const clickableKpis = document.querySelectorAll('.clickable-kpi');
    const settingsGrid = document.querySelector('.settings-grid');

    // --- Almacén de datos ---
    let allTickets = [];
    let salesData = { planes: [], promociones: [], preguntasFrecuentes: [], configuracionGeneral: {}, zonasCobertura: { listado: [] } };
    let ticketsDataLoaded = false;
    let salesDataLoaded = false;
    let currentFilterStatus = 'all';
    let statusChartInstance = null;
    let sentimentChartInstance = null;

    // --- LÓGICA DE NAVEGACIÓN ---
    if (menuToggleBtn && sidebar) {
        menuToggleBtn.addEventListener('click', () => sidebar.classList.toggle('show'));
    }

    function navigateToTab(targetId) {
        console.log(`[PUNTO DE CONTROL] Navegando a la pestaña: ${targetId}`);
        navLinks.forEach(navLink => navLink.parentElement.classList.remove('active'));
        
        const linkToActivate = document.querySelector(`.sidebar-nav a[data-target="${targetId}"]`);
        if(linkToActivate) {
             linkToActivate.parentElement.classList.add('active');
        } else {
            // Si no hay un link directo (ej. sub-menú de ajustes), activamos el principal
            const ajustesLink = document.querySelector('.sidebar-nav a[data-target="ajustes"]');
            if (ajustesLink) ajustesLink.parentElement.classList.add('active');
        }

        mainSections.forEach(section => section.classList.toggle('active', section.id === targetId));

        if ((targetId === 'history' || targetId === 'dashboard') && !ticketsDataLoaded) {
            fetchAndRenderTickets();
        } 
        if (['planes', 'promociones', 'faq', 'configuracion', 'ajustes'].includes(targetId) && !salesDataLoaded) {
            fetchAndRenderSalesData();
        }
        if (targetId === 'sessions') {
            fetchAndRenderActiveSessions();
        }
    }

    if (navLinks && mainSections) {
        navLinks.forEach(link => {
            if (link.dataset.target) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigateToTab(link.dataset.target);
                });
            }
        });
    }

    if (settingsGrid) {
        settingsGrid.addEventListener('click', (e) => {
            e.preventDefault();
            const card = e.target.closest('.settings-card');
            if (card && card.dataset.target) {
                navigateToTab(card.dataset.target);
            }
        });
    }

    // --- CONEXIÓN WEBSOCKET ---
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('[PUNTO DE CONTROL] Conexión WebSocket establecida.');
        fetch('/api/status').then(res => res.json()).then(data => updateStatusUI(data.status));
        fetchAndRenderTickets(); 
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'status') {
                updateStatusUI(message.data);
            } else if (message.type === 'qr') {
                qrImage.src = message.data;
                if(qrCard) qrCard.style.display = 'block';
            } else if (message.type === 'log') {
                if (logIframe && logIframe.contentWindow) logIframe.contentWindow.postMessage(message.data, '*');
            } else if (message.type === 'kpiUpdate') {
                if (openTicketsValue && message.data.openTickets !== undefined) openTicketsValue.textContent = message.data.openTickets;
            } else if (message.type === 'sessionsChanged') {
                if (document.getElementById('sessions').classList.contains('active')) {
                    fetchAndRenderActiveSessions();
                }
            }
        } catch (error) {
            console.error("Error procesando mensaje del WebSocket:", error);
        }
    };

    ws.onclose = () => {
        console.log('[PUNTO DE CONTROL] Conexión WebSocket perdida. Recargando...');
        updateStatusUI('SERVIDOR_REINICIANDO');
        setTimeout(() => window.location.reload(), 3000);
    };

    // --- LÓGICA DE DATOS DE VENTAS ---
    async function fetchAndRenderSalesData() {
        console.log('[PUNTO DE CONTROL] Iniciando carga de datos de ventas...');
        try {
            const response = await fetch('/api/salesdata');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message);
            salesData = result.data;
            salesDataLoaded = true;
            console.log('[PUNTO DE CONTROL] Datos de ventas cargados:', salesData);
            
            renderPlanes(salesData.planes);
            renderPromos(salesData.promociones);
            renderFaqs(salesData.preguntasFrecuentes);
            renderConfigForm(salesData.configuracionGeneral, salesData.zonasCobertura);
        } catch (error) {
            console.error('[ERROR] No se pudieron cargar los datos de ventas:', error);
        }
    }

    function renderPlanes(planes) {
        if (!planesTableBody) return;
        planesTableBody.innerHTML = '';
        (planes || []).forEach(plan => {
            const row = planesTableBody.insertRow();
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

    function renderPromos(promos) {
        if (!promosTableBody) return;
        promosTableBody.innerHTML = '';
        (promos || []).forEach(promo => {
            const row = promosTableBody.insertRow();
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

    function renderFaqs(faqs) {
        if (!faqTableBody) return;
        faqTableBody.innerHTML = '';
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

    function renderConfigForm(config, zonas) {
        if (!configForm) return;
        configForm.innerHTML = `
            <div class="form-group">
                <label>Costo de Instalación</label>
                <input type="number" name="costoInstalacion" value="${config.costoInstalacion || 0}">
            </div>
            <div class="form-group">
                <label>Descripción General (para el Bot)</label>
                <textarea name="descripcionGeneral" rows="3">${config.descripcionGeneral || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Zonas de Cobertura (una por línea)</label>
                <textarea name="zonas" rows="5">${(zonas.listado || []).join('\n')}</textarea>
            </div>
            <button type="submit">Guardar Configuración</button>
        `;

        configForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(configForm);
            const newConfig = {
                costoInstalacion: Number(formData.get('costoInstalacion')),
                descripcionGeneral: formData.get('descripcionGeneral'),
            };
            const newZonas = {
                listado: formData.get('zonas').split('\n').map(z => z.trim()).filter(z => z)
            };

            try {
                await fetch(`/api/data/knowledge/${config.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) });
                await fetch(`/api/data/knowledge/${zonas.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newZonas) });
                showCustomAlert('Éxito', 'Configuración guardada.');
                salesDataLoaded = false;
                fetchAndRenderSalesData();
            } catch (error) {
                showCustomAlert('Error', 'No se pudo guardar la configuración.');
            }
        };
    }

    // --- LÓGICA DEL MODAL DE VENTAS ---
    function openSalesModal(type, data = {}) {
        const mode = data.id ? 'edit' : 'add';
        salesModalTitle.textContent = `${mode === 'add' ? 'Añadir' : 'Editar'} ${type}`;
        
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
                const zonasCheckboxes = salesData.zonasCobertura.listado.map(zona => `
                    <label><input type="checkbox" name="zonasAplicables" value="${zona}" ${(data.zonasAplicables || []).includes(zona) ? 'checked' : ''}> ${zona}</label>
                `).join('');
                formHTML = `
                    <input type="text" name="nombre" placeholder="Nombre de la Promoción" value="${data.nombre || ''}" required>
                    <textarea name="descripcion" rows="3" placeholder="Descripción">${data.descripcion || ''}</textarea>
                    <label><input type="checkbox" name="activo" ${data.activo ? 'checked' : ''}> Promoción Activa</label>
                    <div class="checkbox-group">
                        <label>Zonas Aplicables (si no se marca ninguna, aplica a todas)</label>
                        ${zonasCheckboxes}
                    </div>
                `;
                break;
            case 'preguntasFrecuentes':
                formHTML = `
                    <input type="text" name="pregunta" placeholder="Pregunta del cliente" value="${data.pregunta || ''}" required>
                    <textarea name="respuesta" rows="4" placeholder="Respuesta oficial">${data.respuesta || ''}</textarea>
                `;
                break;
        }
        salesFormFields.innerHTML = formHTML;
        
        salesForm.dataset.type = type;
        salesForm.dataset.id = data.id || '';

        salesModalOverlay.classList.add('show');
    }

    function closeSalesModal() {
        salesModalOverlay.classList.remove('show');
    }

    if(addPlanBtn) addPlanBtn.addEventListener('click', () => openSalesModal('planes'));
    if(addPromoBtn) addPromoBtn.addEventListener('click', () => openSalesModal('promociones'));
    if(addFaqBtn) addFaqBtn.addEventListener('click', () => openSalesModal('preguntasFrecuentes'));
    if(closeSalesModalBtn) closeSalesModalBtn.addEventListener('click', closeSalesModal);
    if(salesModalOverlay) salesModalOverlay.addEventListener('click', (e) => { if(e.target === salesModalOverlay) closeSalesModal() });

    document.body.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        const deleteButton = e.target.closest('.delete-btn');

        if (editButton) {
            const type = editButton.dataset.type;
            const itemData = JSON.parse(editButton.dataset.item.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
            openSalesModal(type, itemData);
        }

        if (deleteButton) {
            const type = deleteButton.dataset.type;
            const id = deleteButton.dataset.id;
            showConfirmationModal('Confirmar Eliminación', '¿Estás seguro?', async () => {
                await fetch(`/api/data/${type}/${id}`, { method: 'DELETE' });
                salesDataLoaded = false;
                fetchAndRenderSalesData();
            });
        }
    });

    if(salesForm) {
        salesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const { type, id } = e.target.dataset;
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            if (type === 'promociones') {
                data.activo = data.activo === 'on';
                data.zonasAplicables = formData.getAll('zonasAplicables');
            }
            if (type === 'planes') {
                data.precioMensual = Number(data.precioMensual);
                data.velocidadBajada = Number(data.velocidadBajada);
                data.velocidadSubida = Number(data.velocidadSubida);
            }

            const url = id ? `/api/data/${type}/${id}` : `/api/data/${type}`;
            const method = id ? 'PUT' : 'POST';

            await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            closeSalesModal();
            salesDataLoaded = false;
            fetchAndRenderSalesData();
        });
    }

    // --- LÓGICA DE TICKETS, SESIONES, GRÁFICOS, ETC. ---
    async function fetchAndRenderTickets() {
        if (ticketsDataLoaded) return;
        console.log('[PUNTO DE CONTROL] Iniciando carga de tickets...');
        try {
            const response = await fetch('/api/tickets');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message);
            allTickets = result.data; 
            ticketsDataLoaded = true;
            console.log(`[PUNTO DE CONTROL] ${allTickets.length} tickets cargados.`);
            applyFilters(); 
            renderDashboardCharts(allTickets);
        } catch (error) {
            console.error('[ERROR] No se pudieron cargar los tickets:', error);
        }
    }

    async function fetchAndRenderActiveSessions() {
        if (!sessionsTableBody) return;
        sessionsTableBody.innerHTML = '<tr><td colspan="5">Cargando sesiones...</td></tr>';
        try {
            const response = await fetch('/api/activesessions');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message);
            renderActiveSessions(result.data);
        } catch (error) {
            console.error('[ERROR] No se pudieron cargar las sesiones activas:', error);
            sessionsTableBody.innerHTML = '<tr><td colspan="5" class="error-message">No se pudieron cargar las sesiones.</td></tr>';
        }
    }

    function renderTickets(tickets) {
        if (!ticketsTableBody) return;
        ticketsTableBody.innerHTML = '';
        if (tickets.length === 0) {
            ticketsTableBody.innerHTML = '<tr><td colspan="6">No se encontraron tickets que coincidan.</td></tr>';
            return;
        }
        tickets.forEach(ticket => {
            const row = ticketsTableBody.insertRow();
            const statusCell = `<td><span class="status-badge status-${(ticket.Estado || '').toLowerCase().replace(/ /g, '-')}">${ticket.Estado || 'N/A'}</span></td>`;
            const sentimentCell = `<td>${getSentimentHTML(ticket.Sentimiento)}</td>`;
            const sanitizedTicket = JSON.stringify(ticket).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            const viewButton = `<button class="action-btn-small view-ticket-btn" data-ticket='${sanitizedTicket}'><i class="fas fa-eye"></i> Ver</button>`;
            
            row.innerHTML = `
                <td>${ticket.Timestamp || 'N/A'}</td>
                <td>${ticket['Nombre_Cliente'] || 'N/A'}</td>
                <td>${ticket['Agente_Asignado'] || 'N/A'}</td>
                ${statusCell}
                ${sentimentCell}
                <td>${viewButton}</td>
            `;
        });
    }

    function renderActiveSessions(sessions) {
        if (!sessionsTableBody) return;
        sessionsTableBody.innerHTML = '';
        if (sessions.length === 0) {
            sessionsTableBody.innerHTML = '<tr><td colspan="5">No hay sesiones de soporte activas.</td></tr>';
            return;
        }
        sessions.forEach(session => {
            const row = sessionsTableBody.insertRow();
            const now = Date.now();
            const lastActivity = new Date(session.lastActivity).toLocaleString('es-AR');
            const activeTimeMs = now - session.lastActivity;
            const activeTimeMinutes = Math.floor(activeTimeMs / 60000);
            const activeTimeSeconds = Math.floor((activeTimeMs % 60000) / 1000);
            const activeTimeString = `${activeTimeMinutes}m ${activeTimeSeconds}s`;
            const status = (session.status || 'N/A').replace('_', ' ');
            const statusClass = status.toLowerCase().replace(/ /g, '-');
            row.innerHTML = `
                <td>${session.clientName || 'N/A'}</td>
                <td>${session.agentName || 'Esperando agente...'}</td>
                <td><span class="status-badge status-${statusClass}">${status}</span></td>
                <td>${activeTimeString}</td>
                <td>${lastActivity}</td>
            `;
        });
    }

    function renderDashboardCharts(tickets) {
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
            if (statusChartInstance) statusChartInstance.destroy();
            statusChartInstance = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(statusCounts),
                    datasets: [{
                        label: 'Tickets por Estado',
                        data: Object.values(statusCounts),
                        backgroundColor: [ '#ffbb55', '#7380ec', '#677483', '#dce1eb' ],
                        borderColor: '#f6f6f9',
                        borderWidth: 2
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
            });
        }

        const sentimentCtx = document.getElementById('sentimentChart')?.getContext('2d');
        if (sentimentCtx) {
            const sentimentLabels = ['contento', 'neutro', 'frustrado', 'enojado'];
            const sentimentData = sentimentLabels.map(label => sentimentCounts[label] || 0);

            if (sentimentChartInstance) sentimentChartInstance.destroy();
            sentimentChartInstance = new Chart(sentimentCtx, {
                type: 'bar',
                data: {
                    labels: sentimentLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                    datasets: [{
                        label: 'Conteo de Sentimientos',
                        data: sentimentData,
                        backgroundColor: [ '#41f1b6', '#dce1eb', '#ffbb55', '#ff7782' ],
                        borderRadius: 5
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } }, plugins: { legend: { display: false } } }
            });
        }
    }
    
    // --- EVENT LISTENERS (EXISTENTES) ---
    if(searchTicketInput) {
        searchTicketInput.addEventListener('input', applyFilters);
    }

    if(ticketFilterButtons) {
        ticketFilterButtons.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                currentFilterStatus = e.target.dataset.status;
                document.querySelectorAll('#ticket-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                applyFilters();
            }
        });
    }

    if(clickableKpis) {
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
    
    // --- LÓGICA DE MODALS (EXISTENTES) ---
    function showTicketModal(ticket) {
        const modalTicketId = document.getElementById('modal-ticket-id');
        const modalTicketDate = document.getElementById('modal-ticket-date');
        const modalTicketClient = document.getElementById('modal-ticket-client');
        const modalTicketNumber = document.getElementById('modal-ticket-number');
        const modalTicketAgent = document.getElementById('modal-ticket-agent');
        const modalTicketStatus = document.getElementById('modal-ticket-status');
        const modalTicketSentiment = document.getElementById('modal-ticket-sentiment');
        const modalTicketMessage = document.getElementById('modal-ticket-message');
        const modalCloseTicketBtn = document.getElementById('modal-close-ticket-btn');

        if(modalTicketId) modalTicketId.textContent = ticket.ID_Ticket || 'N/A';
        if(modalTicketDate) modalTicketDate.textContent = ticket.Timestamp || 'N/A';
        if(modalTicketClient) modalTicketClient.textContent = ticket['Nombre_Cliente'] || 'N/A';
        if(modalTicketNumber) modalTicketNumber.textContent = ticket['Numero_Cliente'] || 'N/A';
        if(modalTicketAgent) modalTicketAgent.textContent = ticket['Agente_Asignado'] || 'N/A';
        if(modalTicketStatus) modalTicketStatus.innerHTML = `<span class="status-badge status-${(ticket.Estado || '').toLowerCase().replace(/ /g, '-')}">${ticket.Estado || 'N/A'}</span>`;
        if(modalTicketSentiment) modalTicketSentiment.innerHTML = getSentimentHTML(ticket.Sentimiento);
        if(modalTicketMessage) modalTicketMessage.textContent = ticket['Mensaje_Inicial'] || 'No disponible.';
        if(modalCloseTicketBtn) {
            modalCloseTicketBtn.dataset.ticketId = ticket.ID_Ticket;
            modalCloseTicketBtn.disabled = (ticket.Estado || '').toLowerCase() === 'cerrado';
        }
        if(ticketModalOverlay) ticketModalOverlay.classList.add('show');
    }

    function hideTicketModal() {
        if(ticketModalOverlay) ticketModalOverlay.classList.remove('show');
    }

    if (ticketsTableBody) {
        ticketsTableBody.addEventListener('click', (e) => {
            const viewButton = e.target.closest('.view-ticket-btn');
            if (viewButton) {
                try {
                    const ticketData = JSON.parse(viewButton.dataset.ticket.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
                    showTicketModal(ticketData);
                } catch (error) {
                    console.error("Error al parsear datos del ticket:", error);
                    showCustomAlert("Error", "No se pudieron cargar los detalles de este ticket.");
                }
            }
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', hideTicketModal);
    if (ticketModalOverlay) ticketModalOverlay.addEventListener('click', (e) => { if (e.target === ticketModalOverlay) hideTicketModal(); });

    if (modalCloseTicketBtn) {
        modalCloseTicketBtn.addEventListener('click', () => {
            const ticketId = modalCloseTicketBtn.dataset.ticketId;
            showConfirmationModal(
                'Confirmar Cierre',
                `¿Estás seguro de que quieres cerrar el ticket ${ticketId}?`,
                async () => {
                    try {
                        const response = await fetch('/api/tickets/close', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ticketId })
                        });
                        const result = await response.json();
                        if (result.status === 'success') {
                            showCustomAlert('Éxito', 'Ticket cerrado correctamente.');
                            hideTicketModal();
                            ticketsDataLoaded = false; 
                            fetchAndRenderTickets();
                        } else {
                            throw new Error(result.message);
                        }
                    } catch (error) {
                        console.error('Error al cerrar el ticket:', error);
                        showCustomAlert('Error', 'No se pudo cerrar el ticket.');
                    }
                }
            );
        });
    }

    function showConfirmationModal(title, text, onOk) {
        if(confirmModalTitle) confirmModalTitle.textContent = title;
        if(confirmModalText) confirmModalText.textContent = text;
        if(confirmModalOverlay) confirmModalOverlay.classList.add('show');

        const okListener = () => {
            onOk();
            hideConfirmationModal();
            confirmModalOk.removeEventListener('click', okListener);
            confirmModalCancel.removeEventListener('click', cancelListener);
        };

        const cancelListener = () => {
            hideConfirmationModal();
            confirmModalOk.removeEventListener('click', okListener);
            confirmModalCancel.removeEventListener('click', cancelListener);
        };

        if(confirmModalOk) confirmModalOk.addEventListener('click', okListener);
        if(confirmModalCancel) confirmModalCancel.addEventListener('click', cancelListener);
    }

    function hideConfirmationModal() {
        if(confirmModalOverlay) confirmModalOverlay.classList.remove('show');
    }

    function showCustomAlert(title, text) {
        showConfirmationModal(title, text, () => {});
        if(confirmModalCancel) confirmModalCancel.style.display = 'none';
        const okListener = () => {
            if(confirmModalCancel) confirmModalCancel.style.display = 'inline-block';
            if(confirmModalOk) confirmModalOk.removeEventListener('click', okListener);
        };
        if(confirmModalOk) confirmModalOk.addEventListener('click', okListener);
    }

    // --- FUNCIONES UTILITARIAS (EXISTENTES) ---
    function updateStatusUI(status) {
        if (!statusText || !statusCard) return;
        statusText.textContent = status.replace(/_/g, ' ');
        if (qrCard) {
            const dashboardSection = document.getElementById('dashboard');
            qrCard.style.display = (status === 'ESPERANDO QR' && dashboardSection.classList.contains('active')) ? 'block' : 'none';
        }
        statusCard.className = 'card kpi-card';
        switch(status) {
            case 'CONECTADO': statusCard.classList.add('bg-green'); break;
            case 'DESCONECTADO': case 'ERROR':
                statusCard.classList.add('bg-red');
                break;
            case 'INICIALIZANDO': case 'ESPERANDO QR': case 'DESCONECTANDO':
                statusCard.classList.add('bg-orange');
                break;
            default: statusCard.classList.add('bg-blue'); break;
        }
        const isConnected = status === 'CONECTADO';
        if(connectBtn) connectBtn.disabled = isConnected || status === 'INICIALIZANDO';
        if(disconnectBtn) disconnectBtn.disabled = !isConnected;
        if(sendManualBtn) sendManualBtn.disabled = !isConnected;
    }
    if(connectBtn) connectBtn.addEventListener('click', () => fetch('/api/connect').then(res => res.json()).then(data => console.log(data.message)));
    if(disconnectBtn) disconnectBtn.addEventListener('click', () => fetch('/api/disconnect').then(res => res.json()).then(data => console.log(data.message)));
    if(sendMessageForm) {
        sendMessageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const recipient = manualRecipient.value.trim();
            const message = manualMessage.value.trim();
            if (!recipient || !message) return showFeedback('Por favor, completa ambos campos.', 'error');
            sendManualBtn.disabled = true;
            sendManualBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            fetch('/api/send-manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient, message }),
            })
            .then(res => res.json())
            .then(data => {
                showFeedback(data.status === 'success' ? 'Mensaje enviado con éxito.' : `Error: ${data.message}`, data.status);
                if (data.status === 'success') manualMessage.value = '';
            })
            .catch(() => showFeedback('Error de conexión con el servidor.', 'error'))
            .finally(() => {
                sendManualBtn.disabled = false;
                sendManualBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Mensaje';
            });
        });
    }
    function showFeedback(message, type) {
        if (!sendFeedback) return;
        sendFeedback.textContent = message;
        sendFeedback.className = `feedback-message feedback-${type}`; 
        setTimeout(() => {
            sendFeedback.className = 'feedback-message';
            sendFeedback.textContent = '';
        }, 5000);
    }

    function getSentimentHTML(sentiment) {
        if (!sentiment) {
            return `<span class="sentiment-icon sentiment-neutro"><i class="fas fa-question-circle"></i> N/A</span>`;
        }
        const icons = {
            'enojado': 'fa-angry', 'frustrado': 'fa-flushed', 'neutro': 'fa-meh', 'contento': 'fa-smile'
        };
        const iconClass = icons[sentiment] || 'fa-question-circle';
        return `<span class="sentiment-icon sentiment-${sentiment}"><i class="fas ${iconClass}"></i> ${sentiment}</span>`;
    }

    function applyFilters() {
        if(!searchTicketInput) return;
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

        renderTickets(filteredTickets);
    }
});
