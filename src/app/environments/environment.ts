// src/environments/environment.ts
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8001',
  apiUrl: '/api/v1',
  enableDebugLogs: true,
  version: '1.0.0'
};

// src/environments/environment.prod.ts
export const environmentProd = {
  production: true,
  apiBaseUrl: 'https://your-production-api.com',
  apiUrl: '/api/v1',
  enableDebugLogs: false,
  version: '1.0.0'
};

// angular.json - Configuración de builds
/*
"configurations": {
  "production": {
    "fileReplacements": [
      {
        "replace": "src/environments/environment.ts",
        "with": "src/environments/environment.prod.ts"
      }
    ]
  }
}
*/