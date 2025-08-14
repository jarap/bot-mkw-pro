// modules/firestore_handler.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const chalk = require('chalk');

try {
    const serviceAccount = require('../google-credentials.json');

    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount),
            storageBucket: `mkw-bot.firebasestorage.app`
        });
    }

    const db = getFirestore();
    console.log(chalk.green('✅ Conectado exitosamente a Cloud Firestore.'));

    const ticketsCollection = db.collection('tickets');
    const planesCollection = db.collection('planes');
    const promosCollection = db.collection('promociones');
    const faqsCollection = db.collection('preguntasFrecuentes');
    const configCollection = db.collection('configuracion');
    const zonasCollection = db.collection('zonasCobertura');
    const soporteFaqsCollection = db.collection('soporteFAQ');
    const menuItemsCollection = db.collection('menuItems');
    const comprobantesCollection = db.collection('comprobantesRecibidos');
    const usersCollection = db.collection('users');

    async function getUserByUsername(username) {
        try {
            const docRef = usersCollection.doc(username);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error(chalk.red(`❌ Error al obtener el usuario ${username}:`), error);
            return null;
        }
    }

    async function getAllUsers() {
        try {
            const snapshot = await usersCollection.get();
            if (snapshot.empty) {
                return { success: true, data: {} };
            }
            const users = {};
            snapshot.forEach(doc => {
                users[doc.id] = doc.data();
            });
            return { success: true, data: users };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener todos los usuarios:'), error);
            return { success: false, message: 'No se pudieron obtener los usuarios.' };
        }
    }

    async function addUser(username, userData) {
        try {
            await usersCollection.doc(username).set(userData);
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al añadir el usuario ${username}:`), error);
            return { success: false, message: error.message };
        }
    }

    async function updateUser(username, userData) {
        try {
            await usersCollection.doc(username).update(userData);
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al actualizar el usuario ${username}:`), error);
            return { success: false, message: error.message };
        }
    }

    async function deleteUser(username) {
        try {
            await usersCollection.doc(username).delete();
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al eliminar el usuario ${username}:`), error);
            return { success: false, message: error.message };
        }
    }

    async function getComprobanteById(comprobanteId) {
        try {
            const docRef = comprobantesCollection.doc(comprobanteId);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            console.warn(chalk.yellow(`   -> No se encontró el comprobante con ID: ${comprobanteId}`));
            return null;
        } catch (error) {
            console.error(chalk.red(`❌ Error al obtener el comprobante por ID ${comprobanteId}:`), error);
            return null;
        }
    }
    
    async function getMenuItemById(itemId) {
        try {
            const docRef = menuItemsCollection.doc(itemId);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error(chalk.red(`❌ Error al obtener el item de menú por ID ${itemId}:`), error);
            return null;
        }
    }

    async function getAllMenuItems() {
        try {
            const snapshot = await menuItemsCollection.orderBy('order').get();
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, data: items };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener todos los items de menú:'), error);
            return { success: false, message: 'No se pudieron obtener los items del menú.' };
        }
    }

    async function addMenuItem(itemData) {
        try {
            const desiredOrder = parseInt(itemData.order, 10);
            if (isNaN(desiredOrder) || desiredOrder < 1 || desiredOrder > 9) {
                throw new Error('El número de orden debe ser entre 1 y 9.');
            }
            const siblingsSnapshot = await menuItemsCollection.where('parent', '==', itemData.parent).get();
            if (siblingsSnapshot.size >= 9) {
                throw new Error('Límite alcanzado: solo se permiten 9 opciones por nivel.');
            }
            const orderExists = siblingsSnapshot.docs.some(doc => doc.data().order === desiredOrder);
            if (orderExists) {
                throw new Error(`El número de orden ${desiredOrder} ya está en uso en este nivel.`);
            }
            const docRef = await menuItemsCollection.add(itemData);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error(chalk.red('❌ Error al añadir un item de menú:'), error.message);
            throw error;
        }
    }

    async function updateMenuItem(itemId, itemData) {
        try {
            const desiredOrder = parseInt(itemData.order, 10);
            if (isNaN(desiredOrder) || desiredOrder < 1 || desiredOrder > 9) {
                throw new Error('El número de orden debe ser entre 1 y 9.');
            }
            const siblingsSnapshot = await menuItemsCollection.where('parent', '==', itemData.parent).get();
            const orderExists = siblingsSnapshot.docs.some(doc => doc.id !== itemId && doc.data().order === desiredOrder);
            if (orderExists) {
                throw new Error(`El número de orden ${desiredOrder} ya está en uso en este nivel.`);
            }
            await menuItemsCollection.doc(itemId).update(itemData);
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al actualizar el item de menú ${itemId}:`), error.message);
            throw error;
        }
    }

    async function deleteMenuItem(itemId) {
        try {
            const allItemsSnapshot = await menuItemsCollection.get();
            const allItems = allItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const itemsToDelete = new Set([itemId]);
            let searchQueue = [itemId];
            while (searchQueue.length > 0) {
                const currentParentId = searchQueue.shift();
                const children = allItems.filter(item => item.parent === currentParentId);
                for (const child of children) {
                    itemsToDelete.add(child.id);
                    searchQueue.push(child.id);
                }
            }
            const batch = db.batch();
            itemsToDelete.forEach(id => {
                batch.delete(menuItemsCollection.doc(id));
            });
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al eliminar el item de menú ${itemId} y sus descendientes:`), error);
            return { success: false, message: 'No se pudo eliminar el item y sus hijos.' };
        }
    }
    
    async function getMenuItems(parentId) {
        try {
            const snapshot = await menuItemsCollection
                .where('parent', '==', parentId)
                .orderBy('order')
                .get();
            if (snapshot.empty) {
                return [];
            }
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(chalk.red(`❌ Error al obtener items del menú para el padre ${parentId}:`), error);
            return [];
        }
    }

    async function logTicket(ticketData) {
        try {
            const docRef = ticketsCollection.doc(ticketData.ID_Ticket);
            await docRef.set(ticketData);
            console.log(chalk.blue(`📝 Ticket ${ticketData.ID_Ticket} registrado en Firestore.`));
            return docRef;
        } catch (error) {
            console.error(chalk.red('❌ Error al registrar ticket en Firestore:'), error);
        }
    }

    async function updateTicket(ticketId, updateData) {
        try {
            const ticketRef = ticketsCollection.doc(ticketId);
            await ticketRef.set(updateData, { merge: true });
            console.log(chalk.blue(`📝 Ticket ${ticketId} actualizado en Firestore.`));
        } catch (error) {
            console.error(chalk.red(`❌ Error al actualizar ticket en Firestore:`), error);
        }
    }
    
    async function getAllTickets() {
        try {
            const snapshot = await ticketsCollection.orderBy('Timestamp', 'desc').get();
            if (snapshot.empty) {
                return { success: true, data: [] };
            }
            const tickets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, data: tickets };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener todos los tickets de Firestore:'), error);
            return { success: false, message: 'No se pudo obtener el historial de tickets.' };
        }
    }

    async function countOpenTickets() {
        try {
            const snapshot = await ticketsCollection.where('Estado', 'in', ['Pendiente', 'En Progreso']).get();
            return snapshot.size;
        } catch (error) {
            console.error(chalk.red('❌ Error al contar tickets abiertos en Firestore:'), error);
            return 0;
        }
    }
    
    async function getSalesData() {
        try {
            const [planesSnap, promosSnap, faqsSnap, configSnap, zonasSnap, soporteFaqsSnap] = await Promise.all([
                planesCollection.orderBy('precioMensual').get(),
                promosCollection.get(),
                faqsCollection.get(),
                configCollection.doc('ventas').get(),
                zonasCollection.limit(1).get(),
                soporteFaqsCollection.get()
            ]);
            let zonasDoc = null;
            if (!zonasSnap.empty) {
                zonasDoc = zonasSnap.docs[0];
            }
            const salesData = {
                planes: planesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                promociones: promosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                preguntasFrecuentes: faqsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                soporteFaqs: soporteFaqsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                configuracionGeneral: configSnap.exists ? { id: configSnap.id, ...configSnap.data() } : {},
                zonasCobertura: zonasDoc ? { id: zonasDoc.id, ...zonasDoc.data() } : { id: null, listado: [] }
            };
            return { success: true, data: salesData };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener datos de ventas de Firestore:'), error);
            return { success: false, message: 'No se pudieron obtener los datos de ventas.' };
        }
    }

    async function addItem(collectionName, data) {
        try {
            const docRef = await db.collection(collectionName).add(data);
            return { success: true, id: docRef.id };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async function updateItem(collectionName, docId, data) {
        try {
            await db.collection(collectionName).doc(docId).set(data, { merge: true });
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async function deleteItem(collectionName, docId) {
        try {
            await db.collection(collectionName).doc(docId).delete();
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async function getCompanyConfig() {
        try {
            const docRef = configCollection.doc('empresa');
            const doc = await docRef.get();
            if (!doc.exists) {
                return { success: false, message: 'El documento de configuración de empresa no existe.' };
            }
            return { success: true, data: doc.data() };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener la configuración de la empresa:'), error);
            return { success: false, message: 'Error al leer la configuración de la empresa.' };
        }
    }

    async function updateCompanyConfig(data) {
        try {
            const docRef = configCollection.doc('empresa');
            await docRef.set(data, { merge: true });
            console.log(chalk.blue('🏢 Configuración de la empresa actualizada en Firestore.'));
            return { success: true };
        } catch (error) {
            console.error(chalk.red('❌ Error al actualizar la configuración de la empresa:'), error);
            return { success: false, message: 'Error al guardar la configuración de la empresa.' };
        }
    }

    async function getVentasConfig() {
        try {
            const docRef = configCollection.doc('ventas');
            const doc = await docRef.get();
            if (!doc.exists) {
                return { success: false, message: 'El documento de configuración de ventas no existe.' };
            }
            return { success: true, data: doc.data() };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener la configuración de ventas:'), error);
            return { success: false, message: 'Error al leer la configuración de ventas.' };
        }
    }

    async function updateVentasConfig(data) {
        try {
            const docRef = configCollection.doc('ventas');
            await docRef.set(data, { merge: true });
            console.log(chalk.blue('🤖 Configuración del bot de ventas actualizada en Firestore.'));
            return { success: true };
        } catch (error) {
            console.error(chalk.red('❌ Error al actualizar la configuración de ventas:'), error);
            return { success: false, message: 'Error al guardar la configuración de ventas.' };
        }
    }

    async function getSoporteConfig() {
        try {
            const docRef = configCollection.doc('soporte');
            const doc = await docRef.get();
            
            // --- INICIO DE MODIFICACIÓN ---
            // Si el documento no existe, la función ahora falla explícitamente.
            if (!doc.exists) {
                console.warn(chalk.yellow('⚠️ El documento de configuración de soporte no existe en Firestore.'));
                return { success: false, message: 'El documento de configuración de soporte no existe.' };
            }
            
            // Si existe, devuelve los datos.
            return { success: true, data: doc.data() };
            // --- FIN DE MODIFICACIÓN ---

        } catch (error) {
            console.error(chalk.red('❌ Error al obtener la configuración de soporte:'), error);
            return { success: false, message: 'Error al leer la configuración de soporte.' };
        }
    }

    async function updateSoporteConfig(data) {
        try {
            const docRef = configCollection.doc('soporte');
            await docRef.set(data, { merge: true });
            console.log(chalk.blue('🛠️  Configuración del bot de soporte actualizada en Firestore.'));
            return { success: true };
        } catch (error) {
            console.error(chalk.red('❌ Error al actualizar la configuración de soporte:'), error);
            return { success: false, message: 'Error al guardar la configuración de soporte.' };
        }
    }

    async function getSupportFaqs() {
        try {
            const snapshot = await soporteFaqsCollection.get();
            if (snapshot.empty) {
                return [];
            }
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener las FAQs de soporte:'), error);
            return [];
        }
    }

    async function logComprobante(comprobanteData) {
        try {
            const docRef = await comprobantesCollection.add(comprobanteData);
            console.log(chalk.blue(`🧾 Comprobante ${docRef.id} registrado en Firestore.`));
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error(chalk.red('❌ Error al registrar comprobante en Firestore:'), error);
            return { success: false, message: 'Error al guardar el comprobante.' };
        }
    }

    async function getAllComprobantes() {
        try {
            const snapshot = await comprobantesCollection.orderBy('timestamp', 'desc').get();
            const comprobantes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, data: comprobantes };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener el historial de comprobantes:'), error);
            return { success: false, message: 'No se pudo obtener el historial.' };
        }
    }

    async function updateComprobante(comprobanteId, updateData) {
        try {
            const comprobanteRef = comprobantesCollection.doc(comprobanteId);
            await comprobanteRef.update(updateData);
            console.log(chalk.blue(`🧾 Comprobante ${comprobanteId} actualizado.`));
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al actualizar el comprobante ${comprobanteId}:`), error);
            return { success: false, message: 'Error al actualizar el estado del comprobante.' };
        }
    }
    
    async function getPagosConfig() {
        try {
            const docRef = configCollection.doc('pagos');
            const doc = await docRef.get();
            const defaultConfig = {
                pagosQrActivos: true,
                umbralFiabilidad: 95,
                promptAnalisisComprobante: `Eres un asistente experto en contabilidad especializado en comprobantes de pago de Argentina. Tu tarea es analizar la imagen o PDF adjunto y extraer la información clave.

Sigue estas reglas estrictamente:
1.  **Extrae los siguientes datos**:
    - \`entidad\`: El nombre del banco o billetera virtual (ej: "Mercado Pago", "Banco Galicia").
    - \`monto\`: El monto total de la operación.
    - \`fecha\`: La fecha de la transacción.
    - \`referencia\`: El número de operación, ID de transacción o código de control.
2.  **Normaliza los datos**:
    - Para el \`monto\`, devuélvelo como un string numérico con dos decimales, usando un punto como separador y sin puntos de miles (ej: "70000.00").
    - Para la \`fecha\`, devuélvela en formato "DD/MM/AAAA".
3.  **Evalúa la confiabilidad**:
    - \`confiabilidad_porcentaje\`: Asigna un porcentaje de 0 a 99 basado en la calidad de la imagen y la cantidad de datos que pudiste extraer. Un comprobante digital claro y completo es 99%. Una foto borrosa o una pantalla de confirmación sin datos es 50% o menos.
4.  **Manejo de Errores**:
    - Si la imagen no es un comprobante de pago, devuelve un JSON con un único campo: {"error": "El archivo no es un comprobante válido"}.

**Responde únicamente con el objeto JSON resultante, sin ningún texto adicional.**`
            };
            if (!doc.exists) {
                console.warn(chalk.yellow('⚠️ El documento de configuración de pagos no existe. Usando valores por defecto.'));
                return { success: true, data: defaultConfig };
            }
            return { success: true, data: { ...defaultConfig, ...doc.data() } };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener la configuración de pagos:'), error);
            return { success: false, message: 'Error al leer la configuración de pagos.' };
        }
    }

    async function updatePagosConfig(data) {
        try {
            const docRef = configCollection.doc('pagos');
            await docRef.set(data, { merge: true });
            console.log(chalk.blue('💳 Configuración de pagos actualizada en Firestore.'));
            return { success: true };
        } catch (error) {
            console.error(chalk.red('❌ Error al actualizar la configuración de pagos:'), error);
            return { success: false, message: 'Error al guardar la configuración de pagos.' };
        }
    }

    module.exports = {
        db,
        logTicket,
        updateTicket,
        getAllTickets,
        countOpenTickets,
        getSalesData,
        addItem,
        updateItem,
        deleteItem,
        getCompanyConfig,
        updateCompanyConfig,
        getVentasConfig,
        updateVentasConfig,
        getSoporteConfig,
        updateSoporteConfig,
        getSupportFaqs,
        getMenuItems,
        getAllMenuItems,
        addMenuItem,
        updateMenuItem,
        deleteMenuItem,
        getMenuItemById,
        logComprobante,
        getAllComprobantes,
        updateComprobante,
        getPagosConfig,
        updatePagosConfig,
        getComprobanteById,
        getUserByUsername,
        getAllUsers,
        addUser,
        updateUser,
        deleteUser,
    };

} catch (error) {
    console.error(chalk.red.bold('❌ Error fatal de Firebase Admin:'), chalk.red('No se pudo inicializar. ¿Está el archivo google-credentials.json en la raíz?'));
    console.error(error);
    process.exit(1);
}
