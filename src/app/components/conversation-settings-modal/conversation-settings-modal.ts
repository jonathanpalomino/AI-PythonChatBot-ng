// src/app/components/conversation-settings-modal/conversation-settings-modal.ts
import { Component, OnInit, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Conversation } from '../../models/models';
import { AiModelSelector } from '../ai-model-selector/ai-model-selector';
import { ApiService } from '../../services/api.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-conversation-settings-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, AiModelSelector],
  providers: [FormBuilder],
  templateUrl: './conversation-settings-modal.html',
  styleUrls: ['./conversation-settings-modal.scss']
})
export class ConversationSettingsModal implements OnInit, OnDestroy {
  @Input() conversation!: Conversation;
  @Output() save = new EventEmitter<any>();
  @Output() close = new EventEmitter<void>();

  settingsForm!: FormGroup;
  ragConfigId: string | null = null;
  activeTab: string = 'general';

  // NEW: Store embedding models
  embeddingModels: { name: string, provider: string }[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadRagConfiguration();
    this.loadEmbeddingModels(); // NEW
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  loadRagConfiguration(): void {
    if (!this.conversation?.id) return;

    this.apiService.getToolConfigurations(this.conversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (configs) => {
          const ragConfig = configs.find(c => c.tool_name === 'rag_search');
          if (ragConfig) {
            this.ragConfigId = ragConfig.id;
            this.settingsForm.patchValue({
              ragK: ragConfig.config['k'] ?? 5,
              ragScoreThreshold: ragConfig.config['score_threshold'] ?? 0.5,
              ragSearchMode: ragConfig.config['search_mode'] ?? 'semantic',
              ragHybridAlpha: ragConfig.config['hybrid_alpha'] ?? 0.5,
              ragEnableRerank: ragConfig.config['enable_rerank'] ?? false,
              ragRerankTopK: ragConfig.config['rerank_top_k'] ?? 5,
              ragEnableParentRetrieval: ragConfig.config['enable_parent_retrieval'] ?? false,
              ragParentMode: ragConfig.config['parent_mode'] ?? 'full_parent'
            });
          }
        },
        error: (err) => console.error('Error loading tool configs', err)
      });
  }

  // ... (existing code)

  loadEmbeddingModels(): void {
    this.apiService.getProviders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response && response.models) {
            const models: { name: string, provider: string }[] = [];
            Object.keys(response.models).forEach(provider => {
              const providerModels = response.models[provider];
              providerModels.forEach(m => {
                // Filter for embedding models
                if (m.model_type === 'embedding' && m.is_active) {
                  models.push({ name: m.name, provider: provider });
                }
              });
            });
            this.embeddingModels = models;
          }
        },
        error: (err) => console.error('Error loading embedding models', err)
      });
  }

  initForm(): void {
    const settings = this.conversation.settings;

    this.settingsForm = this.fb.group({
      title: [this.conversation.title, Validators.required],
      provider: [settings.provider, Validators.required],
      model: [settings.model, Validators.required],
      embeddingModel: [settings.embedding_model], // NEW
      temperature: [settings.temperature, [Validators.required, Validators.min(0), Validators.max(2)]],
      maxTokens: [settings.max_tokens],
      toolMode: [settings.tool_mode, Validators.required],
      hallucinationMode: [settings.hallucination_control?.mode || 'balanced'],
      requireSources: [false], // Added for compatibility with shared component
      synchronousChat: [!(settings.stream_chat ?? false)], // Inverted: stream_chat=false means synchronous=true
      semanticMemoryEnabled: [settings.memory_config?.semantic_enabled ?? false],
      memorySearchK: [settings.memory_config?.search_k ?? 5, [Validators.required, Validators.min(1), Validators.max(20)]],
      memoryScoreThreshold: [settings.memory_config?.score_threshold ?? 0.3, [Validators.required, Validators.min(0), Validators.max(1)]],
      memoryAutoIndex: [settings.memory_config?.auto_index ?? true],
      maxHistoryMessages: [settings.max_history_messages ?? 5, [Validators.min(1), Validators.max(100)]],
      // RAG Settings
      ragK: [5, [Validators.min(1), Validators.max(20)]],
      ragScoreThreshold: [0.5, [Validators.min(0), Validators.max(1)]],
      ragSearchMode: ['semantic'],
      ragHybridAlpha: [0.5, [Validators.min(0), Validators.max(1)]],
      ragEnableRerank: [false],
      ragRerankTopK: [5, [Validators.min(1), Validators.max(20)]],
      ragEnableParentRetrieval: [false],
      ragParentMode: ['full_parent'],
      // Advanced Options
      numCtx: [settings.num_ctx ?? null],
      numGpu: [settings.num_gpu ?? null],
      numThread: [settings.num_thread ?? null],
      numBatch: [settings.num_batch ?? null]
    });
  }

  onSubmit(): void {
    if (this.settingsForm.valid) {
      const formValue = this.settingsForm.value;

      const updates = {
        title: formValue.title,
        settings: {
          ...this.conversation.settings,
          provider: formValue.provider,
          model: formValue.model,
          embedding_model: formValue.embeddingModel || undefined, // NEW
          temperature: formValue.temperature,
          max_tokens: formValue.maxTokens || undefined,
          tool_mode: formValue.toolMode,
          // ... (rest of the payload)
          stream_chat: !formValue.synchronousChat, // Inverted: synchronousChat=true means stream_chat=false
          hallucination_control: {
            ...this.conversation.settings.hallucination_control,
            mode: formValue.hallucinationMode
          },
          memory_config: {
            semantic_enabled: formValue.semanticMemoryEnabled,
            search_k: formValue.memorySearchK,
            score_threshold: formValue.memoryScoreThreshold,
            auto_index: formValue.memoryAutoIndex
          },
          max_history_messages: formValue.maxHistoryMessages,
          // Advanced Options
          num_ctx: formValue.numCtx || undefined,
          num_gpu: formValue.numGpu || undefined,
          num_thread: formValue.numThread || undefined,
          num_batch: formValue.numBatch || undefined
        }
      };

      console.log('[ConversationSettingsModal] Saving updates:', updates);
      this.save.emit(updates);

      // Handle RAG config update
      const ragConfigData = {
        k: formValue.ragK,
        score_threshold: formValue.ragScoreThreshold,
        search_mode: formValue.ragSearchMode,
        hybrid_alpha: formValue.ragHybridAlpha,
        enable_rerank: formValue.ragEnableRerank,
        rerank_top_k: formValue.ragRerankTopK,
        enable_parent_retrieval: formValue.ragEnableParentRetrieval,
        parent_mode: formValue.ragParentMode
      };

      if (this.ragConfigId) {
        this.apiService.updateToolConfiguration(this.ragConfigId, { config: ragConfigData })
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => console.log('RAG config updated'),
            error: (err) => console.error('Error updating RAG config', err)
          });
      } else {
        this.apiService.createToolConfiguration({
          conversation_id: this.conversation.id,
          tool_name: 'rag_search',
          config: ragConfigData,
          is_active: true
        })
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (config) => {
              console.log('RAG config created');
              this.ragConfigId = config.id;
            },
            error: (err) => console.error('Error creating RAG config', err)
          });
      }
    }
  }

  onClose(): void {
    this.close.emit();
  }
}