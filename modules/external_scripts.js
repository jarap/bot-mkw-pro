// modules/external_scripts.js
const { spawn } = require('child_process');
const path = require('path');

async function llamarScriptExterno(scriptPath, argsArray = [], inputData = null) {
    const fullScriptPath = path.join(__dirname, '..', scriptPath);

    console.log(`[${new Date().toLocaleString()}] 📞 Ejecutando ${path.basename(scriptPath)} con args: ${argsArray.join(' ')}${inputData ? ' y datos por stdin' : ''}`);
    
    return new Promise((resolve) => {
        const timeoutMs = 30000; // 30 segundos de tiempo de espera

        const proceso = spawn('node', [fullScriptPath, ...argsArray], { timeout: timeoutMs });

        let stdoutData = '';
        let stderrData = '';

        proceso.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        proceso.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        proceso.on('error', (error) => {
            console.error(`[${new Date().toLocaleString()}] ❌ Error al iniciar el script ${path.basename(scriptPath)}:`, error.message);
            resolve({ success: false, message: `Error al iniciar el script (${path.basename(scriptPath)}): ${error.message}` });
        });
        
        proceso.on('close', (code) => {
            if (stderrData.trim() !== "") {
                // --- INICIO DE MODIFICACIÓN ---
                // Se elimina el límite .substring(0, 500) para mostrar el log completo.
                console.info(`[${new Date().toLocaleString()}] Stderr de ${path.basename(scriptPath)}: ${stderrData}`);
                // --- FIN DE MODIFICACIÓN ---
            }
            if (code === 0) {
                try {
                    const parsedOutput = JSON.parse(stdoutData);
                    resolve(parsedOutput);
                } catch (parseError) {
                    resolve({ success: false, message: `Respuesta inesperada de ${path.basename(scriptPath)}: no es JSON. Recibido: ${stdoutData.substring(0,100000)}...` });
                }
            } else {
                resolve({ success: false, message: `Script ${path.basename(scriptPath)} terminó con error código ${code}.` });
            }
        });

        if (inputData !== null) {
            try {
                proceso.stdin.write(inputData);
                proceso.stdin.end();
            } catch (stdinError) {
                console.error(`[${new Date().toLocaleString()}] ❌ Error escribiendo a stdin para ${path.basename(scriptPath)}:`, stdinError.message);
            }
        }
    });
}

module.exports = { llamarScriptExterno };

