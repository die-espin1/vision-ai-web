import cv2
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from depth_anything.inference import DepthAnythingInference

class IntelligentDodgeRobot:
    def __init__(self, model_path):
        self.depth_anything = DepthAnythingInference(model_path=model_path, color=True)

    def process_image(self, image_path, output_path):
        # Leer la imagen
        image = cv2.imread(image_path)
        if image is None:
            print(f"Error: Could not open image file {image_path}")
            return

        # Procesar la imagen con el modelo de DepthAnything
        img_depth = self.depth_anything.frame_inference(image)

        # Guardar la imagen procesada como 'distancia.png'
        cv2.imwrite(output_path, img_depth)
        print(f"Processed image saved at {output_path}")

class ScreenshotHandler(FileSystemEventHandler):
    def __init__(self, robot, output_dir):
        self.robot = robot
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def on_created(self, event):
        if event.is_directory:
            return
        # Procesar la nueva imagen
        image_path = event.src_path
        output_path = os.path.join(self.output_dir, 'distancia.png')  # Guardar siempre como 'distancia.png'
        self.robot.process_image(image_path, output_path)

if __name__ == "__main__":
    model_path = r'D:\VisionAI\VisionAI\Voz\depth_anything\models\depth_anything_vits14.onnx'
    screenshots_dir = r'D:\VisionAI\VisionAI\Voz\screenshots'
    output_dir = r'D:\VisionAI\VisionAI\Voz\distancia'

    robot_intelligent = IntelligentDodgeRobot(model_path)

    event_handler = ScreenshotHandler(robot_intelligent, output_dir)
    observer = Observer()
    observer.schedule(event_handler, screenshots_dir, recursive=False)
    observer.start()

    try:
        print("Monitoring for new images in the 'screenshots' folder...")
        while True:
            pass  # Mantener el script en ejecución
    except KeyboardInterrupt:
        observer.stop()
    observer.join()





