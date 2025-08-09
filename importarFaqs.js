// Guardar este código como 'importarFaqs.js' en la raíz de tu proyecto.
const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const chalk = require('chalk');

// --- CONFIGURACIÓN ---
// 1. Cambia este valor por el nombre de tu archivo JSON.
const NOMBRE_ARCHIVO_JSON = 'faqs.json'; 

// 2. Cambia este valor por el nombre de la colección en Firebase donde quieres importar.
//    Opciones: 'preguntasFrecuentes' (para ventas) o 'soporteFAQ' (para soporte).
const COLECCION_DESTINO = 'soporteFAQ'; 
// --------------------


// --- LÓGICA DEL SCRIPT (No necesitas modificar nada de aquí para abajo) ---

// Cargar las credenciales de Firebase
try {
    const serviceAccount = require('./firebase-credentials.json');

    // Inicializar la app de Firebase
    if (!getApps().length) {
        initializeApp({
            credential: cert(serviceAccount)
        });
    }

    const db = getFirestore();
    console.log(chalk.green('✅ Conectado exitosamente a Cloud Firestore.'));

    // Función principal para importar los datos
    async function importarDatos() {
        try {
            // Construir la ruta completa al archivo JSON
            const rutaArchivo = path.join(__dirname, NOMBRE_ARCHIVO_JSON);

            // Leer el contenido del archivo
            const contenidoJson = fs.readFileSync(rutaArchivo, 'utf8');
            
            // Convertir el texto JSON a un array de JavaScript
            const faqs = JSON.parse(contenidoJson);

            if (!Array.isArray(faqs)) {
                throw new Error('El archivo JSON no contiene un array de preguntas y respuestas.');
            }

            console.log(chalk.yellow(`\nIniciando importación de ${faqs.length} documentos a la colección '${COLECCION_DESTINO}'...`));

            // Recorrer cada pregunta y respuesta del array
            for (const faq of faqs) {
                if (faq.pregunta && faq.respuesta) {
                    // Añadir el objeto como un nuevo documento a la colección
                    await db.collection(COLECCION_DESTINO).add({
                        pregunta: faq.pregunta,
                        respuesta: faq.respuesta
                    });
                    console.log(chalk.blue(`  -> Importada: "${faq.pregunta}"`));
                }
            }

            console.log(chalk.green.bold('\n🎉 ¡Importación completada con éxito!'));

        } catch (error) {
            console.error(chalk.red.bold('\n❌ Ocurrió un error durante la importación:'));
            console.error(chalk.red(error.message));
        }
    }

    // Ejecutar la función de importación
    importarDatos();

} catch (error) {
    console.error(chalk.red.bold('❌ Error fatal: No se pudo cargar el archivo firebase-credentials.json.'));
    console.error(chalk.red('Asegúrate de que el script se ejecute desde la raíz de tu proyecto.'));
}
