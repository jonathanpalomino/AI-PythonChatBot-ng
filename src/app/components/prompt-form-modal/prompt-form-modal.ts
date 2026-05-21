import { Component, EventEmitter, Input, OnInit, OnChanges, Output, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PromptTemplate, PromptVariable } from '../../models/models';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface Provider {
    value: string;
    label: string;
    icon: string;
    models: string[];
    isAvailable: boolean;
}

@Component({
    selector: 'app-prompt-form-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './prompt-form-modal.html',
    styleUrls: ['./prompt-form-modal.scss']
})
export class PromptFormModal implements OnInit, OnChanges, OnDestroy {
    @Input() prompt: PromptTemplate | null = null;
    @Input() show = false;
    @Output() close = new EventEmitter<void>();
    @Output() save = new EventEmitter<Partial<PromptTemplate>>();

    // Form data
    formData: Partial<PromptTemplate> = this.getEmptyForm();

    // Available options
    categories: string[] = [];
    availableTools: any[] = [];
    visibilityOptions = [
        { value: 'private', label: 'Privada' },
        { value: 'public', label: 'Pública' },
        { value: 'shared', label: 'Compartida' }
    ];
    providers: Provider[] = [
        {
            value: 'local',
            label: 'Local (Ollama)',
            icon: '🖥️',
            models: [],
            isAvailable: false
        },
        {
            value: 'openai',
            label: 'OpenAI',
            icon: '🤖',
            models: [],
            isAvailable: false
        },
        {
            value: 'anthropic',
            label: 'Claude',
            icon: '🧠',
            models: [],
            isAvailable: false
        },
        {
            value: 'google',
            label: 'Gemini',
            icon: '💎',
            models: [],
            isAvailable: false
        },
        {
            value: 'openrouter',
            label: 'OpenRouter',
            icon: '🔀',
            models: [],
            isAvailable: false
        }
    ];

    // UI state
    currentTab: 'basic' | 'prompts' | 'variables' | 'settings' = 'basic';
    newVariable: PromptVariable = {
        name: '',
        description: '',
        required: false,
        default: '',
        type: 'string'
    };
    private destroy$ = new Subject<void>();

    constructor(private apiService: ApiService) { }

    ngOnInit(): void {
        this.loadCategories();
        this.loadProviders();
        this.loadTools();
        this.initializeForm();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['prompt']) {
            this.initializeForm();
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ...

    private getEmptyForm(): Partial<PromptTemplate> {
        return {
            name: '',
            description: '',
            category: '',
            visibility: 'private',
            system_prompt: '',
            user_prompt_template: '',
            variables: [],
            settings: {
                recommended_provider: '',
                recommended_model: '',
                temperature: 0.7,
                max_tokens: undefined,
                top_p: 1.0,
                default_tools: []
            },
            is_active: true
        };
    }

    private initializeForm(): void {
        if (this.prompt) {
            this.formData = { ...this.prompt };
            // Ensure settings object exists
            if (!this.formData.settings) {
                this.formData.settings = {
                    recommended_provider: '',
                    recommended_model: '',
                    temperature: 0.7,
                    max_tokens: undefined,
                    top_p: 1.0,
                    default_tools: []
                };
            } else {
                // Ensure provider fields exist even if settings object exists
                if (!this.formData.settings['recommended_provider']) {
                    this.formData.settings['recommended_provider'] = '';
                }
                if (!this.formData.settings['recommended_model']) {
                    this.formData.settings['recommended_model'] = '';
                }
                if (!this.formData.settings['default_tools']) {
                    this.formData.settings['default_tools'] = [];
                }
            }
        } else {
            this.formData = this.getEmptyForm();
        }
    }

    loadTools(): void {
        this.apiService.getAvailableTools()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (tools) => {
                    this.availableTools = tools;
                },
                error: (err) => console.error('Error loading tools:', err)
            });
    }

    toggleTool(toolName: string): void {
        if (!this.formData.settings) return;

        if (!this.formData.settings['default_tools']) {
            this.formData.settings['default_tools'] = [];
        }

        const index = this.formData.settings['default_tools'].indexOf(toolName);
        if (index > -1) {
            this.formData.settings['default_tools'].splice(index, 1);
        } else {
            this.formData.settings['default_tools'].push(toolName);
        }
    }

    isToolSelected(toolName: string): boolean {
        return this.formData.settings?.['default_tools']?.includes(toolName) || false;
    }

    loadCategories(): void {
        this.apiService.getPromptCategories()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (categories) => {
                    this.categories = categories;
                },
                error: (err) => console.error('Error loading categories:', err)
            });
    }

    loadProviders(): void {
        this.apiService.getProviders()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    // Reset all providers to unavailable first
                    this.providers.forEach(p => p.isAvailable = false);

                    if (response && response.models) {
                        Object.keys(response.models).forEach(providerKey => {
                            const provider = this.providers.find(p => p.value === providerKey);
                            if (provider) {
                                const models = response.models[providerKey];
                                if (Array.isArray(models) && models.length > 0) {
                                    // Filter only "chat" models (exclude "embedding" models)
                                    const chatModels = models.filter((m: any) => m.model_type === 'chat');

                                    if (chatModels.length > 0) {
                                        // Mark as available
                                        provider.isAvailable = true;
                                        provider.models = chatModels.map((m: any) => m.name);
                                    }
                                }
                            }
                        });
                    }
                },
                error: (err) => console.error('Error loading providers:', err)
            });
    }

    getAvailableModels(): string[] {
        const provider = this.formData.settings?.['recommended_provider'];
        const selectedProvider = this.providers.find(p => p.value === provider);
        return selectedProvider?.models || [];
    }

    switchTab(tab: 'basic' | 'prompts' | 'variables' | 'settings'): void {
        this.currentTab = tab;
    }

    addVariable(): void {
        if (!this.newVariable.name.trim()) {
            return;
        }

        if (!this.formData.variables) {
            this.formData.variables = [];
        }

        this.formData.variables.push({ ...this.newVariable });

        // Reset form
        this.newVariable = {
            name: '',
            description: '',
            required: false,
            default: '',
            type: 'string'
        };
    }

    removeVariable(index: number): void {
        if (this.formData.variables) {
            this.formData.variables.splice(index, 1);
        }
    }

    onSave(): void {
        // Basic validation
        if (!this.formData.name?.trim()) {
            alert('El nombre es requerido');
            return;
        }

        if (!this.formData.category?.trim()) {
            alert('La categoría es requerida');
            return;
        }

        if (!this.formData.system_prompt?.trim()) {
            alert('El system prompt es requerido');
            return;
        }

        this.save.emit(this.formData);
    }

    onClose(): void {
        this.close.emit();
    }

    onOverlayClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.onClose();
        }
    }
}
