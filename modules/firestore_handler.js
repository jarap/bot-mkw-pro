// modules/firestore_handler.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
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
    // --- INICIO DE LA MODIFICACIÓN ---
    const zonasCollection = db.collection('zonasCobertura');
    // --- FIN DE LA MODIFICACIÓN ---

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
            // --- INICIO DE LA MODIFICACIÓN ---
            // Se ajusta la consulta para leer la colección 'zonasCobertura'
            const [planesSnap, promosSnap, faqsSnap, configSnap, zonasSnap] = await Promise.all([
                planesCollection.orderBy('precioMensual').get(),
                promosCollection.get(),
                faqsCollection.get(),
                knowledgeCollection.doc('configuracionGeneral').get(),
                zonasCollection.limit(1).get() // Obtenemos el primer (y único) documento de la colección de zonas
            ]);

            let zonasDoc = null;
            if (!zonasSnap.empty) {
                zonasDoc = zonasSnap.docs[0];
            }
            // --- FIN DE LA MODIFICACIÓN ---

            const salesData = {
                planes: planesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                promociones: promosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                preguntasFrecuentes: faqsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                configuracionGeneral: configSnap.exists ? { id: configSnap.id, ...configSnap.data() } : {},
                // --- INICIO DE LA MODIFICACIÓN ---
                // Se empaquetan los datos de la zona correctamente
                zonasCobertura: zonasDoc ? { id: zonasDoc.id, ...zonasDoc.data() } : { id: null, listado: [] }
                // --- FIN DE LA MODIFICACIÓN ---
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
            // No es necesario cambiar nada aquí, ya que el nombre de la colección viene del frontend.
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
        updateCompanyConfig
    };

} catch (error) {
    console.error(chalk.red.bold('❌ Error fatal de Firebase Admin:'), chalk.red('No se pudo inicializar. ¿Está el archivo firebase-credentials.json en la raíz?'));
    console.error(error);
    process.exit(1);
}
