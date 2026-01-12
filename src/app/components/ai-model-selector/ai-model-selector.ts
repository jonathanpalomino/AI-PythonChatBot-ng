import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { ModelInfo, ProvidersResponse, Provider as ProviderId } from '../../models/models';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SUPPORTED_PROVIDERS } from '../../config/providers.config';

interface ProviderUI {
    value: ProviderId;
    label: string;
    icon: string;
    models: ModelInfo[];  // Changed from string[] to ModelInfo[]
    isAvailable: boolean;
}

@Component({
    selector: 'app-ai-model-selector',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './ai-model-selector.html',
    styleUrls: ['./ai-model-selector.scss']
})
export class AiModelSelector implements OnInit, OnDestroy {
    @Input() parentForm!: FormGroup;
    @Input() providerControlName: string = 'provider';
    @Input() modelControlName: string = 'model';
    @Input() filterInactive: boolean = true;  // Filter out inactive models
    @Input() filterByThinking: boolean = false;  // Filter for thinking-capable models
    @Input() filterByTools: boolean = false;  // Filter for tool-capable models
    @Input() filterByCpuSupported: boolean = false;  // Filter for CPU supported models
    @Input() filterByGpuRequired: boolean = false;  // Filter for GPU required models
    @Input() filterByParentRetrieval: boolean = false; // Filter for parent retrieval supported models
    
    providers: ProviderUI[] = SUPPORTED_PROVIDERS.map(config => ({
        value: config.id,
        label: config.name,
        icon: config.icon,
        models: [],
        isAvailable: false
    }));
    
    embeddingModels: { name: string, provider: string }[] = [];

    hallucinationModes = [
        { value: 'strict', label: 'Estricto', icon: '🔒', description: 'Solo respuestas verificables con fuentes' },
        { value: 'balanced', label: 'Balanceado', icon: '⚖️', description: 'Balance entre precisión y flexibilidad' },
        { value: 'creative', label: 'Creativo', icon: '🎨', description: 'Permite inferencias y creatividad' }
    ];

    costFilter: 'all' | 'free' | 'paid' = 'all';
    private rawResponse: ProvidersResponse | null = null; // Store raw response for re-filtering

    private destroy$ = new Subject<void>();

    constructor(private apiService: ApiService) { }

    ngOnInit(): void {
        this.loadProviders();
        this.setupValueChanges();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private setupValueChanges(): void {
        this.parentForm.get(this.providerControlName)?.valueChanges
            .pipe(takeUntil(this.destroy$))
            .subscribe(provider => {
                const selectedProvider = this.providers.find(p => p.value === provider);
                const currentModel = this.parentForm.get(this.modelControlName)?.value;

                if (selectedProvider && selectedProvider.models.length > 0) {
                    const modelNames = selectedProvider.models.map(m => m.name);
                    if (!modelNames.includes(currentModel)) {
                        this.parentForm.patchValue({ [this.modelControlName]: selectedProvider.models[0].name });
                    }
                }
            });
    }

    loadProviders(): void {
        this.apiService.getProviders()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response: ProvidersResponse) => {
                    this.rawResponse = response; // Store raw response
                    this.applyFilters();
                },
                error: (error) => {
                    console.error('Error loading providers:', error);
                }
            });
    }

    setCostFilter(filter: 'all' | 'free' | 'paid'): void {
        this.costFilter = filter;
        this.applyFilters();
    }

    applyFilters(): void {
        if (!this.rawResponse) return;
        const response = this.rawResponse;

        // Reset all providers to unavailable first
        this.providers.forEach(p => p.isAvailable = false);

        if (response && response.models) {
            Object.keys(response.models).forEach(providerKey => {
                const provider = this.providers.find(p => p.value === providerKey);
                if (provider) {
                    let models = response.models[providerKey];

                    // Apply filters
                    if (this.filterInactive) {
                        models = models.filter(m => m.is_active);
                    }
                    if (this.filterByThinking) {
                        models = models.filter(m => m.supports_thinking);
                    }
                    if (this.filterByTools) {
                        models = models.filter(m => m.supports_function_calling);
                    }
                    if (this.filterByCpuSupported) {
                        models = models.filter(m => m.cpu_supported);
                    }
                    if (this.filterByGpuRequired) {
                        models = models.filter(m => m.gpu_required);
                    }
                    if (this.filterByParentRetrieval) {
                        models = models.filter(m => m.parent_retrieval_supported);
                    }

                    // COST FILTER
                    if (this.costFilter === 'free') {
                        models = models.filter(m => !this.isPaidModel(m));
                    } else if (this.costFilter === 'paid') {
                        models = models.filter(m => this.isPaidModel(m));
                    }

                    // Separate embedding models from chat models
                    const chatModels = models.filter(m => m.model_type !== 'embedding');
                    const embeddingModels = models.filter(m => m.model_type === 'embedding');
                    
                    // Populate embedding models for the 4th column
                    if (embeddingModels.length > 0) {
                        embeddingModels.forEach(m => {
                            this.embeddingModels.push({
                                name: m.name,
                                provider: providerKey
                            });
                        });
                    }

                    if (chatModels.length > 0) {
                        // Mark as available
                        provider.isAvailable = true;
                        provider.models = chatModels;

                        // Logic to preserve or update selected model if provider is already selected
                        const currentProvider = this.parentForm.get(this.providerControlName)?.value;
                        if (currentProvider === providerKey) {
                            const currentModel = this.parentForm.get(this.modelControlName)?.value;
                            const modelNames = chatModels.map(m => m.name);
                            if (!modelNames.includes(currentModel)) {
                                this.parentForm.patchValue({ [this.modelControlName]: chatModels[0].name });
                            }
                        }
                    }
                }
            });

            // If current selected provider is not available, switch to first available
            const currentProvider = this.parentForm.get(this.providerControlName)?.value;
            const selectedProvider = this.providers.find(p => p.value === currentProvider);

            if (selectedProvider && !selectedProvider.isAvailable) {
                const firstAvailable = this.providers.find(p => p.isAvailable);
                if (firstAvailable && firstAvailable.models.length > 0) {
                    this.parentForm.patchValue({
                        [this.providerControlName]: firstAvailable.value,
                        [this.modelControlName]: firstAvailable.models[0].name
                    });
                }
            }
        }
    }

    getAvailableModels(): ModelInfo[] {
        const provider = this.parentForm.get(this.providerControlName)?.value;
        const selectedProvider = this.providers.find(p => p.value === provider);
        return selectedProvider?.models || [];
    }

    getSelectedModel(): ModelInfo | undefined {
        const modelName = this.parentForm.get(this.modelControlName)?.value;
        const availableModels = this.getAvailableModels();
        return availableModels.find(m => m.name === modelName);
    }

    getTemperatureLabel(temp: number): string {
        if (temp < 0.3) return 'Muy preciso';
        if (temp < 0.5) return 'Preciso';
        if (temp < 0.7) return 'Balanceado';
        if (temp < 1.0) return 'Creativo';
        if (temp < 1.5) return 'Muy creativo';
        return 'Experimental';
    }

    getSelectedModelAttributes(): { label: string; value: boolean; icon: string }[] {
        const selectedModel = this.getSelectedModel();
        if (!selectedModel) return [];

        const attributes = [];

        // Only include CPU Supported if the model supports it (value is true)
        if (selectedModel.cpu_supported) {
            attributes.push({
                label: 'CPU Soportado',
                value: selectedModel.cpu_supported,
                icon: '💻'
            });
        }

        // Only include GPU Required if the model requires it (value is true)
        if (selectedModel.gpu_required) {
            attributes.push({
                label: 'GPU Requerido',
                value: selectedModel.gpu_required,
                icon: '🎮'
            });
        }

        // Only include Parent Retrieval if the model supports it (value is true)
        if (selectedModel.parent_retrieval_supported) {
            attributes.push({
                label: 'Recuperación Padre',
                value: selectedModel.parent_retrieval_supported,
                icon: '🔗'
            });
        }

        return attributes;
    }

    getModelTypeLabel(type: string): string {
        switch (type) {
            case 'chat': return 'Chat';
            case 'reasoning': return 'Razonamiento';
            case 'code': return 'Código';
            case 'embedding': return 'Embedding';
            case 'vision': return 'Visión';
            default: return type;
        }
    }

    isPaidModel(model: ModelInfo): boolean {
        // Models with cost > 0 are considered paid
        return (model.cost_per_1k_input > 0 || model.cost_per_1k_output > 0);
    }
}
