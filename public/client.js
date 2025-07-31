// public/client.js
document.addEventListener('DOMContentLoaded', () => {
    const statusText = document.getElementById('status-text');
    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const logIframe = document.getElementById('log-iframe'); // Referencia al iframe

    // --- WEBSOCKET CONNECTION ---
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('Conectado al servidor del panel.');
        fetch('/api/status').then(res => res.json()).then(data => {
            updateStatusUI(data.status);
        });
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'status') {
            updateStatusUI(message.data);
        } else if (message.type === 'qr') {
            qrImage.src = message.data;
            qrContainer.style.display = 'block';
        } else if (message.type === 'log') {
            // Enviamos el mensaje al iframe
            if (logIframe && logIframe.contentWindow) {
                logIframe.contentWindow.postMessage(message.data, '*');
            }
        }
    };

    ws.onclose = () => {
        console.log('Conexión con el servidor perdida. Recargando la página en 3 segundos...');
        updateStatusUI('SERVIDOR_REINICIANDO');
        setTimeout(() => {
            window.location.reload();
        }, 3000);
    };

    // --- UI UPDATES ---
    function updateStatusUI(status) {
        statusText.textContent = status.replace(/_/g, ' ');
        statusText.className = `status-${status}`;
        if (status !== 'ESPERANDO QR') {
            qrContainer.style.display = 'none';
        }
        if (status === 'CONECTADO') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
        } else if (status === 'DESCONECTADO' || status === 'ERROR') {
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
        } else {
            connectBtn.disabled = true;
            disconnectBtn.disabled = true;
        }
    }

    // --- EVENT LISTENERS ---
    connectBtn.addEventListener('click', () => {
        fetch('/api/connect').then(res => res.json()).then(data => console.log(data.message));
    });

    disconnectBtn.addEventListener('click', () => {
        fetch('/api/disconnect').then(res => res.json()).then(data => console.log(data.message));
    });
});

