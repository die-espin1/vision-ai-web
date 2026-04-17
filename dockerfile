FROM node:18

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm install

# 🔥 AQUÍ está la clave
RUN pip3 install --break-system-packages -r requirements.txt

RUN mkdir -p uploads vozIA screenshots distancia

EXPOSE 3000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn python_api:app --host 0.0.0.0 --port 8000 & node server.js"]