// src/app/components/new-conversation-modal/new-conversation-modal.ts
import { Component, OnInit, Output, EventEmitter, Input, Inject, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PromptTemplate, QdrantCollection, Project } from '../../models/models';
import { ProjectToolsCoordinatorService, ToolState } from '../../services/project-tools-coordinator.service';
import { AiModelSelector } from '../ai-model-selector/ai-model-selector';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-new-conversation-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, AiModelSelector],
  templateUrl: './new-conversation-modal.html',
  styleUrls: ['./new-conversation-modal.scss']
})
export class NewConversationModal implements OnInit, OnDestroy {
  @Input() prompts: PromptTemplate[] = [];
  @Input() projects: Project[] = [];
  @Input() collections: QdrantCollection[] = [];
  @Input() availableTools: any[] = [];
  @Input() defaultProjectId: string | null = null;

  @Output() create = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  conversationForm!: FormGroup;

  toolModes = [
    {
      value: 'manual',
      label: 'Manual',
      description: 'Tú configuras qué herramientas usar',
      icon: '⚙️'
    },
    {
      value: 'agent',
      label: 'Agent',
      description: 'La IA decide qué herramientas usar',
      icon: '🤖'
    }
  ];

  currentStep = 1;
  totalSteps = 3;

  // Colecciones seleccionadas
  selectedCollections: string[] = [];

  // Model filtering flags
  filterByThinking = false;
  filterByTools = false;

  constructor(
    @Inject(FormBuilder) private fb: FormBuilder,
    private toolsCoordinator: ProjectToolsCoordinatorService
  ) { }

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initForm(): void {
    this.conversationForm = this.fb.group({
      title: ['Nueva Conversación', Validators.required],
      projectId: [this.defaultProjectId || ''],
      promptTemplateId: [''],
      provider: ['local', Validators.required],
      model: ['mistral', Validators.required],
      temperature: [0.7, [Validators.required, Validators.min(0), Validators.max(2)]],
      maxTokens: [2000, [Validators.min(100), Validators.max(8000)]],
      toolMode: ['manual', Validators.required],
      enabledTools: [[]],
      hallucinationMode: ['balanced', Validators.required],
      requireSources: [false],
      confidenceThreshold: [0.7, [Validators.min(0), Validators.max(1)]],
      semanticMemoryEnabled: [false],
      memorySearchK: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
      memoryScoreThreshold: [0.3, [Validators.required, Validators.min(0), Validators.max(1)]],
      memoryAutoIndex: [true],
      synchronousChat: [false],
      // RAG Tool Configuration
      ragK: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
      ragScoreThreshold: [0.5, [Validators.required, Validators.min(0), Validators.max(1)]],
      ragEnableRerank: [false],
      ragRerankTopK: [5, [Validators.min(1), Validators.max(20)]],
      ragSearchMode: ['semantic'],
      ragHybridAlpha: [0.5, [Validators.min(0), Validators.max(1)]],
      ragEnableParentRetrieval: [false],
      ragParentMode: ['full_parent']
    });

    // Watch prompt template changes
    this.conversationForm.get('promptTemplateId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => {
        if (id) {
          const prompt = this.prompts.find(p => p.id === id);
          if (prompt) {
            this.applyPromptSettings(prompt);
          }
        }
      });

    // Watch project changes to auto-select RAG if files exist
    this.conversationForm.get('projectId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(projectId => {
        this.checkProjectFilesAndEnableRag(projectId);
      });

    // If default project is provided, trigger check
    if (this.defaultProjectId) {
      this.checkProjectFilesAndEnableRag(this.defaultProjectId);
    }
  }

  applyPromptSettings(prompt: PromptTemplate): void {
    const updates: any = {
      title: prompt.name
    };

    // Apply basic settings first
    if (prompt.settings?.temperature !== undefined) {
      updates.temperature = prompt.settings.temperature;
    }
    if (prompt.settings?.max_tokens) {
      updates.maxTokens = prompt.settings.max_tokens;
    }
    if (prompt.settings?.hallucination_mode) {
      updates.hallucinationMode = prompt.settings.hallucination_mode;
    }

    // Apply tools with validation
    if (prompt.settings?.default_tools) {
      const validTools = prompt.settings.default_tools.filter(toolName =>
        this.availableTools.some(t => t.name === toolName)
      );
      updates.enabledTools = validTools;
    }

    // ✨ NEW: Determine filtering based on prompt requirements
    this.filterByTools = !!(prompt.settings?.default_tools && prompt.settings.default_tools.length > 0);

    const nameLC = prompt.name.toLowerCase();
    this.filterByThinking = nameLC.includes('código') || nameLC.includes('code') ||
      nameLC.includes('especialista') || nameLC.includes('reasoning');

    this.conversationForm.patchValue(updates);

    // Apply provider and model sequentially to avoid race conditions
    if (prompt.settings?.recommended_provider) {
      this.conversationForm.patchValue({ provider: prompt.settings.recommended_provider });

      // Small timeout to allow provider change to propagate if needed, 
      // though synchronous patchValue should work if logic is correct
      const recommendedModel = prompt.settings?.recommended_model;
      if (recommendedModel) {
        setTimeout(() => {
          this.conversationForm.patchValue({ model: recommendedModel });
        }, 0);
      }
    }
  }


  checkProjectFilesAndEnableRag(projectId: string): void {
    this.toolsCoordinator.checkProjectFiles(projectId || null)
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const recommendedTools = this.toolsCoordinator.getRecommendedTools(
          this.conversationForm.get('enabledTools')?.value || []
        );

        this.conversationForm.patchValue({
          enabledTools: recommendedTools
        });

        if (state.hasProjectFiles || state.hasTemporaryFiles) {
          console.log('[NewConversationModal] Auto-selected RAG tool for project with files');
        }
      });
  }

  updateEnabledTools(): void {
    const currentTools = this.conversationForm.get('enabledTools')?.value || [];
    const recommended = this.toolsCoordinator.getRecommendedTools(currentTools);

    this.conversationForm.patchValue({
      enabledTools: recommended
    });
  }

  toggleTool(toolName: string): void {
    const currentTools = this.conversationForm.get('enabledTools')?.value || [];
    const index = currentTools.indexOf(toolName);

    if (index > -1) {
      currentTools.splice(index, 1);
    } else {
      currentTools.push(toolName);

      // If manually enabling RAG, check if we need to warn about missing files
      if (toolName === 'rag_search') {
        const state = this.toolsCoordinator.getCurrentState();
        if (!state.hasProjectFiles && !state.hasTemporaryFiles) {
          console.warn('[NewConversationModal] RAG manually enabled without file source');
          // You could show a warning to the user here
        }
      }
    }

    this.conversationForm.patchValue({ enabledTools: [...currentTools] });
  }

  isToolEnabled(toolName: string): boolean {
    const tools = this.conversationForm.get('enabledTools')?.value || [];
    return tools.includes(toolName);
  }

  nextStep(): void {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  canProceedToNextStep(): boolean {
    if (this.currentStep === 1) {
      return this.conversationForm.get('title')?.valid || false;
    }
    if (this.currentStep === 2) {
      return this.conversationForm.get('provider')?.valid &&
        this.conversationForm.get('model')?.valid || false;
    }
    return true;
  }

  onSubmit(): void {
    if (this.conversationForm.valid) {
      const formValue = this.conversationForm.value;

      // Validate tool configurations
      const validationResult = this.toolsCoordinator.validateToolConfigurations(
        formValue.enabledTools,
        formValue.projectId
      );

      if (!validationResult.isValid) {
        console.warn('[NewConversationModal] Tool configuration issues:', validationResult.warnings, validationResult.errors);
        // Show warnings to user but allow submission
        validationResult.warnings.forEach(warning => console.warn(warning));
        validationResult.errors.forEach(error => console.error(error));
      }

      const settings = {
        title: formValue.title,
        projectId: formValue.projectId || undefined,
        promptTemplateId: formValue.promptTemplateId || undefined,
        provider: formValue.provider,
        model: formValue.model,
        temperature: formValue.temperature,
        maxTokens: formValue.maxTokens || undefined,
        toolMode: formValue.toolMode,
        enabledTools: formValue.enabledTools,
        hallucinationMode: formValue.hallucinationMode,
        requireSources: formValue.requireSources,
        confidenceThreshold: formValue.confidenceThreshold,
        semanticMemoryEnabled: formValue.semanticMemoryEnabled,
        memorySearchK: formValue.memorySearchK,
        memoryScoreThreshold: formValue.memoryScoreThreshold,
        memoryAutoIndex: formValue.memoryAutoIndex,
        stream_chat: !formValue.synchronousChat,
        selectedCollections: this.selectedCollections,
        // RAG Configuration
        ragConfig: {
          k: formValue.ragK,
          score_threshold: formValue.ragScoreThreshold,
          enable_rerank: formValue.ragEnableRerank,
          rerank_top_k: formValue.ragRerankTopK,
          search_mode: formValue.ragSearchMode,
          hybrid_alpha: formValue.ragHybridAlpha,
          enable_parent_retrieval: formValue.ragEnableParentRetrieval,
          parent_mode: formValue.ragParentMode
        },
        // Add tool validation warnings to metadata
        toolWarnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined
      };

      console.log('[NewConversationModal] Creating conversation with settings:', settings);
      this.create.emit(settings);
    } else {
      console.warn('[NewConversationModal] Form is invalid');
      // Mostrar qué campos tienen errores
      Object.keys(this.conversationForm.controls).forEach(key => {
        const control = this.conversationForm.get(key);
        if (control?.invalid) {
          console.warn(`Field '${key}' is invalid:`, control.errors);
        }
      });
    }
  }

  onClose(): void {
    this.close.emit();
  }

  getToolIcon(category: string): string {
    const icons: Record<string, string> = {
      'rag': 'icon-search',
      'code': 'icon-code',
      'memory': 'icon-brain',
      'web': 'icon-globe',
      'database': 'icon-database',
      'file': 'icon-file'
    };
    return icons[category] || 'icon-tool';
  }

  getPromptCategories(): string[] {
    const categories = new Set(this.prompts.map(p => p.category));
    return Array.from(categories).sort();
  }

  getPromptsByCategory(category: string): PromptTemplate[] {
    return this.prompts.filter(p => p.category === category);
  }

  // ============================================================================
  // Collections Management
  // ============================================================================

  isCollectionSelected(collectionId: string): boolean {
    return this.selectedCollections.includes(collectionId);
  }

  toggleCollection(collectionId: string): void {
    const index = this.selectedCollections.indexOf(collectionId);

    if (index > -1) {
      this.selectedCollections.splice(index, 1);
    } else {
      this.selectedCollections.push(collectionId);
    }
  }

  getSelectedCollections(): QdrantCollection[] {
    return this.collections.filter(c => this.selectedCollections.includes(c.id));
  }
  onOverlayClick(event: MouseEvent): void {
    // Solo cierra si el click fue específicamente en el overlay, no en sus hijos
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }
}