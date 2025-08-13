// modules/firestore_handler.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const chalk = require('chalk');

try {
    const serviceAccount = require('../google-credentials.json');

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
    const configCollection = db.collection('configuracion');
    const zonasCollection = db.collection('zonasCobertura');
    const soporteFaqsCollection = db.collection('soporteFAQ');
    const menuItemsCollection = db.collection('menuItems');

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
            
            const defaultConfig = {
                respuestasPorVozActivas: true,
                promptAnalisisSentimiento: `Analiza el sentimiento del siguiente mensaje de un cliente a su proveedor de internet. Responde únicamente con una de estas cuatro palabras: "enojado", "frustrado", "neutro", "contento". Mensaje: "{userMessage}"`,
                promptIntencionGeneral: `Analiza el siguiente mensaje de un cliente a su proveedor de internet. Tu tarea es clasificar la intención principal del mensaje en una de tres categorías. Responde únicamente con una de estas tres palabras: "soporte", "ventas", "pregunta_general".

- "soporte": si el cliente reporta un problema, una falla, que el servicio no funciona, anda lento, etc. (Ej: "no tengo internet", "anda como el culo", "se me cortó el servicio").
- "ventas": si el cliente pregunta por nuevos planes, cambiar su plan actual, costos, o servicios adicionales. (Ej: "¿qué otros planes tienen?", "¿puedo subir la velocidad?").
- "pregunta_general": para cualquier otra cosa, como saludos, agradecimientos, o preguntas que no son ni de soporte ni de ventas. (Ej: "hola", "muchas gracias", "¿hasta qué hora están?").

Mensaje del cliente: "{userMessage}"`,
                promptRespuestaSoporte: `Sos I-Bot, un Asistente Técnico Senior de una empresa de internet en Argentina. Tu personalidad es amable, directa y eficiente. Usás siempre el "voseo". Tu objetivo es resolver la consulta del cliente siguiendo un proceso de diagnóstico.

                **Tu Proceso de Diagnóstico (Seguí estos pasos en orden):**
                
                1.  **Acknowledge y Primera Acción:**
                    * Leé la **Pregunta del Cliente** y el **Historial**.
                    * Si el cliente está molesto, empezá con una frase corta y empática (ej: "Uf, qué macana.", "Entiendo, revisemos qué pasa.").
                    * Buscá en la **Base de Conocimiento (FAQs)** una solución inicial para el problema del cliente.
                    * **Respondé dando UNA SOLA instrucción clara y directa**. Usá **negritas** para la acción.
                    * *Ejemplo de respuesta:* "Ok, empecemos por lo básico. Por favor, ***reiniciá el módem y la antena***. Desenchufalos 30 segundos y volvelos a enchufar. Avisame cuando lo hayas hecho 👍."
                
                2.  **Verificación y Segundo Paso:**
                    * Cuando el cliente responda, analizá si la primera acción funcionó.
                    * **Si el problema persiste**, y si la Base de Conocimiento ofrece una segunda pregunta de diagnóstico (como "¿qué luces tiene?"), hacé esa pregunta para obtener más información.
                    * *Ejemplo de respuesta:* "Lástima que no funcionó. Para seguir, ¿me podrías decir ***qué luces ves prendidas en el módem y de qué color son***? 🤔"
                
                3.  **Escalamiento Final:**
                    * Si el cliente pide hablar con una **persona**, O si ya diste una instrucción y una pregunta de diagnóstico y el problema sigue, **no insistas más**.
                    * Respondé con una **disculpa amable y variada**, explicando que sos una IA con conocimiento limitado y que lo vas a derivar. **Al final de tu mensaje, incluí la frase \`[NO_ANSWER]\`**.
                    * *Ejemplo 1:* "La verdad, hasta acá llega mi conocimiento. Para no hacerte perder tiempo, te voy a pasar con una persona de nuestro equipo que te va a poder ayudar mejor. [NO_ANSWER]"
                    * *Ejemplo 2:* "Ok, parece que este problema necesita una revisión más a fondo. Como soy una IA, hay cosas que se me escapan. Te derivo con un agente para que lo vean en detalle. [NO_ANSWER]"
                
                **Base de Conocimiento (ÚNICA fuente de verdad):**
                ---
                {knowledgeString}
                ---
                
                **Historial de la Conversación (para entender el contexto):**
                ---
                {chatHistory}
                ---
                
                **Pregunta del Cliente:**
                {userMessage}
                `
            };

            if (!doc.exists) {
                console.warn(chalk.yellow('⚠️ El documento de configuración de soporte no existe. Usando valores por defecto.'));
                return { success: true, data: defaultConfig };
            }

            const dbData = doc.data();
            const finalConfig = { ...defaultConfig, ...dbData };
            
            return { success: true, data: finalConfig };
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

    // --- INICIO DE MODIFICACIÓN ---
    async function getPagosConfig() {
        try {
            const docRef = configCollection.doc('pagos');
            const doc = await docRef.get();
            const defaultConfig = { pagosQrActivos: true };
            if (!doc.exists) {
                return { success: true, data: defaultConfig };
            }
            return { success: true, data: { ...defaultConfig, ...doc.data() } };
        } catch (error) {
            return { success: false, message: 'Error al leer la configuración de pagos.' };
        }
    }

    async function updatePagosConfig(data) {
        try {
            const docRef = configCollection.doc('pagos');
            await docRef.set(data, { merge: true });
            return { success: true };
        } catch (error) {
            return { success: false, message: 'Error al guardar la configuración de pagos.' };
        }
    }
    // --- FIN DE MODIFICACIÓN ---

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
        getPagosConfig, // --- INICIO DE MODIFICACIÓN ---
        updatePagosConfig // --- FIN DE MODIFICACIÓN ---
    };

} catch (error) {
    console.error(chalk.red.bold('❌ Error fatal de Firebase Admin:'), chalk.red('No se pudo inicializar. ¿Está el archivo google-credentials.json en la raíz?'));
    console.error(error);
    process.exit(1);
}
