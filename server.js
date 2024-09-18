const express = require('express');
const path = require('path');
const translate = require('node-google-translate-skidz');

// Crear la aplicación Express
const app = express();

// Puerto en el que el servidor va a escuchar
const PORT = 3000;

// Middleware para servir archivos estáticos (como CSS, JS y imágenes)
app.use(express.static(path.join(__dirname, '/public/')));

// Ruta para servir el archivo index.html en la raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/', 'index.html'));
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://127.0.0.1:${PORT}`);
});

// Middleware para servir archivos estáticos
app.use(express.static('public'));

// Endpoint para traducir texto
app.get('/traducir', (req, res) => {
    const texto = req.query.text;

    // Verificar si el texto está definido y no está vacío
    if (typeof texto !== 'string' || texto.trim() === '') {
        return res.json({ translation: texto || '' }); // Devuelve el texto original o una cadena vacía
    }

    translate({
        text: texto,
        source: 'en',
        target: 'es'
    }, (result) => {
        if (result && result.translation) {
            res.json({ translation: result.translation });
        } else {
            res.status(500).json({ error: 'Error en la traducción' });
        }
    });
});

