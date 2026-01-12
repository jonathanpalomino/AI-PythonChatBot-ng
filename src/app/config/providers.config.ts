// src/app/config/providers.config.ts

export const SUPPORTED_PROVIDERS = [
    {
        id: 'local',
        name: 'Local (Ollama)',
        icon: '🖥️'
    },
    {
        id: 'openai',
        name: 'OpenAI',
        icon: '🤖'
    },
    {
        id: 'anthropic',
        name: 'Claude',
        icon: '🧠'
    },
    {
        id: 'google',
        name: 'Gemini',
        icon: '💎'
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: '🔀'
    },
    {
        id: 'groq',
        name: 'Groq',
        icon: '⚡'
    }
] as const;
