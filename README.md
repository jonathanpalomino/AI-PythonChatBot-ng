# AI Workspace: Plataforma de Orquestación y Análisis Inteligente

> [!NOTE]
> **Disclaimer**: Este es un proyecto personal desarrollado con fines educativos y de investigación. Aunque utiliza una arquitectura y prácticas profesionales, no es un producto empresarial oficial ni cuenta con soporte comercial.

Plataforma profesional diseñada para centralizar la interacción con Modelos de Lenguaje (LLMs), gestión de conocimiento y automatización de tareas. Este sistema ofrece una arquitectura robusta para orquestar modelos locales y en la nube, con un enfoque en la privacidad de datos, la gestión de proyectos y la extensibilidad mediante herramientas personalizadas.

## 🌟 Propuesta de Valor

Diseñada para entornos que requieren precisión, control y flexibilidad, esta solución permite:
*   **Orquestación Unificada**: Interfaz única para interactuar con Ollama, OpenAI, Anthropic, Google y OpenRouter.
*   **Gestión de Contexto Avanzada**: RAG (Retrieval-Augmented Generation) granular por proyecto y memoria de largo plazo.
*   **Extensibilidad Empresarial**: Sistema de plugins para integrar herramientas personalizadas (APIs, scripts, automatizaciones).

## 🚀 Capacidades Principales

### 🧠 Orquestación Multi-Modelo
Gestione y cambie dinámicamente entre proveedores de IA según la complejidad de la tarea y el presupuesto.
*   **Soporte Local**: Integración nativa con Ollama para privacidad total y latencia cero.
*   **Soporte Cloud**: Acceso a los modelos SOTA (GPT-4, Claude 3.5, Gemini 1.5).
*   **Control de Costos**: Monitoreo de uso de tokens y selectores de modelos inteligentes.

### 📂 Gestión de Proyectos y Conocimiento
Organice sus flujos de trabajo en espacios aislados.
*   **Workspaces (Proyectos)**: Aísle el contexto, los archivos y las configuraciones por proyecto.
*   **RAG Semántico**: Motor de búsqueda vectorial integrado (Qdrant) para "chatear" con sus documentos (PDF, DOCX, Codebases).
*   **Memoria Persistente**: El sistema recuerda preferencias y detalles críticos a través de las sesiones.

### 🛠️ Ecosistema de Herramientas (Tools)
Transforme el chat en una consola de mando activa.
*   **Code Interpreter**: Análisis y generación de código en tiempo real.
*   **Web Search**: Búsqueda en internet para información actualizada.
*   **Custom Tools Manager**: Interfaz visual para definir y conectar sus propias herramientas vía API o scripts locales, permitiendo que la IA ejecute acciones específicas de su negocio.

### ⚡ Ingeniería de Prompts
*   **Librería de Prompts**: Cree, guarde y reutilice plantillas de prompts optimizadas.
*   **Modos de Respuesta**: Configure la "personalidad" del asistente (Estricto, Balanceado, Creativo) para asegurar la fiabilidad de las respuestas.

## 🏗️ Arquitectura Técnica

Construido sobre un stack moderno y escalable:
*   **Frontend**: Angular 17+ con diseño reactivo, gestión de estado eficiente y UI/UX premium.
*   **Backend**: [AI-PythonChatBot](https://github.com/jonathanpalomino/AI-PythonChatBot) (FastAPI) para procesamiento asíncrono y gestión de conexiones LLM.
*   **Vector Database**: Qdrant para indexación y recuperación de alta velocidad.

## 📂 Estructura del Proyecto

El código está organizado siguiendo las mejores prácticas de arquitectura modular en Angular:

```plaintext
src/
├── app/
│   ├── components/         # Componentes UI reutilizables y modales
│   │   ├── ai-model-selector/      # Selector de proveedor/modelo
│   │   ├── chat-input/             # Área de entrada con soporte multi-línea
│   │   ├── custom-tools-manager/   # Gestor de herramientas personalizadas
│   │   └── ...
│   ├── services/           # Lógica de negocio y comunicación API
│   │   ├── api.service.ts          # Cliente HTTP unificado
│   │   ├── chat.service.ts         # Orquestador del estado del chat
│   │   └── ...
│   ├── models/             # Interfaces y tipos TypeScript
│   ├── environments/       # Configuraciones por entorno (Dev/Prod)
│   └── app.ts              # Componente raíz y lógica de layout
└── assets/                 # Recursos estáticos
```

## 📋 Requisitos del Sistema

*   **Node.js**: v18 o superior.
*   **Angular CLI**: v17+.
*   **Backend**: Instancia del servidor [AI-PythonChatBot](https://github.com/jonathanpalomino/AI-PythonChatBot) activa (puerto 8001 por defecto).
*   **Opcional**: Servidor Ollama para inferencia local.

## 🔧 Guía de Inicio Rápido

### 1. Instalación
```bash
# Instalar dependencias del frontend
npm install
```

### 2. Configuración de Entorno
Asegúrese de que el archivo `src/environments/environment.ts` apunte a su instancia de backend:

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8001', // URL de su API Gateway/Backend
  // ...
};
```

### 3. Ejecución
```bash
# Iniciar servidor de desarrollo
ng serve
```
La aplicación estará disponible en `http://localhost:4200`.

## 🐛 Solución Rápida de Problemas

### ❌ Backend no responde
*   **Síntoma**: El chat no conecta o da errores 500/504.
*   **Solución**: Verifique que el servidor Python esté corriendo en el puerto correcto.
    ```bash
    curl http://localhost:8001/health
    # Debería retornar: {"status":"ok", ...}
    ```

### ❌ Error de CORS
*   **Síntoma**: Errores en consola del navegador sobre "Access-Control-Allow-Origin".
*   **Solución**: Asegúrese de iniciar el frontend con `npm start` (que usa el proxy configurado) y no `ng serve` directamente, o verifique la configuración de CORS en el backend.

### ❌ Modelos de Ollama no disponibles
*   **Síntoma**: La lista de modelos locales aparece vacía.
*   **Solución**:
    1. Asegúrese de que Ollama esté corriendo: `ollama serve`
    2. Verifique modelos instalados: `ollama list`
    3. Descargue un modelo si es necesario: `ollama pull mistral`

## 🤝 Contribución y Extensión
Este sistema está diseñado para ser extendido. Consulte la documentación interna sobre "Custom Tools" para aprender cómo integrar sus propias APIs empresariales al flujo de chat.