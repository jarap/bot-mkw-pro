// modules/redisClient.js
const redis = require('redis');
const chalk = require('chalk');

const client = redis.createClient();

client.on('error', (err) => {
    console.error(chalk.red.bold('❌ Error de Redis:'), chalk.red('No se pudo conectar al servidor de Redis.'));
    console.error(chalk.red('Asegúrate de que Redis esté instalado y corriendo.'));
    console.error(chalk.red(err.message));
});

client.on('connect', () => {
    console.log(chalk.green('✅ Conectado exitosamente al servidor de Redis.'));
});

const connectRedis = async () => {
    if (!client.isOpen) {
        await client.connect();
    }
};

connectRedis().catch(err => {});

/**
 * Guarda un valor en Redis con un tiempo de expiración opcional.
 * @param {string} key - La clave para guardar el dato.
 * @param {any} value - El valor a guardar. Se convertirá a JSON.
 * @param {number} [expirationInSeconds] - Opcional. Tiempo de expiración en segundos.
 */
async function set(key, value, expirationInSeconds) {
    if (!client.isOpen) return;
    try {
        const stringValue = JSON.stringify(value);
        if (expirationInSeconds) {
            // MODIFICADO: Añadimos la opción de expiración (TTL)
            await client.set(key, stringValue, { 'EX': expirationInSeconds });
        } else {
            await client.set(key, stringValue);
        }
    } catch (error) {
        console.error(chalk.red(`❌ Error al guardar en Redis (key: ${key}):`), error);
    }
}

async function get(key) {
    if (!client.isOpen) return null;
    try {
        const value = await client.get(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        console.error(chalk.red(`❌ Error al obtener de Redis (key: ${key}):`), error);
        return null;
    }
}

async function del(key) {
    if (!client.isOpen) return;
    try {
        await client.del(key);
    } catch (error) {
        console.error(chalk.red(`❌ Error al eliminar de Redis (key: ${key}):`), error);
    }
}

async function keys(pattern) {
    if (!client.isOpen) return [];
    try {
        return await client.keys(pattern);
    } catch (error) {
        console.error(chalk.red(`❌ Error al obtener claves de Redis (pattern: ${pattern}):`), error);
        return [];
    }
}

module.exports = {
    set,
    get,
    del,
    keys,
    rawClient: client 
};
