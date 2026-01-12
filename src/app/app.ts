// src/app/app.component.ts
import { Component, OnInit, ViewChild, ElementRef, HostListener, ApplicationRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ChatService } from './services/chat.service';
import { ApiService } from './services/api.service';
import { ThemeService } from './services/theme.service';
import { ProjectService } from './services/project.service';
import { FileUtils } from './utils/file-utils';
import { NewConversationModal } from './components/new-conversation-modal/new-conversation-modal';
import { ConversationSettingsModal } from './components/conversation-settings-modal/conversation-settings-modal';
import { PromptManager } from './components/prompt-manager/prompt-manager';
import { ProjectDetailsComponent } from './components/project-details/project-details';
import { ProjectFormModalComponent } from './components/project-form-modal/project-form-modal';
import {
  Conversation,
  ConversationListItem,
  Message,
  ConversationCreate,
  PromptTemplate,
  QdrantCollection,
  Project
} from './models/models';
import { CustomToolsManager } from './components/custom-tools-manager/custom-tools-manager';
import { MessageListComponent } from './components/message-list/message-list';
import { ChatInputComponent } from './components/chat-input/chat-input';
import { ToolsBarComponent } from './components/tools-bar/tools-bar';
import hljs from 'highlight.js';
import { FileIconPipe } from './pipes/file-icon.pipe';

// Agregar esta interfaz al inicio del archivo app.ts (después de los imports)
interface UploadingFile extends File {
  uploadProgress?: number;
  isUploading?: boolean;
  uploadError?: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NewConversationModal,
    ConversationSettingsModal,
    PromptManager,
    ProjectDetailsComponent,
    ProjectFormModalComponent,
    CustomToolsManager,
    MessageListComponent,
    ChatInputComponent,
    ToolsBarComponent
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  @ViewChild(ChatInputComponent) chatInputComponent!: ChatInputComponent;
  @ViewChild(ProjectDetailsComponent) projectDetailsComponent!: ProjectDetailsComponent;

  private destroy$ = new Subject<void>();

  // State
  sidebarCollapsed = false;
  conversations: ConversationListItem[] = [];
  activeConversation: Conversation | null = null;
  activeConversationId: string | null = null;
  messages: Message[] = [];
  isLoading = false;
  showConversationSettings = false;

  // Input
  messageText = '';
  uploadedFileIds: string[] = [];

  // UI Modals
  showNewConversationModal = false;
  showFileManager = false;
  showSettings = false;
  showProjectFormModal = false;
  projectToEdit: Project | undefined = undefined;

  // Navigation
  activeSidebarTab: 'conversations' | 'projects' = 'conversations';
  currentSettingsTab: 'prompts' | 'api' | 'preferences' = 'prompts';

  // Resources
  prompts: PromptTemplate[] = [];
  collections: QdrantCollection[] = [];
  availableTools: any[] = [];
  projects: Project[] = [];
  activeProject: Project | null = null;

  // Theme
  currentTheme: 'light' | 'dark' = 'light';

  private shouldScrollToBottom = false;

  // AGREGAR estas propiedades:
  showCollectionsDropdown = false;
  selectedCollectionId: string | null = null;
  availableCollections: QdrantCollection[] = [];
  hasTemporaryCollection = false;
  defaultProjectId: string | null = null; // New property for pre-selecting project

  // Cache for project-conversation association
  conversationProjectMap: Map<string, string> = new Map();

  private expandedThinking: Set<string> = new Set();

  showCustomToolsManager: boolean = false;
  deletingConversationIds: Set<string> = new Set();

  constructor(
    private chatService: ChatService,
    private apiService: ApiService,
    private projectService: ProjectService,
    private themeService: ThemeService,
    private appRef: ApplicationRef
  ) { }

  ngOnInit(): void {
    this.initializeSubscriptions();
    this.loadInitialData();
    this.initializeTheme();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.highlightCodeBlocks(); // Agregar aquí
      this.shouldScrollToBottom = false;
    }
  }

  // Después de ngAfterViewChecked, agrega:
  @HostListener('click', ['$event'])
  onContainerClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Detectar click en botón de copiar o sus hijos (SVG)
    const copyButton = target.closest('[data-action="copy-code"]') as HTMLButtonElement;
    if (copyButton) {
      event.preventDefault();
      this.handleCodeCopy(copyButton);
    }
  }

  private handleCodeCopy(button: HTMLButtonElement): void {
    const container = button.closest('.code-block-container');
    if (!container) return;

    const codeElement = container.querySelector('code');
    if (!codeElement) return;

    const codeText = codeElement.textContent || '';
    const copyTextSpan = button.querySelector('.copy-text') as HTMLElement;

    navigator.clipboard.writeText(codeText).then(() => {
      // Feedback visual
      if (copyTextSpan) {
        copyTextSpan.textContent = 'Copied!';
        button.classList.add('copied');

        // Revertir después de 2 segundos
        setTimeout(() => {
          copyTextSpan.textContent = 'Copy';
          button.classList.remove('copied');
        }, 2000);
      }
    }).catch(err => {
      console.error('Error al copiar código:', err);
      if (copyTextSpan) {
        copyTextSpan.textContent = 'Error';
        setTimeout(() => {
          copyTextSpan.textContent = 'Copy';
        }, 1500);
      }
    });
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private initializeSubscriptions(): void {
    this.chatService.conversations$
      .pipe(takeUntil(this.destroy$))
      .subscribe(convs => {
        this.conversations = convs;
        this.applyProjectAssociations(); // Apply cached associations whenever list updates
      });

    this.chatService.activeConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conv => {
        this.activeConversation = conv;
        this.activeConversationId = conv?.id || null;
      });

    this.chatService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(msgs => {
        this.messages = msgs;
        this.shouldScrollToBottom = true;
        this.appRef.tick();
      });

    this.chatService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.isLoading = loading;
        if (loading) {
          this.shouldScrollToBottom = true;
        }
      });
  }

  private loadInitialData(): void {
    // Load conversations
    this.chatService.loadConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err) => this.handleError('Error loading conversations', err)
      });

    // Load prompts
    this.loadPrompts();

    // Load projects
    this.loadProjects();

    // Load available tools
    this.apiService.getAvailableTools()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tools) => this.availableTools = tools,
        error: (err) => this.handleError('Error loading tools', err)
      });


    // Cargar collections para el selector
    this.apiService.getCollections()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.collections = response.items;
          this.availableCollections = response.items.filter(c => c.is_active);
        },
        error: (err) => this.handleError('Error loading collections', err)
      });
  }

  loadPrompts(): void {
    this.apiService.getPromptTemplates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.prompts = response.items;
          console.log('[AppComponent] Prompts reloaded:', response.items.length);
        },
        error: (err) => this.handleError('Error loading prompts', err)
      });
  }

  loadProjects(): void {
    this.projectService.getProjects()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.projects = response.items;
          this.loadProjectAssociations();
        },
        error: (err) => this.handleError('Error loading projects', err)
      });
  }

  private initializeTheme(): void {
    this.themeService.currentTheme$.subscribe(theme => {
      this.currentTheme = theme;
      document.documentElement.setAttribute('data-theme', theme);
    });
  }

  // ============================================================================
  // Sidebar Actions
  // ============================================================================

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  switchSidebarTab(tab: 'conversations' | 'projects'): void {
    this.activeSidebarTab = tab;
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  selectConversation(id: string): void {
    this.activeProject = null; // Cierra la vista de proyecto
    this.chatService.setActiveConversation(id);

    // Ensure we switch back to conversation view if needed
    if (this.activeSidebarTab === 'projects') {
      // Optional: switch tab back? maybe not necessary
    }
  }

  deleteConversation(id: string, event: Event): void {
    event.stopPropagation();

    if (confirm('¿Estás seguro de eliminar esta conversación?')) {
      this.deletingConversationIds.add(id);
      this.chatService.deleteConversation(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.deletingConversationIds.delete(id);
          },
          error: (err) => {
            this.deletingConversationIds.delete(id);
            this.handleError('Error deleting conversation', err);
          }
        });
    }
  }

  // ============================================================================
  // Project Management
  // ============================================================================

  selectProject(project: Project): void {
    this.activeProject = project;
    this.activeConversation = null; // Clear chat view
    // Switch to projects tab if not already (for example if opened from header)
    this.activeSidebarTab = 'projects';
  }

  openNewProjectModal(): void {
    this.projectToEdit = undefined;
    this.showProjectFormModal = true;
  }

  openEditProjectModal(project: Project, event?: Event): void {
    if (event) event.stopPropagation();
    this.projectToEdit = project;
    this.showProjectFormModal = true;
  }

  closeProjectFormModal(): void {
    this.showProjectFormModal = false;
    this.projectToEdit = undefined;
  }

  onProjectSaved(project?: Project): void {
    this.loadProjects();
    this.closeProjectFormModal();
  }

  deleteProject(id: string, event: Event): void {
    event.stopPropagation();
    if (confirm('¿Seguro que quieres eliminar este proyecto? Se eliminarán todas las conversaciones asociadas.')) {
      this.projectService.deleteProject(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadProjects();
            if (this.activeProject?.id === id) {
              this.activeProject = null;
            }
          },
          error: (err) => this.handleError('Error eliminando proyecto', err)
        });
    }
  }

  // ============================================================================
  // Conversation Creation
  // ============================================================================

  openNewConversationModal(): void {
    // Refresh data before opening
    this.loadPrompts();
    this.loadProjects();

    this.showNewConversationModal = true;
    // Reset any project pre-selection if needed, or handle it in the modal
    // By default, if we just open it, it's a generic new conversation
    // specific project selection logic might be needed if we want to pre-fill
  }

  openNewConversationModalForProject(project: Project): void {
    // Refresh data before opening
    this.loadPrompts();
    this.loadProjects();

    this.showNewConversationModal = true;
    // We need a way to pass the selected project to the modal
    // We can do this by setting a temporary property or updating the modal component
    // For now, let's assume the user selects it, OR we can improve the modal to accept an input
    // Let's rely on the user selecting it for now, BUT to be better, we should pre-select it.
    // Since NewConversationModal is present in the DOM, we can pass a "defaultProjectId" input.
    this.defaultProjectId = project.id;
  }

  closeNewConversationModal(): void {
    this.showNewConversationModal = false;
    this.defaultProjectId = null;
  }

  createConversation(settings: any): void {
    const data: ConversationCreate = {
      title: settings.title,
      settings: {
        provider: settings.provider,
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        tool_mode: settings.toolMode,
        enabled_tools: settings.enabledTools,
        stream_chat: settings.stream_chat,
        memory_config: {
          semantic_enabled: settings.semanticMemoryEnabled,
          search_k: settings.memorySearchK,
          score_threshold: settings.memoryScoreThreshold,
          auto_index: settings.memoryAutoIndex
        },
        hallucination_control: {
          mode: settings.hallucinationMode,
          require_sources: settings.requireSources,
          confidence_threshold: settings.confidenceThreshold
        }
      },
      project_id: settings.projectId || undefined,
      prompt_template_id: settings.promptTemplateId || undefined,
      metadata: {
        selected_collections: settings.selectedCollections || []
      }
    };

    console.log('[AppComponent] Creating conversation:', data);

    const proceedWithCreation = () => {
      this.chatService.createConversation(data)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: Conversation) => {
            this.closeNewConversationModal();

            // If we are in project view and the new conversation belongs to this project, refresh list
            if (this.activeProject &&
              this.projectDetailsComponent &&
              data.project_id === this.activeProject.id) {
              // Assuming response contains the id and we just need to reload
              this.projectDetailsComponent.loadConversations();
            }
          },
          error: (err) => this.handleError('Error creating conversation', err)
        });
    };

    // Auto-enable RAG for project conversations ONLY if files exist
    if (data.project_id) {
      const projectId = data.project_id;

      // Check if we already know file status locally (active project view)
      if (this.activeProject && this.activeProject.id === projectId && this.projectDetailsComponent) {
        if (this.projectDetailsComponent.files && this.projectDetailsComponent.files.length > 0) {
          this.enableRagForProject(data);
        }
        proceedWithCreation();
      } else {
        // We are outside context, check API
        this.projectService.getProjectFiles(projectId, 0, 1)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (res) => {
              if (res.items && res.items.length > 0) {
                this.enableRagForProject(data);
              }
              proceedWithCreation();
            },
            error: (err) => {
              console.warn('Error checking project files, proceeding without RAG auto-enable', err);
              proceedWithCreation();
            }
          });
      }
    } else {
      proceedWithCreation();
    }
  }

  private enableRagForProject(data: ConversationCreate): void {
    if (!data.settings.enabled_tools.includes('rag_search')) {
      data.settings.enabled_tools.push('rag_search');
    }
    data.settings.rag_enabled = true;
    console.log('[AppComponent] Auto-enabled RAG for project (files detected):', data.project_id);
  }

  quickStartConversation(type: 'code' | 'docs' | 'rag' | 'general'): void {
    const prompt = this.prompts.find(p => p.category === type);
    let recommended_model = '';
    if (type == 'code') {
      recommended_model = 'deepseek-r1:8b'
    }
    else if (type == 'docs') {
      recommended_model = 'qwen3:4b'
    }
    else if (type == 'rag') {
      recommended_model = 'gemma3:4b'
    }
    else if (type == 'general') {
      recommended_model = 'gemma3n:latest'
    }
    const quickSettings = {
      title: prompt?.name || `Nueva Conversación ${type}`,
      provider: prompt?.settings?.recommended_provider || 'local',
      model: prompt?.settings?.recommended_model || recommended_model,
      temperature: prompt?.settings?.temperature || 0.7,
      maxTokens: prompt?.settings?.max_tokens || 4000,
      toolMode: 'manual',
      enabledTools: prompt?.settings?.default_tools || [],
      hallucinationMode: prompt?.settings?.hallucination_mode || 'balanced',
      requireSources: false,
      confidenceThreshold: 0.7,
      promptTemplateId: prompt?.id
    };

    this.createConversation(quickSettings);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  // Message Handling
  handleSentMessage(event: { message: string, fileIds: string[], fileInfo: any[] }): void {
    this.messageText = event.message;
    this.uploadedFileIds = event.fileIds;
    this.sendMessage(event.fileInfo);
  }

  handleUploadedFileIdsChange(fileIds: string[]): void {
    this.uploadedFileIds = fileIds;
  }

  sendMessage(fileInfo: any[] = []): void {
    if (!this.messageText.trim() && this.uploadedFileIds.length === 0) {
      return;
    }

    this.isLoading = true;
    this.chatService.sendMessage(this.messageText, this.uploadedFileIds, fileInfo).subscribe({
      next: () => {
        this.messageText = '';
        this.uploadedFileIds = [];
        this.isLoading = false;
        // The child component will also clear its state upon success if we handle it right, 
        // but since we passed them as inputs, we might need to be careful.
      },
      error: (err) => {
        this.handleError('Error sending message', err);
        this.isLoading = false;
      }
    });
  }

  cancelCurrentChat(): void {
    this.chatService.cancelCurrentChat().subscribe({
      next: () => this.isLoading = false,
      error: (err) => {
        this.handleError('Error cancelling chat', err);
        this.isLoading = false;
      }
    });
  }
  // ============================================================================
  // File Handling
  // ============================================================================

  handleFileUploadStart(): void {
    // Auto-activar RAG cuando se suben archivos
    if (!this.isToolActive('rag_search')) {
      this.toggleTool('rag_search');
    }
  }

  handleHasTemporaryCollectionChange(has: boolean): void {
    this.hasTemporaryCollection = has;
  }

  openFileManager(): void {
    this.showFileManager = true;
  }

  closeFileManager(): void {
    this.showFileManager = false;
  }

  onFilesSelected(fileIds: string[]): void {
    this.uploadedFileIds = fileIds;
    // Optionally get file details to show in UI
  }

  // ============================================================================
  // Tools Management
  // ============================================================================

  isToolActive(toolName: string): boolean {
    return this.activeConversation?.settings.enabled_tools?.includes(toolName) || false;
  }

  toggleTool(toolName: string): void {
    if (!this.activeConversation) return;

    const currentTools = this.activeConversation.settings.enabled_tools || [];
    const isActive = currentTools.includes(toolName);

    const updatedTools = isActive
      ? currentTools.filter(t => t !== toolName)
      : [...currentTools, toolName];

    const updatedConversation = {
      ...this.activeConversation,
      settings: {
        ...this.activeConversation.settings,
        enabled_tools: updatedTools
      }
    };

    this.chatService.updateConversation(
      this.activeConversation.id,
      updatedConversation
    ).subscribe({
      next: (conv) => {
        this.activeConversation = conv;
      },
      error: (err) => this.handleError('Error updating tools', err)
    });
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================


  formatMessage(content: string | undefined): string {
    // 0) Texto base normalizado
    let text = (content ?? '').replace(/\r\n?/g, '\n');

    // 1) Pre-fix por si viniera algún fence “pegado” (ya no debería, pero es seguro)
    text = text.replace(/```(sql|bash|json|xml|yaml|yml|python|java|ts|js)(?=\S)/gi, '```$1\n');

    // 2) Escape controlado: preserva entidades existentes (&gt;, &lt;, &amp;) pero
    //    escapa los < y > crudos del texto normal (no de los code blocks)
    const escapePreservingEntities = (s: string) =>
      s.replace(/&(?!(?:gt|lt|amp);)/g, '&amp;') // escapa & que no formen parte de entidades conocidas
        .replace(/<(?!\/?(strong|em|code|a|ul|ol|li|pre|blockquote|h[1-6])\b)/g, '&lt;') // escapa < salvo nuestras etiquetas
        .replace(/>(?!)/g, '&gt;'); // > crudos a &gt;

    // 3) Extraer fences a placeholders para no alterarlos con los reemplazos inline
    interface Fence { lang: string; code: string; }
    const fences: Fence[] = [];
    text = text.replace(/```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g, (_m, langRaw: string, body: string) => {
      const lang = (langRaw || '').trim();
      fences.push({ lang, code: body });
      return `@@FENCE_${fences.length - 1}@@`;
    });

    // 4) Procesar por bloques (párrafos, listas, citas, headings) de forma simple
    const lines = text.split('\n');
    const out: string[] = [];

    // Estado de listas
    type ListCtx = { type: 'ul' | 'ol'; openItem: boolean; level: number };
    const stack: ListCtx[] = [];
    const closeListsTo = (level: number) => {
      while (stack.length && stack[stack.length - 1].level >= level) {
        const ctx = stack.pop()!;
        out.push(ctx.type === 'ul' ? '</ul>' : '</ol>');
      }
    };

    const openList = (type: 'ul' | 'ol', level: number) => {
      stack.push({ type, openItem: false, level });
      out.push(type === 'ul' ? '<ul>' : '<ol>');
    };

    const openItem = (html: string) => {
      const ctx = stack[stack.length - 1];
      if (!ctx.openItem) {
        ctx.openItem = true;
      }
      out.push(`<li>${html}</li>`);
    };


    const para: string[] = [];
    const flushPara = () => {
      if (!para.length) return;
      const txt = para.join(' ').trim();
      if (txt) out.push(`<p>${txt}</p>`);
      para.length = 0;
    };

    // Inline (se aplica sobre texto ya escapado)
    const applyInline = (s: string) => {
      // Inline code `...`
      s = s.replace(/`([^`]+)`/g, (_m: string, inner: string) => `<code>${escapePreservingEntities(inner)}</code>`);
      // Links texto
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
        (_m: string, label: string, url: string, title?: string) => {
          const u = escapePreservingEntities(url);
          const l = escapePreservingEntities(label);
          const t = title ? ` title="${escapePreservingEntities(title)}"` : '';
          return `${u}${l}</a>`;
        });
      // Bold **...**
      s = s.replace(/\*\*([^*]+)\*\*/g, (_m: string, inner: string) => `<strong>${escapePreservingEntities(inner)}</strong>`);
      // Itálicas menos agresivas *...*
      s = s.replace(/(^|[\s(])\*([^*]+)\*(?=$|[\s).,;:!?])/g,
        (_m: string, before: string, inner: string) => `${before}<em>${escapePreservingEntities(inner)}</em>`);
      return s;
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      // Respeta tokens de fences
      if (/^@@FENCE_\d+@@$/.test(raw)) {
        flushPara();
        closeListsTo(0);
        out.push(raw);
        continue;
      }

      const line = raw.trim();

      // Headings Markdown (#, ##, …) o tus títulos en negrita “**Explicación:**”
      const mH = line.match(/^(#{1,6})\s+(.*)$/);
      if (mH) {
        flushPara();
        closeListsTo(0);
        const lvl = mH[1].length;
        out.push(`<h${lvl}>${escapePreservingEntities(mH[2])}</h${lvl}>`);
        continue;
      }

      // Detectar cualquier línea en negrita seguida de dos puntos (ej. **Explicación:**)
      const boldHeadingMatch = line.match(/^\*\*([^*]+)\*\*:$/);
      if (boldHeadingMatch) {
        flushPara();
        closeListsTo(0);
        const label = boldHeadingMatch[1].trim();
        out.push(`<h4>${escapePreservingEntities(label)}</h4>`);
        continue;
      }

      // Citas >
      const mBq = line.match(/^>\s?(.*)$/);
      if (mBq) {
        flushPara();
        closeListsTo(0);
        out.push(`<blockquote>${applyInline(escapePreservingEntities(mBq[1]))}</blockquote>`);
        continue;
      }

      // Listas UL / OL (con indentación básica por espacios)
      let m: RegExpMatchArray | null;

      if ((m = line.match(/^(\s*)([-*+])\s+(.*)$/))) {
        const indent = m[1].length;
        const level = Math.floor(indent / 2);
        const content = applyInline(escapePreservingEntities(m[3]));
        flushPara();
        if (!stack.length || stack[stack.length - 1].type !== 'ul' || stack[stack.length - 1].level < level) {
          openList('ul', level);
        } else if (stack[stack.length - 1].level > level) {
          closeListsTo(level);
        }
        openItem(content);
        continue;
      }
      if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) {
        const indent = m[1].length;
        const level = Math.floor(indent / 2);
        const content = applyInline(escapePreservingEntities(m[3]));
        flushPara();
        if (!stack.length || stack[stack.length - 1].type !== 'ol' || stack[stack.length - 1].level < level) {
          openList('ol', level);
        } else if (stack[stack.length - 1].level > level) {
          closeListsTo(level);
        }
        openItem(content);
        continue;
      }

      // Línea en blanco: cerrar párrafo y listas de ítems abiertos (no listas completas)
      if (!line) {
        // cierra <li> abierto pero no cierra la lista completa; seguimos al mismo nivel
        if (stack.length && stack[stack.length - 1].openItem) {
          out.push('</li>');
          stack[stack.length - 1].openItem = false;
        }
        flushPara();
        continue;
      }

      // Texto normal → acumula
      para.push(applyInline(escapePreservingEntities(line)));
    }

    // Cierre de estructuras pendientes
    flushPara();
    closeListsTo(0);

    // 5) Reinsertar fences como <pre><code> + botón Copiar
    let html = out.join('\n');
    html = html.replace(/@@FENCE_(\d+)@@/g, (_m: string, idxStr: string) => {
      const idx = Number(idxStr);
      const f = fences[idx] || { lang: '', code: '' };
      const safe = escapePreservingEntities(f.code).replace(/\n+$/, '');
      const lang = f.lang || 'plaintext';
      const displayLang = lang.charAt(0).toUpperCase() + lang.slice(1);
      const cls = f.lang ? ` class="language-${f.lang}"` : '';

      let tmp = `
        <div class="code-block-container" data-language="${lang}">
          <div class="code-block-header">
            <span class="code-block-language">${displayLang}</span>
          </div>
          <pre><code${cls}>${safe}</code></pre>
        </div>
      `.trim();

      return tmp;
    });

    return html;
  }

  getAvatarIcon(role: string): string {
    switch (role) {
      case 'user': return 'icon-user';
      case 'assistant': return 'icon-bot';
      case 'system': return 'icon-settings';
      default: return 'icon-message';
    }
  }

  scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  // Tools & Collections Handlers
  handleToolToggle(toolName: string): void {
    if (!this.activeConversation) return;

    const currentTools = this.activeConversation.settings.enabled_tools || [];
    const updatedTools = currentTools.includes(toolName)
      ? currentTools.filter(t => t !== toolName)
      : [...currentTools, toolName];

    this.updateActiveConversationSettings({ enabled_tools: updatedTools });
  }

  handleCollectionSelect(id: string | null): void {
    this.selectedCollectionId = id;
    this.updateActiveConversationSettings({ rag_collection_id: id || undefined });
  }

  handleRegenerate(): void {
    if (!this.activeConversation) return;
    this.isLoading = true;
    this.apiService.regenerateLastMessage(this.activeConversation.id).subscribe({
      next: () => this.isLoading = false,
      error: (err) => {
        this.handleError('Error regenerating message', err);
        this.isLoading = false;
      }
    });
  }

  getHasTemporaryCollection(): boolean {
    return this.uploadedFileIds.length > 0;
  }

  private updateActiveConversationSettings(settings: any): void {
    if (!this.activeConversation) return;

    const updated = {
      ...this.activeConversation,
      settings: { ...this.activeConversation.settings, ...settings }
    };

    this.chatService.updateConversation(this.activeConversation.id, updated).pipe(takeUntil(this.destroy$)).subscribe({
      next: (conv) => this.activeConversation = conv,
      error: (err) => this.handleError('Error updating settings', err)
    });
  }
  // ============================================================================
  // Settings & Export
  // ============================================================================

  openSettings(): void {
    this.showSettings = true;
  }

  closeSettings(): void {
    this.showSettings = false;
  }

  openCustomToolsManager(): void {
    this.showCustomToolsManager = !this.showCustomToolsManager;
  }

  closeCustomToolsManager(): void {
    this.showCustomToolsManager = false;
  }

  switchSettingsTab(tab: 'prompts' | 'api' | 'preferences'): void {
    this.currentSettingsTab = tab;
  }

  openConversationSettings(): void {
    if (!this.activeConversation) return;
    this.showConversationSettings = true;
  }

  closeConversationSettings(): void {
    this.showConversationSettings = false;
  }

  updateConversationSettings(updates: any): void {
    if (!this.activeConversation) return;

    this.apiService.updateConversation(this.activeConversation.id, updates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.activeConversation = updated;
          this.closeConversationSettings();
          console.log('[AppComponent] Conversation updated:', updated);
        },
        error: (err) => this.handleError('Error updating conversation', err)
      });
  }

  exportConversation(): void {
    if (!this.activeConversation) return;

    const data = {
      conversation: this.activeConversation,
      messages: this.messages
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${this.activeConversation.id}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  exportConversationToPDF(): void {
    if (!this.activeConversation) return;

    // Mostrar mensaje de carga
    this.isLoading = true;

    this.apiService.exportConversationPdf(this.activeConversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => {
          // Crear URL para el PDF
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `conversation-${this.activeConversation!.id}.pdf`;
          a.click();

          // Limpiar URL
          window.URL.revokeObjectURL(url);
          this.isLoading = false;
        },
        error: (err) => {
          this.handleError('Error exporting conversation to PDF', err);
          this.isLoading = false;
        }
      });
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private handleError(message: string, error: any): void {
    console.error(message, error);
    alert(`${message}: ${error.message || error}`);
  }

  // AGREGAR métodos para manejo de colecciones:
  toggleCollectionsDropdown(event: Event): void {
    event.stopPropagation();
    this.showCollectionsDropdown = !this.showCollectionsDropdown;
  }

  selectCollection(collectionId: string | null): void {
    this.selectedCollectionId = collectionId;
    this.showCollectionsDropdown = false;

    // Si selecciona una colección, activar RAG automáticamente
    if (collectionId && !this.isToolActive('rag_search')) {
      this.toggleTool('rag_search');
    }

    // Actualizar metadata de la conversación con la colección seleccionada
    if (this.activeConversation) {
      const updatedMetadata = {
        ...this.activeConversation.metadata,
        selected_collection_id: collectionId
      };

      this.apiService.updateConversation(
        this.activeConversation.id,
        { metadata: updatedMetadata }
      ).pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (conv) => {
            this.activeConversation = conv;
            console.log('[App] Collection updated:', collectionId);
          },
          error: (err) => this.handleError('Error updating collection', err)
        });
    }
  }

  getSelectedCollection(): QdrantCollection | null {
    if (this.selectedCollectionId) {
      return this.availableCollections.find(c => c.id === this.selectedCollectionId) || null;
    }
    return null;
  }

  getCollectionBadgeText(): string {
    if (this.hasTemporaryCollection && this.uploadedFileIds.length > 0) {
      return `Temporal (${this.uploadedFileIds.length} archivo${this.uploadedFileIds.length > 1 ? 's' : ''})`;
    }

    const collection = this.getSelectedCollection();
    if (collection) {
      return collection.display_name;
    }

    return 'Sin colección';
  }

  // Cerrar dropdown al hacer click fuera
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    this.showCollectionsDropdown = false;
  }

  // ============================================================================
  // File Icon Helpers
  // ============================================================================

  // Método para obtener el icono del archivo basado en su extensión
  getFileIcon(fileName: string | undefined | null): string {
    return FileUtils.getFileIcon(fileName);
  }

  // ============================================================================
  // Dynamic Tools Helpers
  // ============================================================================

  getNonRagTools(): any[] {
    // Exclude RAG since it has special UI treatment
    return this.availableTools.filter(tool => tool.name !== 'rag_search');
  }


  // ============================================================================
  // Data Enrichment
  // ============================================================================

  loadProjectAssociations(): void {
    if (this.projects.length === 0) return;

    // Iterate projects and fetch their conversations to build the map
    this.projects.forEach(project => {
      this.projectService.getProjectConversations(project.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            response.items.forEach(c => {
              this.conversationProjectMap.set(c.id, project.id);
            });
            // Update associations incrementally as they load
            this.applyProjectAssociations();
          },
          error: (err) => console.warn(`Error loading conversations for project ${project.id}`, err)
        });
    });
  }

  applyProjectAssociations(): void {
    if (this.conversationProjectMap.size === 0) return;

    let updated = false;
    this.conversations.forEach(conv => {
      if (!conv.project_id && this.conversationProjectMap.has(conv.id)) {
        conv.project_id = this.conversationProjectMap.get(conv.id);
        updated = true;
      }
    });

    // We are modifying objects in place which are referenced by ChatService behavior subject usually.
    // Ideally we shouldn't mute them but for display purposes this updates the view.
  }


  getToolIcon(toolName: string): string {
    const iconMap: Record<string, string> = {
      'code_analyzer': 'icon-code',
      'memory': 'icon-brain',
      'deep_thinking': 'icon-brain',
      'document_processor': 'icon-document',
      'rag_search': 'icon-search'
    };
    return iconMap[toolName] || 'icon-tool';
  }

  getToolLabel(toolName: string): string {
    const labelMap: Record<string, string> = {
      'code_analyzer': 'Code',
      'memory': 'Memory',
      'deep_thinking': 'Deep Think',
      'document_processor': 'Docs',
      'rag_search': 'RAG'
    };
    return labelMap[toolName] || toolName;
  }

  trackByMessageId(index: number, message: Message): string {
    return message.id;
  }

  toggleThinking(messageId: string): void {
    if (this.expandedThinking.has(messageId)) {
      this.expandedThinking.delete(messageId);
    } else {
      this.expandedThinking.add(messageId);
    }
  }

  isThinkingExpanded(messageId: string): boolean {
    return this.expandedThinking.has(messageId);
  }

  getThinkingWordCount(thinkingContent?: string): number {
    if (!thinkingContent) return 0;
    return thinkingContent.trim().split(/\s+/).length;
  }

  getProjectName(projectId?: string): string {
    if (!projectId) return '';
    const project = this.projects.find(p => p.id === projectId);
    return project ? project.name : '';
  }

  private highlightCodeBlocks(): void {
    setTimeout(() => {
      // Seleccionar solo bloques dentro de .code-block-container
      const blocks = document.querySelectorAll('.code-block-container pre code:not(.hljs)');
      blocks.forEach((block) => {
        try {
          hljs.highlightElement(block as HTMLElement);
        } catch (e) {
          console.warn('Error highlighting code block:', e);
        }
      });

      // Inyectar botones de copiar dinámicamente (bypass Angular sanitization)
      this.injectCopyButtons();
    }, 100);
  }

  private injectCopyButtons(): void {
    const headers = document.querySelectorAll('.code-block-header:not(.has-copy-btn)');
    headers.forEach((header) => {
      // Marcar como procesado
      header.classList.add('has-copy-btn');

      // Crear botón dinámicamente
      const button = document.createElement('button');
      button.className = 'code-copy-btn';
      button.setAttribute('data-action', 'copy-code');
      button.setAttribute('type', 'button');
      button.setAttribute('aria-label', 'Copiar código');
      button.innerHTML = '<span class="copy-text">Copy</span>';

      // Insertar al final del header
      header.appendChild(button);
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}