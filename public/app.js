let mediaRecorder;
let audioChunks = [];
let isRecording = false;

$(function () {
    // Selecciona el primer elemento de tipo <video> del documento y lo guarda en la variable 'video'
    const video = $("video")[0];

    // Arreglo de objetos que contienen información sobre diferentes modelos de detección de objetos
    var models = [
        { publishable_key: "rf_k7RD3VjpGHUtNclNpYKYlQna2wg2", toLoad: { model: "people-detection-general", version: 1, name: "modelo8" } }, //Personas
        { publishable_key: "rf_J9hbgxBf51O9KtL2JJ7Ga4cFZyj1", toLoad: { model: "lentes-hbppc", version: 1, name: "modelo9" }} //Shirt, laptop -> kescobar@fundacionpadrearrupe.org.sv
    ];

    // Contadores y variables para controlar el estado de carga de los modelos y el modo de la cámara
    var modelsLoaded = 0;
    var modelsArray = [];
    var cameraMode = "environment"; // or "user"

    // Promesa para iniciar el streaming de video desde la cámara
    const startVideoStreamPromise = navigator.mediaDevices
        .getUserMedia({
            audio: false,
            video: {
                facingMode: cameraMode
            }
        })
        .then(function (stream) {
            return new Promise(function (resolve) {
                // Asigna el stream al elemento video y cuando está cargado, lo reproduce
                video.srcObject = stream;
                video.onloadeddata = function () {
                    video.play();
                    resolve();
                };
            });
        })
        .catch(function (error) {
            console.error("Error accessing camera:", error);
            alert("No se pudo acceder a la cámara: " + error.message);
        });

    // Función para cargar los modelos de detección
    const loadModels = function () {
        const loadPromises = models.map((modelInfo) => {
            return roboflow
                .auth({
                    publishable_key: modelInfo.publishable_key
                })
                .load(modelInfo.toLoad)
                .then(function (m) {
                    modelsArray.push(m);
                    modelsLoaded++;
                })
                .catch(function (error) {
                    console.error("Error loading model:", error);
                });
        });

        return Promise.all(loadPromises);
    };

    // Variables para el canvas y su contexto, y definición de la fuente para el texto
    var canvas, ctx;
    const font = "16px sans-serif";

    function videoDimensions(video) {
        // Ratio of the video's intrisic dimensions
        var videoRatio = video.videoWidth / video.videoHeight;

        // The width and height of the video element
        var width = video.offsetWidth,
            height = video.offsetHeight;

        // The ratio of the element's width to its height
        var elementRatio = width / height;

        // If the video element is short and wide
        if (elementRatio > videoRatio) {
            width = height * videoRatio;
        } else {
            // It must be tall and thin, or exactly equal to the original ratio
            height = width / videoRatio;
        }

        return {
            width: width,
            height: height
        };
    }

    $(window).resize(function () {
        resizeCanvas();
    });

    const resizeCanvas = function () {
        $("canvas").remove();

        canvas = $("<canvas/>");

        ctx = canvas[0].getContext("2d");

        var dimensions = videoDimensions(video);

        canvas[0].width = video.videoWidth;
        canvas[0].height = video.videoHeight;

        canvas.css({
            width: dimensions.width,
            height: dimensions.height,
            left: ($(window).width() - dimensions.width) / 2,
            top: ($(window).height() - dimensions.height) / 2
        });

        $("body").append(canvas);
    };

    const renderPredictions = function (predictions) {
        var scale = 1;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Primero dibujamos todos los fondos de las etiquetas
        predictions.forEach(function (prediction) {
            const x = prediction.bbox.x;
            const y = prediction.bbox.y;
            const width = prediction.bbox.width;
            const height = prediction.bbox.height;

            // Crear el texto con clase y confianza
            const labelText = `${prediction.class} ${(prediction.confidence * 100).toFixed(1)}`;
            
            // Draw the bounding box.
            ctx.strokeStyle = prediction.color;
            ctx.lineWidth = 4;
            ctx.strokeRect(
                (x - width / 2) / scale,
                (y - height / 2) / scale,
                width / scale,
                height / scale
            );

            // Draw the label background.
            ctx.fillStyle = prediction.color;
            const textWidth = ctx.measureText(labelText).width;
            const textHeight = parseInt(font, 10); // base 10
            ctx.fillRect(
                (x - width / 2) / scale,
                (y - height / 2) / scale,
                textWidth + 8,
                textHeight + 4
            );
        });

        // Luego dibujamos todos los textos
        predictions.forEach(function (prediction) {
            const x = prediction.bbox.x;
            const y = prediction.bbox.y;
            const width = prediction.bbox.width;
            const height = prediction.bbox.height;

            // Crear el texto con clase y confianza
            const labelText = `${prediction.class} ${(prediction.confidence * 100).toFixed(1)}`;

            // Draw the text last to ensure it's on top.
            ctx.font = font;
            ctx.textBaseline = "top";
            ctx.fillStyle = "#000000";
            ctx.fillText(
                labelText,
                (x - width / 2) / scale + 4,
                (y - height / 2) / scale + 1
            );
        });
    };

    // Cuando se cargan los modelos, se quita la clase 'loading' del body, se redimensiona el canvas y se inicia la detección de fotogramas
    loadModels().then(function () {
        $("body").removeClass("loading");
        resizeCanvas();
        detectFrame();
    });

    // Variables para el cálculo del FPS
    var prevTime;
    var pastFrameTimes = [];

    // Función para detectar fotogramas y realizar la detección de objetos
    const detectFrame = function () {
        // Si no se han cargado modelos, se solicita el próximo cuadro de animación
        if (modelsArray.length === 0) return requestAnimationFrame(detectFrame);

        // Se realizan predicciones para cada modelo y se combinan en un único arreglo
        Promise.all(modelsArray.map(model => model.detect(video)))
            .then(function (allPredictions) {
                const mergedPredictions = allPredictions.flat();

                requestAnimationFrame(detectFrame);
                // Se renderizan las predicciones en el canvas
                renderPredictions(mergedPredictions);

                // Se calcula el FPS y se muestra en un elemento HTML
                if (prevTime) {
                    pastFrameTimes.push(Date.now() - prevTime);
                    if (pastFrameTimes.length > 30) pastFrameTimes.shift();

                    var total = 0;
                    pastFrameTimes.forEach(function (t) {
                        total += t / 1000;
                    });

                    var fps = pastFrameTimes.length / total;
                    $("#fps").text(Math.round(fps));
                }
                prevTime = Date.now();
            })
            .catch(function (e) {
                requestAnimationFrame(detectFrame);
            });
    };

    // Event listeners dentro del document ready
    document.getElementById('recordButton').addEventListener('click', () => {
        init();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'c' || event.key === 'C') {
            takeScreenshot();
            console.log("---------------------------------")
            console.log("---------------------------------")
            console.log("---------------------------------")
            console.log("---------------------------------")
            console.log("FOTO TOMADA")
            console.log("---------------------------------")
            console.log("---------------------------------")
            console.log("---------------------------------")
            console.log("---------------------------------")
        }
        
        if (event.key.toLowerCase() === 'h') {
            init();
        }
    });
});

function takeScreenshot() {
    // Seleccionar el elemento de video
    const video = document.querySelector('video');
    
    if (!video) {
        console.error("No se encontró el elemento de video");
        return;
    }
    
    // Crear un canvas temporal para capturar la imagen del video
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convertir la imagen del canvas a formato base64
    const imageData = canvas.toDataURL('image/png');
    
    // Enviar la imagen al servidor para guardarla
    fetch('/save-screenshot', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: imageData })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Captura de pantalla guardada:', data);
    })
    .catch(error => {
        console.error('Error al guardar la captura de pantalla:', error);
    });
}

// ==================== INTEGRACIÓN OPENAI WEBRTC ====================

async function init() {
    if (!window.RTCPeerConnection) {
        console.error("WebRTC no está soportado en este navegador");
        alert("WebRTC no está soportado en tu navegador");
        return;
    }

    console.log("Iniciando conexión...");

    try {
        const tokenResponse = await fetch("/session");
        if (!tokenResponse.ok) {
            throw new Error(`Error en la respuesta del servidor: ${tokenResponse.status}`);
        }
        
        const data = await tokenResponse.json();
        const EPHEMERAL_KEY = data.client_secret.value;

        const pc = new RTCPeerConnection();
        const audioEl = document.getElementById('audio');

        if (!audioEl) {
            console.error("No se encontró el elemento de audio");
            return;
        }

        pc.ontrack = (event) => {
            audioEl.srcObject = event.streams[0];
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const dc = pc.createDataChannel("oai-events");

        dc.addEventListener("message", (event) => {
            try {
                const realtimeEvent = JSON.parse(event.data);
                console.log("Evento recibido:", realtimeEvent);

                if (realtimeEvent.type === "response.done" && 
                    realtimeEvent.response?.output?.length > 0 && 
                    realtimeEvent.response.output[0].content) {

                    const transcript = realtimeEvent.response.output[0].content.find(item => item.type === "audio")?.transcript;

                    if (transcript) {
                        const messagesElement = document.getElementById('messages');
                        if (messagesElement) {
                            messagesElement.innerText = `${transcript}`;
                        }
                        console.log("Transcripción:", transcript);

                        fetch("/log-transcript", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ transcript: transcript })
                        }).catch(error => {
                            console.error("Error al enviar transcripción:", error);
                        });
                    } else {
                        const messagesElement = document.getElementById('messages');
                        if (messagesElement) {
                            messagesElement.innerText = 'No se encontró una transcripción válida.';
                        }
                    }
                }
            } catch (error) {
                console.error("Error al procesar el evento:", error);
                const messagesElement = document.getElementById('messages');
                if (messagesElement) {
                    messagesElement.innerText = 'Error al procesar la transcripción.';
                }
            }
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const model = "gpt-4o-realtime-preview-2024-12-17";
        const baseUrl = "https://api.openai.com/v1/realtime";
        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                "Content-Type": "application/sdp"
            }
        });

        if (!sdpResponse.ok) {
            throw new Error(`Error en la conexión OpenAI: ${sdpResponse.status}`);
        }

        const answer = {
            type: "answer",
            sdp: await sdpResponse.text(),
        };
        
        await pc.setRemoteDescription(answer);
        
    } catch (error) {
        console.error("Error en init():", error);
        const messagesElement = document.getElementById('messages');
        if (messagesElement) {
            messagesElement.innerText = `Error: ${error.message}`;
        }
    }
}

window.h = init;