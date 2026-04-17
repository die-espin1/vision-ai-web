FROM node:18

# Instalar Python
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app
COPY . .

# Node
RUN npm install

# Python
RUN pip3 install -r requirements.txt

# Crear carpetas
RUN mkdir -p uploads vozIA screenshots distancia

EXPOSE 3000
EXPOSE 8000

# Ejecutar ambos servicios
CMD ["sh", "-c", "uvicorn python_api:app --host 0.0.0.0 --port 8000 & node server.js"]