// modules/firestore_handler.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const chalk = require('chalk');

try {
    const serviceAccount = require('../firebase-credentials.json');

    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount)
        });
    }

    const db = getFirestore();
    console.log(chalk.green('✅ Conectado exitosamente a Cloud Firestore.'));

    const ticketsCollection = db.collection('tickets');
    const planesCollection = db.collection('planes');
    const promosCollection = db.collection('promociones');
    const faqsCollection = db.collection('preguntasFrecuentes');
    const knowledgeCollection = db.collection('knowledge');
    const configCollection = db.collection('configuracion');
    const zonasCollection = db.collection('zonasCobertura');
    const soporteFaqsCollection = db.collection('soporteFAQ');
    const menuSoporteCollection = db.collection('menuSoporte');

    // --- INICIO DE MODIFICACIONES PARA GESTOR DE MENÚS ---

    /**
     * Obtiene la lista de todos los menús disponibles.
     * @returns {Promise<object>} Un objeto con la lista de menús.
     */
    async function getMenus() {
        try {
            const snapshot = await menuSoporteCollection.get();
            if (snapshot.empty) {
                return { success: true, data: [] };
            }
            const menus = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, data: menus };
        } catch (error) {
            console.error(chalk.red('❌ Error al obtener la lista de menús:'), error);
            return { success: false, message: 'No se pudo obtener la lista de menús.' };
        }
    }

    /**
     * Actualiza los datos de un menú existente (título, descripción).
     * @param {string} menuId - El ID del menú a actualizar.
     * @param {object} data - Los datos a actualizar (ej: { title, description }).
     * @returns {Promise<object>} Un objeto indicando el éxito o fracaso.
     */
    async function updateMenuDetails(menuId, data) {
        try {
            await menuSoporteCollection.doc(menuId).update(data);
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al actualizar detalles del menú ${menuId}:`), error);
            return { success: false, message: 'No se pudo actualizar el menú.' };
        }
    }
    
    /**
     * Añade una nueva opción a un menú existente.
     * @param {string} menuId - El ID del menú.
     * @param {object} optionData - Los datos de la nueva opción.
     * @returns {Promise<object>} Un objeto indicando el éxito o fracaso.
     */
    async function addMenuOption(menuId, optionData) {
        try {
            const menuRef = menuSoporteCollection.doc(menuId);
            await menuRef.update({
                options: FieldValue.arrayUnion(optionData)
            });
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al añadir opción al menú ${menuId}:`), error);
            return { success: false, message: 'No se pudo añadir la opción.' };
        }
    }

    /**
     * Elimina una opción de un menú.
     * @param {string} menuId - El ID del menú.
     * @param {object} optionData - Los datos de la opción a eliminar.
     * @returns {Promise<object>} Un objeto indicando el éxito o fracaso.
     */
    async function deleteMenuOption(menuId, optionData) {
        try {
            const menuRef = menuSoporteCollection.doc(menuId);
            await menuRef.update({
                options: FieldValue.arrayRemove(optionData)
            });
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al eliminar opción del menú ${menuId}:`), error);
            return { success: false, message: 'No se pudo eliminar la opción.' };
        }
    }
    
    /**
     * Crea un nuevo documento de menú.
     * @param {string} menuId - El ID para el nuevo menú.
     * @returns {Promise<object>} Un objeto indicando el éxito o fracaso.
     */
    async function createMenu(menuId) {
        try {
            const newMenuData = {
                title: `Nuevo Menú (${menuId})`,
                description: "Descripción por defecto.",
                options: []
            };
            await menuSoporteCollection.doc(menuId).set(newMenuData);
            return { success: true, data: { id: menuId, ...newMenuData } };
        } catch (error) {
            console.error(chalk.red(`❌ Error al crear el menú ${menuId}:`), error);
            return { success: false, message: 'No se pudo crear el menú.' };
        }
    }
    
    /**
     * Elimina un documento de menú completo.
     * @param {string} menuId - El ID del menú a eliminar.
     * @returns {Promise<object>} Un objeto indicando el éxito o fracaso.
     */
    async function deleteMenu(menuId) {
        try {
            await menuSoporteCollection.doc(menuId).delete();
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Error al eliminar el menú ${menuId}:`), error);
            return { success: false, message: 'No se pudo eliminar el menú.' };
        }
    }

    // --- FIN DE MODIFICACIONES ---

    async function getMenu(menuId) {
        try {
            const docRef = menuSoporteCollection.doc(menuId);
            const doc = await docRef.get();
            if (!doc.exists) {
                console.error(chalk.red(`❌ No se encontró el menú con ID '${menuId}' en Firestore.`));
                return null;
            }
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error(chalk.red(`❌ Error al obtener el menú '${menuId}' de Firestore:`), error);
            return null;
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
                knowledgeCollection.doc('configuracionGeneral').get(),
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
        getSupportFaqs,
        getMenu,
        // --- INICIO DE MODIFICACIÓN ---
        // Exportamos las nuevas funciones para que puedan ser usadas por el panel web.
        getMenus,
        updateMenuDetails,
        addMenuOption,
        deleteMenuOption,
        createMenu,
        deleteMenu
        // --- FIN DE MODIFICACIÓN ---
    };

} catch (error) {
    console.error(chalk.red.bold('❌ Error fatal de Firebase Admin:'), chalk.red('No se pudo inicializar. ¿Está el archivo firebase-credentials.json en la raíz?'));
    console.error(error);
    process.exit(1);
}
