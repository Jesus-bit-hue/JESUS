// Cargar las variables de entorno desde .env. Esta línea DEBE SER LA PRIMERA EJECUTABLE.
require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb'); // Importamos ObjectId para trabajar con _id
const path = require('path'); // Para manejar rutas de archivos
const app = express();
const PORT = process.env.PORT || 3000; // El puerto donde correrá el servidor. Toma del .env o usa 3000 por defecto.

// Obtener la URI de conexión a MongoDB desde las variables de entorno.
const uri = process.env.MONGODB_URI;

// Verificar si la URI está definida. Si no lo está, la aplicación no puede conectar.
if (!uri) {
    console.error('Error: La variable de entorno MONGODB_URI no está definida.');
    console.error('Asegúrate de tener un archivo .env en la raíz del proyecto con la línea:');
    console.error('MONGODB_URI="mongodb+srv://Jesus:Jesus@paec.guaxwsi.mongodb.net/JESUS?retryWrites=true&w=majority&appName=PAEC"'); // Ejemplo específico para Jesús
    process.exit(1); // Salir de la aplicación si no se puede conectar
}

const client = new MongoClient(uri);

// Definir el nombre de la base de datos y la colección para este proyecto.
const DB_NAME = 'JESUS';
const COLLECTION_NAME = 'RESIDUOS';

let db; // Variable para almacenar la conexión a la base de datos una vez establecida

// Función asíncrona para conectar a MongoDB. Se llama una sola vez al inicio del servidor.
async function connectToMongo() {
    try {
        await client.connect(); // Intenta conectar al servidor MongoDB usando la URI
        db = client.db(DB_NAME); // Selecciona la base de datos 'JESUS'
        console.log(`Conectado a la base de datos: ${DB_NAME}`);
    } catch (err) {
        console.error('Error al conectar a MongoDB:', err);
        process.exit(1); // Si hay un error, el servidor no puede funcionar, así que salimos.
    }
}

// Llama a la función de conexión para iniciar el proceso.
connectToMongo();

// Middlewares de Express:
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Ruta principal del servidor. Sirve el archivo index.html cuando se accede a la URL raíz.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// API ENDPOINTS PARA GESTIÓN DE RESIDUOS (CRUD)

// 1. Obtener todos los residuos (GET /api/residuos)
// **ACTUALIZADO: Ahora acepta un parámetro de consulta para filtrar por punto_recoleccion**
app.get('/api/residuos', async (req, res) => {
    try {
        if (!db) { // Verifica si la conexión a la base de datos está activa
            return res.status(500).json({ message: 'Error: La base de datos no está conectada.' });
        }
        const residuosCollection = db.collection(COLLECTION_NAME);

        let query = {}; // Objeto de consulta vacío por defecto

        // Si se proporciona un parámetro 'punto_recoleccion' en la URL, se añade al query
        if (req.query.punto_recoleccion) {
            // Se usa una expresión regular con 'i' para búsqueda insensible a mayúsculas/minúsculas
            // Y se escapa el valor para evitar inyección Regex (aunque simple)
            query.punto_recoleccion = { $regex: new RegExp(req.query.punto_recoleccion, 'i') };
        }

        const residuos = await residuosCollection.find(query).toArray(); // Encuentra documentos basados en el query
        res.json(residuos); // Envía los datos como una respuesta JSON
    } catch (err) {
        console.error('Error al obtener los residuos:', err);
        res.status(500).json({ message: 'Error interno del servidor al obtener residuos: ' + err.message });
    }
});

// 2. Dar de Alta un nuevo Residuo (POST /api/residuos)
app.post('/api/residuos', async (req, res) => {
    const nuevoResiduo = {
        tipo: req.body.tipo,
        cantidad: req.body.cantidad !== undefined ? Number(req.body.cantidad) : undefined, // Asegura que cantidad sea un número
        estatus: req.body.estatus,
        punto_recoleccion: req.body.punto_recoleccion,
        situacion: req.body.situacion
    };

    if (!nuevoResiduo.tipo || nuevoResiduo.cantidad === undefined || !nuevoResiduo.estatus || !nuevoResiduo.punto_recoleccion || !nuevoResiduo.situacion) {
        return res.status(400).json({ message: 'Faltan campos requeridos para el nuevo residuo (tipo, cantidad, estatus, punto_recoleccion, situacion).' });
    }

    try {
        if (!db) {
            return res.status(500).json({ message: 'Error: La base de datos no está conectada.' });
        }
        const residuosCollection = db.collection(COLLECTION_NAME);
        const result = await residuosCollection.insertOne(nuevoResiduo);
        console.log('Nuevo residuo insertado con ID:', result.insertedId);
        res.status(201).json({ message: 'Residuo agregado con éxito.', id: result.insertedId });
    } catch (err) {
        console.error('Error al insertar residuo:', err);
        res.status(500).json({ message: 'Error interno del servidor al insertar residuo: ' + err.message });
    }
});

// 3. Actualizar un Residuo (PUT /api/residuos/:id)
app.put('/api/residuos/:id', async (req, res) => {
    const residuoId = req.params.id;
    const datosAActualizar = req.body;

    if (!residuoId) {
        return res.status(400).json({ message: 'ID de residuo es requerido para la actualización.' });
    }

    let objectId;
    try {
        objectId = new ObjectId(residuoId);
    } catch (e) {
        return res.status(400).json({ message: 'ID de residuo inválido. Debe ser un ObjectId válido.' });
    }

    const updateDoc = { $set: {} };
    for (const key in datosAActualizar) {
        if (datosAActualizar.hasOwnProperty(key)) {
            if (key === 'cantidad') {
                updateDoc.$set[key] = Number(datosAActualizar[key]);
            }
            else {
                updateDoc.$set[key] = datosAActualizar[key];
            }
        }
    }

    delete updateDoc.$set._id;

    if (Object.keys(updateDoc.$set).length === 0) {
        return res.status(400).json({ message: 'No se proporcionaron datos para actualizar.' });
    }

    try {
        if (!db) {
            return res.status(500).json({ message: 'Error: La base de datos no está conectada.' });
        }
        const residuosCollection = db.collection(COLLECTION_NAME);
        
        const result = await residuosCollection.updateOne(
            { _id: objectId },
            updateDoc
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Residuo no encontrado.' });
        }
        if (result.modifiedCount === 0) {
            return res.status(200).json({ message: 'Residuo encontrado, pero no se realizaron cambios (el valor ya era el mismo o no hay datos nuevos).' });
        }

        console.log('Residuo actualizado con ID:', residuoId);
        res.status(200).json({ message: 'Residuo actualizado con éxito.' });
    } catch (err) {
        console.error('Error al actualizar residuo:', err);
        res.status(500).json({ message: 'Error interno del servidor al actualizar residuo: ' + err.message });
    }
});


// 4. Eliminar un Residuo (DELETE /api/residuos/:id)
app.delete('/api/residuos/:id', async (req, res) => {
    const residuoId = req.params.id;

    if (!residuoId) {
        return res.status(400).json({ message: 'ID de residuo es requerido para la eliminación.' });
    }

    let objectId;
    try {
        objectId = new ObjectId(residuoId);
    } catch (e) {
        return res.status(400).json({ message: 'ID de residuo inválido. Debe ser un ObjectId válido.' });
    }

    try {
        if (!db) {
            return res.status(500).json({ message: 'Error: La base de datos no está conectada.' });
        }
        const residuosCollection = db.collection(COLLECTION_NAME);
        
        const result = await residuosCollection.deleteOne({ _id: objectId });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Residuo no encontrado para eliminar.' });
        }

        console.log('Residuo eliminado con ID:', residuoId);
        res.status(200).json({ message: 'Residuo eliminado con éxito.' });
    } catch (err) {
        console.error('Error al eliminar residuo:', err);
        res.status(500).json({ message: 'Error interno del servidor al eliminar residuo: ' + err.message });
    }
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor de Gestión de Residuos corriendo en http://localhost:${PORT}`);
    console.log(`Abre tu navegador en http://localhost:${PORT} para acceder a la aplicación.`);
});

// Manejar el cierre de la conexión de MongoDB cuando la aplicación se detenga
process.on('SIGINT', async () => {
    console.log('Cerrando conexión a MongoDB...');
    if (client) {
        await client.close();
    }
    console.log('Conexión a MongoDB cerrada.');
    process.exit(0);
});
