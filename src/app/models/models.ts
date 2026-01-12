// src/app/models/models.ts

// =============================================================================
// Project Models
// =============================================================================

export interface Project {
  id: string; // UUID
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string; // ISO Date
  updated_at: string; // ISO Date
}

export interface ProjectCreate {
  name: string;
  description?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
}

// =============================================================================
// Conversation Models
// =============================================================================

// Lightweight conversation list item (from GET /api/v1/conversations)
export interface ConversationListItem {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  provider: string | null;  // Preview for UI
  model: string | null;     // Preview for UI
  project_id?: string;
}

// Full conversation (from GET /api/v1/conversations/{id})
export interface Conversation {
  id: string;
  title: string;
  project_id?: string;
  settings: ConversationSettings;
  created_at: string;
  updated_at: string;
  prompt_template_id?: string;
  metadata?: Record<string, any>;
  message_count?: number;
  last_message_at?: string;
}

export interface ConversationSettings {
  provider: 'local' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'groq';
  model: string;
  temperature: number;
  max_tokens?: number;
  top_p?: number;
  tool_mode: 'agent' | 'manual';
  enabled_tools: string[];
  available_tools?: string[];
  allow_tool_chaining?: boolean;
  memory_config: MemoryConfig;
  rag_enabled?: boolean;
  hallucination_control?: HallucinationControl;
  embedding_model?: string;
  // Advanced Ollama Options
  num_ctx?: number;
  num_gpu?: number;
  num_thread?: number;
  num_batch?: number;
  max_history_messages?: number;
  stream_chat?: boolean;
}

export interface MemoryConfig {
  semantic_enabled: boolean;
  search_k: number;
  score_threshold: number;
  auto_index: boolean;
  temporal_window_hours?: number;
}

export interface HallucinationControl {
  mode: 'strict' | 'balanced' | 'creative';
  require_sources?: boolean;
  confidence_threshold?: number;
}

export interface ConversationCreate {
  title: string;
  project_id?: string;
  settings: ConversationSettings;
  prompt_template_id?: string;
  initial_message?: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// Message Models
// =============================================================================

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: MessageMetadata;
  attachments?: FileAttachment[];
  thinking_content?: string;  // NEW: Direct thinking content from API
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
  thinking_content?: string;  // NEW: Reasoning/thinking from models
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

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  file_ids?: string[];
  stream?: boolean;
  temperature_override?: number;
  max_tokens_override?: number;
}

export interface ChatResponse {
  conversation_id: string;
  message: Message;
  sources?: RagSource[];
  tools_executed?: string[];
  confidence_score?: number;
  thinking_content?: string;  // NEW: Exposed from backend
}

// =============================================================================
// Prompt Template Models
// =============================================================================

export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  visibility: 'public' | 'private' | 'shared';
  system_prompt: string;
  user_prompt_template?: string;
  variables?: PromptVariable[];
  settings?: PromptSettings;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  content?: string;
  recommended_model?: string;
}

export interface PromptVariable {
  name: string;
  type: string;
  description?: string;
  default?: any;
  required?: boolean;
  options?: string[];
}

export interface PromptSettings {
  recommended_provider?: string;
  recommended_model?: string;
  temperature?: number;
  max_tokens?: number;
  default_tools?: string[];
  top_p?: number;
  hallucination_mode?: 'strict' | 'balanced' | 'creative';
}

// =============================================================================
// Collection Models
// =============================================================================

export interface QdrantCollection {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  category: string;
  visibility: 'public' | 'private' | 'shared';
  is_active: boolean;
  vector_count?: number;
  last_synced?: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// Tool Models
// =============================================================================

export interface ToolConfiguration {
  id: string;
  conversation_id: string;
  tool_name: string;
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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

// =============================================================================
// Custom Tools Models
// =============================================================================

export interface CustomTool {
  id: string; // UUID
  name: string;
  description?: string;
  tool_type: string;
  configuration: any;
  visibility: 'public' | 'private' | 'shared';
  is_active: boolean;
  created_at: string; // ISO Date
  updated_at: string; // ISO Date
}

export interface CustomToolParameter {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  enum?: string[];
  default?: any;
}

export interface CustomToolCreate {
  name: string;
  description?: string;
  tool_type: string;
  configuration: any;
  visibility?: 'public' | 'private' | 'shared';
  is_active?: boolean;
}

export interface CustomToolUpdate {
  name?: string;
  description?: string;
  tool_type?: string;
  configuration?: any;
  visibility?: 'public' | 'private' | 'shared';
  is_active?: boolean;
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

export interface FileAttachment {
  id: string;
  conversation_id?: string;
  project_id?: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  mime_type?: string;
  processed: boolean;
  processing_status: 'pending' | 'processing' | 'completed' | 'error';
  uploaded_at: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// API Response Models
// =============================================================================

export interface ListResponse<T = any> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface ApiError {
  detail: string;
  status_code?: number;
}

export interface HealthCheck {
  status: string;
  environment: string;
  database: string;
  version?: string;
  qdrant?: string;
  ollama?: string;
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

export interface UploadProgress {
  processing_progress: number;
  status: ProcessingStatus;
  error?: string;
}

// =============================================================================
// Provider & Model Models
// =============================================================================

// Model capability and metadata information
export interface ModelInfo {
  name: string;
  context_window: number;
  supports_function_calling: boolean;
  supports_streaming: boolean;
  model_type: ModelType;
  cost_per_1k_input: number;
  cost_per_1k_output: number;

  // ✨ NEW FIELDS for filtering
  supports_thinking: boolean;   // Model can generate <think> tags (razonamiento)
  is_active: boolean;            // Model is active and available
  is_custom: boolean;            // Model manually added by user

  // ✨ NEW PROVIDER ATTRIBUTES
  cpu_supported: boolean;        // CPU support
  gpu_required: boolean;         // GPU required
  parent_retrieval_supported: boolean;  // Parent retrieval support
}

export interface ProvidersResponse {
  providers: string[];
  models: Record<string, ModelInfo[]>;
}

// =============================================================================
// Enums & Types
// =============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type ToolMode = 'agent' | 'manual';
import { SUPPORTED_PROVIDERS } from '../config/providers.config';
export type HallucinationMode = 'strict' | 'balanced' | 'creative';
export type VisibilityType = 'public' | 'private' | 'shared';
export type ProcessingStatus = 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'failed';
export type Provider = typeof SUPPORTED_PROVIDERS[number]['id'];
export type ModelType = 'chat' | 'reasoning' | 'code' | 'general' | 'embedding' | 'vision' | 'multimodal' | 'other';

export interface UploadingFile extends File {
  id?: string; // ID assigned by backend after upload
  uploadProgress?: number;
  processingProgress?: number; // 0-100
  isUploading?: boolean;
  isProcessing?: boolean;
  status?: ProcessingStatus;
  uploadError?: boolean;
  errorMessage?: string;
}