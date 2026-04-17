from fastapi import FastAPI, UploadFile, File
import cv2
import numpy as np
import os
from depth_anything.inference import DepthAnythingInference

app = FastAPI()

model_path = './depth_anything/models/depth_anything_vits14.onnx'
output_dir = './distancia'

os.makedirs(output_dir, exist_ok=True)

depth_model = DepthAnythingInference(model_path=model_path, color=True)

@app.post("/process-image")
async def process_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()

        # Convertir bytes a imagen OpenCV
        np_arr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if image is None:
            return {"error": "Imagen inválida"}

        # Procesar con IA
        depth = depth_model.frame_inference(image)

        output_path = os.path.join(output_dir, "distancia.png")
        cv2.imwrite(output_path, depth)

        return {
            "success": True,
            "output": output_path
        }

    except Exception as e:
        return {"error": str(e)}