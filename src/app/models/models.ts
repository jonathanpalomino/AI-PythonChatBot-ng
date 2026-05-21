// src/app/models/models.ts
// Auto-synced with OpenAPI spec from http://localhost:8001/api/v1/docs

// =============================================================================
// Project Models
// =============================================================================

/** ProjectResponse – matches API schema */
export interface Project {
  id: string; // UUID
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string; // ISO Date
  updated_at: string; // ISO Date
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
}

export interface ProjectUpdate {
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

// =============================================================================
// Conversation Models
// =============================================================================

// Lightweight conversation list item (from GET /api/v1/conversations)
export interface ConversationListItem {
  id: string;
  title: string;
  message_count: number | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  provider: string | null;   // Preview for UI
  model: string | null;      // Preview for UI
  project_id?: string | null;
  prompt_template_id?: string | null;
  settings?: Record<string, any>;
  extra_metadata?: Record<string, any>;
}

// Full conversation (from GET /api/v1/conversations/{id})
export interface Conversation {
  id: string;
  title: string;
  project_id?: string | null;
  settings: ConversationSettings;
  created_at: string;
  updated_at: string;
  prompt_template_id?: string | null;
  extra_metadata?: Record<string, any>;
  message_count?: number | null;
  last_message_at?: string | null;
}

export interface ConversationSettings {
  provider: string;  // e.g. 'local' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'groq'
  model: string;
  temperature?: number | null;
  max_tokens?: number | null;
  top_p?: number | null;
  stream_chat?: boolean;
  max_history_messages?: number;
  tool_mode: ToolMode;
  enabled_tools: string[];
  available_tools?: string[] | null;
  allow_tool_chaining?: boolean;
  memory_config: MemoryConfig;
  rag_enabled?: boolean;
  hallucination_control?: HallucinationControlSettings;
  embedding_model?: string | null;
  // Advanced Ollama Options
  num_ctx?: number | null;
  num_gpu?: number | null;
  num_thread?: number | null;
  num_batch?: number | null;
}

export interface MemoryConfig {
  semantic_enabled: boolean;
  search_k: number;
  score_threshold: number;
  auto_index: boolean;
  temporal_window_hours?: number | null;
}

/** Matches HallucinationControlSettings schema */
export interface HallucinationControlSettings {
  mode: HallucinationMode;
  require_sources?: boolean;
  confidence_threshold?: number;
}

/** @deprecated Use HallucinationControlSettings */
export interface HallucinationControl extends HallucinationControlSettings {}

export interface ConversationCreate {
  title: string;
  project_id?: string | null;
  settings?: Partial<ConversationSettings>;
  prompt_template_id?: string | null;
  extra_metadata?: Record<string, any>;
}

/** Matches ConversationUpdate schema */
export interface ConversationUpdate {
  title?: string | null;
  settings?: Partial<ConversationSettings> | null;
  extra_metadata?: Record<string, any> | null;
}

// =============================================================================
// Message Models
// =============================================================================

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  thinking_content?: string | null;
  is_active?: boolean;
  extra_metadata?: MessageMetadata;
  attachments?: Record<string, any>[];
  created_at: string;
}

export interface MessageMetadata {
  tools_used?: string[];
  confidence_score?: number;
  rag_sources?: RagSource[];
  tool_results?: any[];
  provider?: string;
  model?: string;
  tokens_used?: number;
  stream_complete?: boolean;
  thinking_content?: string | null;
}

export interface RagSource {
  file: string;
  section: string;
  score: number;
  content?: string;
}

// =============================================================================
// Chat Models
// =============================================================================

/** Matches ChatRequest schema */
export interface ChatRequest {
  message: string;
  conversation_id?: string | null;
  file_ids?: string[];
  stream?: boolean;
  collection_name?: string | null;
  temperature_override?: number | null;
  max_tokens_override?: number | null;
  extra_metadata?: Record<string, any> | null;
}

/** Matches ChatResponse schema */
export interface ChatResponse {
  conversation_id: string;
  message: Message;
  sources?: Record<string, any>[];
  tools_executed?: string[];
  confidence_score?: number | null;
  thinking_content?: string | null;
}

// =============================================================================
// Prompt Template Models
// =============================================================================

export interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  visibility: VisibilityType;
  system_prompt: string;
  user_prompt_template?: string | null;
  variables?: Record<string, any>[];  // Flexible, as API returns object[]
  settings?: Record<string, any>;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches PromptTemplateVariable schema */
export interface PromptVariable {
  name: string;
  /** 'text' | 'select' | 'number' | 'boolean' */
  type: string;
  options?: string[] | null;
  default?: any;
  required?: boolean;
  description?: string | null;
}

/** Matches PromptTemplateSettings schema */
export interface PromptSettings {
  recommended_provider?: string | null;
  recommended_model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  default_tools?: string[] | null;
  hallucination_mode?: HallucinationMode | null;
}

/** Matches PromptTemplateCreate schema */
export interface PromptTemplateCreate {
  name: string;
  description?: string | null;
  category: string;
  visibility?: VisibilityType;
  system_prompt: string;
  user_prompt_template?: string | null;
  variables?: PromptVariable[];
  settings?: Partial<PromptSettings>;
  created_by?: string | null;
}

/** Matches PromptTemplateUpdate schema */
export interface PromptTemplateUpdate {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  visibility?: VisibilityType | null;
  system_prompt?: string | null;
  user_prompt_template?: string | null;
  variables?: PromptVariable[] | null;
  settings?: Partial<PromptSettings> | null;
  is_active?: boolean | null;
}

// =============================================================================
// Collection Models
// =============================================================================

/** Matches QdrantCollectionResponse schema */
export interface QdrantCollection {
  id: string | null; // Nullable for unregistered collections
  name: string;
  display_name: string;
  description?: string | null;
  category: string | null;
  visibility: VisibilityType;
  is_active: boolean;
  vector_count: number;
  last_synced?: string | null;
  created_at: string | null;
  updated_at: string | null;
  extra_metadata?: Record<string, any>;
  is_registered_bd?: boolean; // UI flag: registered vs unregistered
}

/** Matches QdrantCollectionCreate schema */
export interface QdrantCollectionCreate {
  name: string;
  display_name: string;
  description?: string | null;
  category?: string | null;
  visibility?: VisibilityType;
  extra_metadata?: Record<string, any>;
}

/** Matches QdrantCollectionUpdate schema */
export interface QdrantCollectionUpdate {
  display_name?: string | null;
  description?: string | null;
  category?: string | null;
  is_active?: boolean | null;
  visibility?: VisibilityType | null;
  vector_count?: number | null;
  last_synced?: string | null;
  extra_metadata?: Record<string, any> | null;
}

/** Matches FolderIngestRequest schema */
export interface FolderIngestRequest {
  folder_path: string;
  recursive?: boolean;
  embedding_model?: string | null;
}

/** Matches IngestionStats schema */
export interface IngestionStats {
  total_found: number;
  processed: number;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  error_details?: IngestionErrorDetail[];
}

/** Matches IngestionErrorDetail schema */
export interface IngestionErrorDetail {
  file: string;
  error: string;
}

// =============================================================================
// Tool Configuration Models
// =============================================================================

/** Matches ToolConfigurationResponse schema */
export interface ToolConfiguration {
  id: string;
  conversation_id: string;
  tool_name: string;
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Matches ToolConfigurationCreate schema */
export interface ToolConfigurationCreate {
  conversation_id: string;
  tool_name: string;
  config?: Record<string, any>;
  is_active?: boolean;
}

/** Matches ToolConfigurationUpdate schema */
export interface ToolConfigurationUpdate {
  config?: Record<string, any> | null;
  is_active?: boolean | null;
}

// =============================================================================
// Available Tools Models
// =============================================================================

export interface AvailableTool {
  name: string;
  description: string;
  category: string;
  enabled_by_default: boolean;
  requires_context: boolean;
  parameters?: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: any;
  enum?: any[];
}

export interface ToolInstance {
  name: string;
  description: string;
  category: string;
  parameters: Record<string, any>;
  is_custom: boolean;
  display_name: string;
}

export interface ToolCategory {
  name: string;
  tools: ToolInstance[];
}

// =============================================================================
// Custom Tools Models
// =============================================================================

/** Matches CustomToolResponse schema */
export interface CustomTool {
  id: string;
  name: string;
  description: string | null;
  tool_type: ToolType;
  configuration: Record<string, any>;
  intent_examples: string[];
  content_prompt: string | null;
  visibility: VisibilityType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Matches CustomToolCreate schema */
export interface CustomToolCreate {
  name: string;
  description?: string | null;
  tool_type?: ToolType;
  configuration: Record<string, any>;
  intent_examples?: string[];
  content_prompt?: string | null;
  visibility?: VisibilityType;
  is_active?: boolean;
}

/** Matches CustomToolUpdate schema */
export interface CustomToolUpdate {
  name?: string | null;
  description?: string | null;
  tool_type?: ToolType | null;
  configuration?: Record<string, any> | null;
  intent_examples?: string[] | null;
  content_prompt?: string | null;
  visibility?: VisibilityType | null;
  is_active?: boolean | null;
}

export interface RagToolConfig {
  k?: number;
  score_threshold?: number;
  filters?: Record<string, any>;
  enable_rerank?: boolean;
  rerank_top_k?: number;
  search_mode?: 'semantic' | 'lexical' | 'hybrid';
  hybrid_alpha?: number;
  enable_parent_retrieval?: boolean;
  parent_mode?: 'full_parent' | 'windowed';
}

// =============================================================================
// File Models
// =============================================================================

/** Matches FileResponse schema */
export interface FileAttachment {
  id: string;
  conversation_id: string | null;
  project_id?: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  mime_type: string | null;
  processed: boolean;
  processing_status: ProcessingStatus;
  extra_metadata: Record<string, any>;
  uploaded_at: string;
}

export interface UploadProgress {
  processing_progress: number;
  status: ProcessingStatus;
  error?: string;
}

// =============================================================================
// API Response Models
// =============================================================================

/** Matches ListResponse schema */
export interface ListResponse<T = any> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface ApiError {
  detail: string | { loc: any[]; msg: string; type: string }[];
  status_code?: number;
}

export interface HealthCheck {
  status: string;
  environment?: string;
  database?: string;
  version?: string;
  qdrant?: string;
  ollama?: string;
}

// =============================================================================
// Provider & Model Models
// =============================================================================

export interface ModelInfo {
  id?: string;
  name: string;
  context_window: number;
  supports_function_calling: boolean;
  supports_streaming: boolean;
  model_type: ModelType;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  supports_thinking: boolean;
  is_active: boolean;
  is_custom: boolean;
  cpu_supported: boolean;
  gpu_required: boolean;
  parent_retrieval_supported: boolean;
}

export interface ProvidersResponse {
  providers: string[];
  models: Record<string, ModelInfo[]>;
}

// =============================================================================
// Enums & Types
// =============================================================================

/** Matches MessageRole enum */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Matches ToolMode enum */
export type ToolMode = 'agent' | 'manual';

/** Matches HallucinationMode enum */
export type HallucinationMode = 'strict' | 'balanced' | 'creative';

/** Matches VisibilityType enum */
export type VisibilityType = 'public' | 'private' | 'shared';

/** Matches ProcessingStatus enum from API */
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';

/** Matches ToolType enum */
export type ToolType =
  | 'http_request'
  | 'sql_query'
  | 'rag_search'
  | 'codebase_tool'
  | 'obsidian_vault_loader'
  | 'sftp_connection'
  | 'custom';

export type ModelType =
  | 'chat'
  | 'reasoning'
  | 'code'
  | 'general'
  | 'embedding'
  | 'vision'
  | 'multimodal'
  | 'other';

import { SUPPORTED_PROVIDERS } from '../config/providers.config';
export type Provider = typeof SUPPORTED_PROVIDERS[number]['id'];

// =============================================================================
// UI-Only Models (not from OpenAPI)
// =============================================================================

/** Extended for UI upload tracking – not a backend schema */
export interface UploadingFile extends File {
  id?: string;
  uploadProgress?: number;
  processingProgress?: number;
  isUploading?: boolean;
  isProcessing?: boolean;
  /** UI can also show 'uploading' and 'failed' states locally */
  status?: ProcessingStatus | 'uploading' | 'failed';
  uploadError?: boolean;
  errorMessage?: string;
}

export interface CustomToolParameter {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  enum?: string[];
  default?: any;
}

// =============================================================================
// OAuth Models
// =============================================================================

export interface OAuthStatus {
  provider: string;
  authorized: boolean;
  user_id: string;
}