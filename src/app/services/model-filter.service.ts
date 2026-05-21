// src/app/services/model-filter.service.ts
import { Injectable } from '@angular/core';
import { ModelInfo, PromptTemplate } from '../models/models';

@Injectable({
    providedIn: 'root'
})
export class ModelFilterService {

    /**
     * Filter models by thinking/reasoning capability
     */
    getThinkingModels(models: Record<string, ModelInfo[]>): Record<string, ModelInfo[]> {
        return this.filterModels(models, m => m.supports_thinking && m.is_active);
    }

    /**
     * Filter models by function calling (tools) capability
     */
    getToolCapableModels(models: Record<string, ModelInfo[]>): Record<string, ModelInfo[]> {
        return this.filterModels(models, m => m.supports_function_calling && m.is_active);
    }

    /**
     * Filter to only active models
     */
    getActiveModels(models: Record<string, ModelInfo[]>): Record<string, ModelInfo[]> {
        return this.filterModels(models, m => m.is_active);
    }

    /**
     * Get recommended models based on prompt template requirements
     */
    getRecommendedModelsForTemplate(
        template: PromptTemplate,
        allModels: Record<string, ModelInfo[]>
    ): Record<string, ModelInfo[]> {
        const settings = template.settings;

        // If the template uses tools, filter by function calling
        if (settings?.['default_tools'] && settings['default_tools'].length > 0) {
            return this.getToolCapableModels(allModels);
        }

        // If the template name suggests coding/reasoning
        const nameLC = template.name.toLowerCase();
        if (nameLC.includes('código') || nameLC.includes('code') ||
            nameLC.includes('especialista') || nameLC.includes('reasoning')) {
            return this.getThinkingModels(allModels);
        }

        // By default, only active models
        return this.getActiveModels(allModels);
    }

    /**
     * Generic filter function
     */
    private filterModels(
        models: Record<string, ModelInfo[]>,
        predicate: (model: ModelInfo) => boolean
    ): Record<string, ModelInfo[]> {
        const filtered: Record<string, ModelInfo[]> = {};

        for (const [provider, modelList] of Object.entries(models)) {
            const filteredList = modelList.filter(predicate);
            if (filteredList.length > 0) {
                filtered[provider] = filteredList;
            }
        }

        return filtered;
    }
}
