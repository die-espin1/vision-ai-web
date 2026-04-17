const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const player = require('play-sound')(opts = {});
const bodyParser = require('body-parser');
const axios = require('axios');
const fetch = require('node-fetch');
const cors = require('cors');

// 🔑 Tu API Key de OpenAI (usa variables de entorno en producción)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const app = express();

// Crear directorios necesarios
const directories = ['./uploads', './vozIA', './screenshots'];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Directorio creado: ${dir}`);
  }
});

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(bodyParser.json({ limit: '10mb' }));

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, 'audio.mp3'),
});
const upload = multer({ storage });

// 🔹 Limpiar carpeta vozIA
function clearVozIADirectory() {
  const directory = path.join(__dirname, 'vozIA');
  fs.readdir(directory, (err, files) => {
    if (err) {
      console.log('No se pudo leer directorio vozIA:', err.message);
      return;
    }
    
    if (files.length === 0) {
      console.log('Directorio vozIA ya está vacío');
      return;
    }

    let deleteCount = 0;
    const deletePromises = files.map(file => {
      return new Promise((resolve, reject) => {
        fs.unlink(path.join(directory, file), err => {
          if (err) {
            console.error(`Error eliminando ${file}:`, err.message);
            reject(err);
          } else {
            deleteCount++;
            resolve();
          }
        });
      });
    });

    Promise.all(deletePromises)
      .then(() => {
        console.log(`Contenido de vozIA eliminado (${deleteCount} archivos)`);
      })
      .catch(error => {
        console.error('Error eliminando archivos:', error);
      });
  });
}

app.post('/clear-vozIA', (req, res) => {
  clearVozIADirectory();
  res.sendStatus(200);
});

// 🔹 Subida y transcripción de audio
app.post('/upload', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió archivo de audio' });
  }

  console.log('Archivo recibido y guardado:', req.file.path);

  try {
    // Transcribir con Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
    });
    console.log('Transcripción:', transcription.text);

    // Responder con GPT
    const gptResponse = await openai.chat.completions.create({
      messages: [
        { 
          role: 'system', 
          content: 'Eres EVA, una IA creada por Diego Espinoza. Responde solo si te lo piden. Si el input es un texto, léelo tal cual. Identifica monedas/billetes y da el total.' 
        },
        { role: 'user', content: transcription.text },
      ],
      model: 'gpt-4',
    });

    const gptText = gptResponse.choices[0].message.content;
    console.log('Respuesta GPT-4:', gptText);

    // Convertir respuesta a voz
    const speechFile = path.resolve('./vozIA/IA.mp3');
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: gptText,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(speechFile, buffer);
    console.log('Respuesta convertida a voz en vozIA/IA.mp3');

    // Reproducir audio
    player.play(speechFile, err => {
      if (err) {
        console.error('Error reproduciendo audio:', err);
      } else {
        console.log('Reproduciendo IA.mp3');
      }
    });

    res.json({ 
      success: true, 
      transcription: transcription.text,
      response: gptText 
    });

  } catch (error) {
    console.error('Error en transcripción/IA/TTS:', error);
    res.status(500).json({ 
      error: 'Error procesando audio', 
      message: error.message 
    });
  }
});

// 🔹 Texto a voz
async function convertTextToSpeech(text) {
  try {
    const speechFile = path.resolve('./vozIA/IA.mp3');
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(speechFile, buffer);
    console.log('Texto convertido a voz en vozIA/IA.mp3');

    player.play(speechFile, err => {
      if (err) {
        console.error('Error reproduciendo audio:', err);
      } else {
        console.log('Reproduciendo IA.mp3');
      }
    });
    
    return speechFile;
  } catch (error) {
    console.error('Error en TTS:', error);
    throw error;
  }
}

// 🔹 Describir imagen con GPT-4o
async function describeImage(imagePath) {
  try {
    const base64Image = fs.readFileSync(imagePath).toString('base64');
    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: 'Analiza la imagen y describe detalladamente lo que ves en un párrafo: personas, ropa, posición, texto, colores, rutas de buses, etc. Si no hay algo, no lo menciones.' 
            },
            { 
              type: 'image_url', 
              image_url: { 
                url: `data:image/jpeg;base64,${base64Image}` 
              } 
            },
          ],
        },
      ],
      max_tokens: 300,
    };

    const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openai.apiKey}`,
      },
    });

    const description = response.data.choices[0].message.content;
    console.log('Descripción de la imagen:', description);

    await convertTextToSpeech(description);
    return description;
  } catch (error) {
    console.error('Error al describir la imagen:', error.response?.data || error.message);
    throw error;
  }
}


// 🔹 Guardar captura, describirla y procesarla con IA de profundidad
app.post('/save-screenshot', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    }

    // Convertir base64 a archivo
    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const screenshotPath = path.join(__dirname, 'screenshots', `foto_${Date.now()}.png`);

    await fs.promises.writeFile(screenshotPath, base64Data, 'base64');
    console.log('📸 Captura guardada en:', screenshotPath);

    // 🔹 1. Describir imagen con OpenAI
    const description = await describeImage(screenshotPath);

    // 🔹 2. Enviar imagen a API de Python (DepthAnything)
    let depthResult = null;

    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(screenshotPath));

      const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000/process-image';

      const pythonResponse = await axios.post(
        pythonApiUrl,
        formData,
        {
          headers: formData.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      depthResult = pythonResponse.data;
      console.log('🤖 Respuesta IA profundidad:', depthResult);

    } catch (pythonError) {
      console.error('⚠️ Error en IA de profundidad:', pythonError.message);
      depthResult = { error: 'No se pudo procesar profundidad' };
    }

    // 🔹 Respuesta final combinada
    res.status(200).json({
      success: true,
      message: 'Captura procesada correctamente',
      path: screenshotPath,
      description: description,
      depth: depthResult
    });

  } catch (error) {
    console.error('❌ Error procesando captura:', error);

    res.status(500).json({
      error: 'Error al procesar la captura',
      message: error.message
    });
  }
});


// 🔹 Endpoint para log de transcripciones (requerido por el frontend)
app.post('/log-transcript', (req, res) => {
  const { transcript } = req.body;
  console.log('📝 Transcripción recibida:', transcript);
  res.status(200).json({ success: true, message: 'Transcripción registrada' });
});

// 🔹 Sesión con OpenAI Realtime
app.get('/session', async (req, res) => {
  try {
    console.log('Solicitando sesión Realtime de OpenAI...');
    
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'verse',
        instructions: `Eres un chatbot llamado EVA. Respondes en español de forma breve y clara.
Si te piden activar un protocolo, responde "Protocolo activado".
Si te piden activar una acción, responde "Acción activada".

Cambios de idioma:
- "ahora en francés" → "Traduciendo a francés" y respondes en francés.
- "ahora en inglés" → "Traduciendo a inglés" y respondes en inglés.
- "ahora en ruso" → "Traduciendo a ruso" y respondes en ruso.
- "ahora en italiano" → "Traduciendo a italiano" y respondes en italiano.
- "ahora en chino" → "Traduciendo a chino" y respondes en chino.

Respuestas siempre breves, claras y en el idioma indicado.`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error de OpenAI API:', response.status, errorData);
      return res.status(response.status).json({ 
        error: 'Error de OpenAI', 
        details: errorData 
      });
    }

    const data = await response.json();
    console.log('Sesión Realtime creada exitosamente');
    res.json(data);

  } catch (error) {
    console.error('Error al generar sesión Realtime:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
});

// 🔹 Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    directories: directories 
  });
});

// 🔹 Manejo de errores global
app.use((error, req, res, next) => {
  console.error('Error global:', error);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: error.message 
  });
});

// 🔹 Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📁 Directorios verificados: ${directories.join(', ')}`);
  console.log(`🔑 API Key: ${OPENAI_API_KEY ? 'Configurada' : 'FALTANTE'}`);
});