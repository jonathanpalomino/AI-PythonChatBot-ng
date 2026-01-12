# 🚀 Guía de Inicio Rápido - AI Workspace

> [!NOTE]
> **Disclaimer**: Este es un proyecto personal desarrollado con fines educativos. Requiere el backend [AI-PythonChatBot](https://github.com/jonathanpalomino/AI-PythonChatBot) para funcionar.

## 📦 Despliegue Express

### 1. Preparación del Entorno
Asegúrese de tener Node.js 18+ y Python 3.10+ instalados.

```bash
# 1. Instalar dependencias del frontend
npm install

# 2. Verificar o instalar Angular CLI
npm install -g @angular/cli@17
```

### 2. Conexión con Backend
El sistema requiere el motor de orquestación corriendo.

1.  Clone y ejecute el backend desde [AI-PythonChatBot](https://github.com/jonathanpalomino/AI-PythonChatBot).
2.  Verifique la salud del servicio:
    ```bash
    curl http://localhost:8000/health
    # Debe responder: {"status":"ok", ...}
    ```

### 3. Lanzamiento
Inicie el servidor de desarrollo con proxy preconfigurado:

```bash
npm start
# Acceda a la plataforma en: http://localhost:4200
```

---

## ⚡ Primeros Pasos en la Plataforma

### 1. Configuración de Workspace
Al iniciar, utilice el **Asistente de Configuración** para establecer su entorno:

*   **Identidad**: Defina el nombre y el rol del asistente.
*   **Motor de IA**: Seleccione entre ejecución local (Ollama) o proveedores Cloud (OpenAI, Anthropic).
*   **Capacidades**: Active módulos según necesidad:
    *   `RAG`: Para análisis documental.
    *   `Code Interpreter`: Para ejecución de código.
    *   `Memory`: Para persistencia de contexto.

### 2. Gestión de Documentos (RAG)
Para "chatear" con sus propios datos:
1.  Vaya al panel de **Archivos** (Icono 🗂️).
2.  Suba documentos PDF, DOCX o archivos de código.
3.  El sistema los procesará e indexará automáticamente en la base de datos vectorial.

### 3. Uso de Herramientas
El sistema no es solo un chat, es una consola de mando.
*   Escriba `/` para ver comandos rápidos.
*   Use el botón **Tools** para activar/desactivar capacidades en tiempo real.

---

## 🔧 Solución de Problemas Comunes

### 🔴 Error de Conexión (Backend no responde)
*   **Causa**: El servidor Python no está corriendo o el puerto 8000 está ocupado.
*   **Solución**: Verifique la terminal del backend y asegúrese de que `http://localhost:8000/docs` sea accesible.

### 🔴 Modelos Locales no disponibles
*   **Causa**: Ollama no está ejecutándose o no tiene modelos descargados.
*   **Solución**:
    ```bash
    ollama serve
    ollama pull mistral  # Ejemplo
    ```

### 🔴 Error CORS
*   **Causa**: El frontend intenta conectar directamente sin el proxy de desarrollo.
*   **Solución**: Asegúrese de usar `npm start` en lugar de `ng serve` si no ha configurado CORS en el backend para su IP local.