// src/app/services/api.service.ts
// Synced with OpenAPI spec from http://localhost:8001/api/v1/docs
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

import {
  Conversation,
  ConversationListItem,
  ConversationCreate,
  ConversationUpdate,
  Message,
  ChatRequest,
  ChatResponse,
  PromptTemplate,
  PromptTemplateCreate,
  PromptTemplateUpdate,
  QdrantCollection,
  ToolConfiguration,
  ToolConfigurationCreate,
  ToolConfigurationUpdate,
  ListResponse,
  FileAttachment,
  ProvidersResponse,
  ModelInfo,
  CustomTool,
  CustomToolCreate,
  CustomToolUpdate,
  HealthCheck,
  UploadProgress,
  QdrantCollectionCreate,
  QdrantCollectionUpdate,
  FolderIngestRequest,
  IngestionStats,
  OAuthStatus
} from '../models/models';


import { BaseService } from './base.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService extends BaseService {
  private readonly baseUrl = `${environment.apiBaseUrl}${environment.apiUrl}`;

  constructor(private http: HttpClient) {
    super('ApiService');
    this.log('initialized with baseUrl:', this.baseUrl);
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  healthCheck(): Observable<HealthCheck> {
    return this.http.get<HealthCheck>(`${environment.apiBaseUrl}/health`)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  // ============================================================================
  // Conversations
  // ============================================================================

  getConversations(skip = 0, limit = 100): Observable<ListResponse<ConversationListItem>> {
    return this.http.get<ListResponse<ConversationListItem>>(`${this.baseUrl}/conversations`, {
      params: { skip: skip.toString(), limit: limit.toString() }
    }).pipe(
      tap(response => this.log('Loaded conversations:', response.total)),
      catchError(this.handleError.bind(this))
    );
  }

  getConversation(id: string): Observable<Conversation> {
    return this.http.get<Conversation>(`${this.baseUrl}/conversations/${id}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  createConversation(data: ConversationCreate): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.baseUrl}/conversations`, data)
      .pipe(
        tap(conv => this.log('Created conversation:', conv.id)),
        catchError(this.handleError.bind(this))
      );
  }

  updateConversation(id: string, data: ConversationUpdate): Observable<Conversation> {
    return this.http.patch<Conversation>(`${this.baseUrl}/conversations/${id}`, data)
      .pipe(
        tap(() => this.log('Updated conversation:', id)),
        catchError(this.handleError.bind(this))
      );
  }

  deleteConversation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/conversations/${id}`)
      .pipe(
        tap(() => this.log('Deleted conversation:', id)),
        catchError(this.handleError.bind(this))
      );
  }

  // ============================================================================
  // Messages
  // ============================================================================

  getMessages(conversationId: string, limit = 50): Observable<Message[]> {
    return this.http.get<Message[]>(
      `${this.baseUrl}/conversations/${conversationId}/messages`,
      { params: { limit: limit.toString() } }
    ).pipe(
      tap(messages => this.log('Loaded messages:', messages.length)),
      catchError(this.handleError.bind(this))
    );
  }

  sendMessage(conversationId: string, request: ChatRequest): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(
      `${this.baseUrl}/conversations/${conversationId}/chat`,
      request
    ).pipe(
      tap(response => this.log('Message sent, response received')),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Send message with streaming response using Server-Sent Events (SSE)
   * Returns a ReadableStream that yields content chunks as they arrive from the backend
   */
  async streamChat(
    conversationId: string,
    request: ChatRequest,
    abortSignal?: AbortSignal
  ): Promise<ReadableStream<string>> {
    const url = `${this.baseUrl}/conversations/${conversationId}/chat/stream`;
    this.log('Starting streaming chat:', { conversationId, message: request.message });

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request)
    };

    // Add abort signal if provided
    if (abortSignal) {
      fetchOptions.signal = abortSignal;
    }

    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP error! status: ${response.status}`;

      try {
        // Try to parse as JSON first
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.error?.message || parsed.detail || parsed.message || errorText;
      } catch {
        // Fallback: Try to extract raw message from the stringified dict format
        const rawMatch = errorText.match(/'raw':\s*'([^']+)'/);
        const msgMatch = errorText.match(/'message':\s*'([^']+)'/);

        if (rawMatch && rawMatch[1]) {
          errorMessage = rawMatch[1];
        } else if (msgMatch && msgMatch[1]) {
          errorMessage = msgMatch[1];
        } else {
          errorMessage = errorText || errorMessage;
        }
      }

      throw new Error(errorMessage);
    }
    if (!response.body) {
      throw new Error('Response body is null');
    }
    // Process SSE stream manually
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    return new ReadableStream({
      start: async (controller) => {
        try {
          let buffer = '';
          let currentEvent: string | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            // Decode and add to buffer
            buffer += decoder.decode(value, { stream: true });
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Save incomplete line
            for (const line of lines) {
              // Handle empty lines (event separator)
              if (line.trim() === '') {
                currentEvent = null;
                continue;
              }

              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();

                // Handle Error Events
                if (currentEvent === 'error') {
                  let errorMessage = 'Server error';
                  try {
                    // 1. Try JSON parsing
                    const parsed = JSON.parse(data);
                    errorMessage = parsed.error?.message || parsed.message || JSON.stringify(parsed);
                  } catch {
                    // 2. Fallback: Parse backend python-dict-string format
                    // e.g. "Error code: 429 - {'error': ... 'metadata': {'raw': 'REASON ...'}}"

                    // Try to extract the raw metadata message (most descriptive)
                    const rawMatch = data.match(/'raw':\s*'([^']+)'/);
                    // Try to extract the standard message
                    const msgMatch = data.match(/'message':\s*'([^']+)'/);

                    if (rawMatch && rawMatch[1]) {
                      errorMessage = rawMatch[1];
                    } else if (msgMatch && msgMatch[1]) {
                      errorMessage = msgMatch[1];
                    } else {
                      // 3. Fallback: Return the raw data string (cleaned up slightly if needed)
                      errorMessage = data;
                    }
                  }
                  controller.error(new Error(errorMessage));
                  return;
                }

                if (data === '[DONE]') {
                  this.log('Stream completed');
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.chunk) {
                    // Send content chunk
                    controller.enqueue(parsed.chunk);
                  } else if (parsed.type === 'thinking') {
                    // Emit thinking events
                    controller.enqueue(JSON.stringify({ type: 'thinking', content: parsed.content }));
                  } else if (parsed.type === 'metadata') {
                    // Handle final metadata (optional)
                    this.log('Metadata received:', parsed.data);
                  }
                } catch (e) {
                  // Ignore parsing errors for normal chunks
                }
              }
            }
          }
        } catch (error) {
          this.log('Stream error:', error);
          controller.error(error);
        }
      }
    });
  }

  regenerateLastMessage(conversationId: string): Observable<Message> {
    return this.http.post<Message>(
      `${this.baseUrl}/conversations/${conversationId}/regenerate`,
      {}
    ).pipe(
      tap(() => this.log('Regenerated last message')),
      catchError(this.handleError.bind(this))
    );
  }

  cancelChat(conversationId: string): Observable<Record<string, any>> {
    return this.http.post<Record<string, any>>(
      `${this.baseUrl}/conversations/${conversationId}/chat/cancel`,
      {}
    ).pipe(
      tap(() => this.log('Cancelled chat:', conversationId)),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Quick chat without existing conversation (creates a temporary one)
   * POST /api/v1/conversations/chat
   */
  quickChat(request: ChatRequest): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.baseUrl}/conversations/chat`, request)
      .pipe(
        tap(response => this.log('Quick chat response received')),
        catchError(this.handleError.bind(this))
      );
  }

  exportConversationPdf(conversationId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/conversations/${conversationId}/export/pdf`, {
      responseType: 'blob'
    }).pipe(
      tap(() => this.log('Exported conversation to PDF:', conversationId)),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // Prompt Templates
  // ============================================================================

  getPromptTemplates(
    category?: string,
    visibility?: string,
    skip = 0,
    limit = 100
  ): Observable<ListResponse<PromptTemplate>> {
    let params: any = { skip: skip.toString(), limit: limit.toString() };
    if (category) params.category = category;
    if (visibility) params.visibility = visibility;

    return this.http.get<ListResponse<PromptTemplate>>(`${this.baseUrl}/prompts`, { params })
      .pipe(
        tap(response => this.log('Loaded prompts:', response.total)),
        catchError(this.handleError.bind(this))
      );
  }

  getPromptTemplate(id: string): Observable<PromptTemplate> {
    return this.http.get<PromptTemplate>(`${this.baseUrl}/prompts/${id}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  createPromptTemplate(data: PromptTemplateCreate): Observable<PromptTemplate> {
    return this.http.post<PromptTemplate>(`${this.baseUrl}/prompts`, data)
      .pipe(
        tap(prompt => this.log('Created prompt:', prompt.id)),
        catchError(this.handleError.bind(this))
      );
  }

  updatePromptTemplate(id: string, data: PromptTemplateUpdate): Observable<PromptTemplate> {
    return this.http.put<PromptTemplate>(`${this.baseUrl}/prompts/${id}`, data)
      .pipe(
        tap(prompt => this.log('Updated prompt:', prompt.id)),
        catchError(this.handleError.bind(this))
      );
  }

  deletePromptTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/prompts/${id}`)
      .pipe(
        tap(() => this.log('Deleted prompt:', id)),
        catchError(this.handleError.bind(this))
      );
  }


  getPromptCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/prompts/categories`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  // ============================================================================
  // Collections (Qdrant)
  // ============================================================================

  getCollections(
    category?: string,
    visibility?: string,
    skip = 0,
    limit = 100
  ): Observable<ListResponse<QdrantCollection>> {
    let params: any = { skip: skip.toString(), limit: limit.toString() };
    if (category) params.category = category;
    if (visibility) params.visibility = visibility;

    return this.http.get<ListResponse<QdrantCollection>>(`${this.baseUrl}/collections`, { params })
      .pipe(
        tap(response => this.log('Loaded collections:', response.total)),
        catchError(this.handleError.bind(this))
      );
  }

  getCollection(id: string): Observable<QdrantCollection> {
    return this.http.get<QdrantCollection>(`${this.baseUrl}/collections/${id}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  createCollection(data: QdrantCollectionCreate, createInQdrant: boolean = true): Observable<QdrantCollection> {
    return this.http.post<QdrantCollection>(`${this.baseUrl}/collections`, data, {
      params: { create_in_qdrant: createInQdrant.toString() }
    }).pipe(
      tap(col => this.log('Created collection:', col.id)),
      catchError(this.handleError.bind(this))
    );
  }

  updateCollection(id: string, data: QdrantCollectionUpdate): Observable<QdrantCollection> {
    return this.http.patch<QdrantCollection>(`${this.baseUrl}/collections/${id}`, data)
      .pipe(
        tap(() => this.log('Updated collection:', id)),
        catchError(this.handleError.bind(this))
      );
  }

  deleteCollection(id: string, deleteFromQdrant: boolean = false): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/collections/${id}`, {
      params: { delete_from_qdrant: deleteFromQdrant.toString() }
    }).pipe(
      tap(() => this.log('Deleted collection:', id)),
      catchError(this.handleError.bind(this))
    );
  }

  getCollectionCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/collections/categories`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  syncCollection(id: string): Observable<QdrantCollection> {
    return this.http.post<QdrantCollection>(`${this.baseUrl}/collections/${id}/sync`, {})
      .pipe(
        tap(() => this.log('Synced collection:', id)),
        catchError(this.handleError.bind(this))
      );
  }

  getCollectionStats(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/collections/${id}/stats`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  searchInCollection(id: string, query: string, limit = 5, scoreThreshold = 0.5): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/collections/${id}/search`, null, {
      params: {
        query,
        limit: limit.toString(),
        score_threshold: scoreThreshold.toString()
      }
    }).pipe(catchError(this.handleError.bind(this)));
  }

  // Files Collections Ingestion
  ingestFolder(collectionId: string, data: FolderIngestRequest): Observable<IngestionStats> {
    return this.http.post<IngestionStats>(`${this.baseUrl}/collections/${collectionId}/ingest/folder`, data)
      .pipe(
        tap(stats => this.log('Folder ingestion completed:', stats.processed)),
        catchError(this.handleError.bind(this))
      );
  }

  ingestUpload(collectionId: string, files: File[], embeddingModel?: string): Observable<IngestionStats> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (embeddingModel) {
      formData.append('embedding_model', embeddingModel);
    }

    return this.http.post<IngestionStats>(`${this.baseUrl}/collections/${collectionId}/ingest/upload`, formData)
      .pipe(
        tap(stats => this.log('Upload ingestion completed:', stats.processed)),
        catchError(this.handleError.bind(this))
      );
  }

  /**
   * Get the status of a long-running ingestion job
   * GET /api/v1/collections/{collection_id}/ingest/status/{job_id}
   */
  getIngestStatus(collectionId: string, jobId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/collections/${collectionId}/ingest/status/${jobId}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  // ============================================================================
  // Tools
  // ============================================================================

  getAvailableTools(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/tools/available`)
      .pipe(
        tap(tools => this.log('Loaded tools:', tools.length)),
        catchError(this.handleError.bind(this))
      );
  }

  getToolTypes(): Observable<Record<string, any>> {
    return this.http.get<Record<string, any>>(`${this.baseUrl}/tools/types`)
      .pipe(
        tap(toolTypes => this.log('Loaded tool types:', toolTypes)),
        catchError(this.handleError.bind(this))
      );
  }

  getToolDetails(toolName: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/tools/available/${toolName}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  getToolCategories(): Observable<Record<string, any[]>> {
    return this.http.get<Record<string, any[]>>(`${this.baseUrl}/tools/categories`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * List available tools based on execution mode ('manual' | 'agent')
   * GET /api/v1/tools/by-mode/{mode}
   */
  getToolsByMode(mode: 'manual' | 'agent', conversationId?: string): Observable<any> {
    let params: any = {};
    if (conversationId) params.conversation_id = conversationId;
    return this.http.get<any>(`${this.baseUrl}/tools/by-mode/${mode}`, { params })
      .pipe(catchError(this.handleError.bind(this)));
  }

  getToolConfigurations(conversationId: string, activeOnly = true): Observable<ToolConfiguration[]> {
    return this.http.get<ToolConfiguration[]>(
      `${this.baseUrl}/tools/configurations/conversation/${conversationId}`,
      { params: { active_only: activeOnly.toString() } }
    ).pipe(catchError(this.handleError.bind(this)));
  }

  createToolConfiguration(data: ToolConfigurationCreate): Observable<ToolConfiguration> {
    return this.http.post<ToolConfiguration>(`${this.baseUrl}/tools/configurations`, data)
      .pipe(
        tap(config => this.log('Created tool config:', config.id)),
        catchError(this.handleError.bind(this))
      );
  }

  updateToolConfiguration(
    id: string,
    data: ToolConfigurationUpdate
  ): Observable<ToolConfiguration> {
    return this.http.patch<ToolConfiguration>(
      `${this.baseUrl}/tools/configurations/${id}`,
      data
    ).pipe(
      tap(() => this.log('Updated tool config:', id)),
      catchError(this.handleError.bind(this))
    );
  }

  deleteToolConfiguration(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/tools/configurations/${id}`)
      .pipe(
        tap(() => this.log('Deleted tool config:', id)),
        catchError(this.handleError.bind(this))
      );
  }

  /**
   * Bulk create tool configurations
   * POST /api/v1/tools/configurations/bulk
   */
  bulkCreateToolConfigurations(
    conversationId: string,
    toolNames: string[],
    defaultConfigs?: Record<string, any> | null
  ): Observable<ToolConfiguration[]> {
    // Correct endpoint: /api/v1/tools/configurations/bulk
    const url = `${this.baseUrl}/tools/configurations/bulk`;

    return this.http.post<ToolConfiguration[]>(url, defaultConfigs ?? null, {
      params: {
        conversation_id: conversationId,
        tool_names: toolNames
      }
    }).pipe(
      tap(configs => this.log('Created bulk tool configs:', configs.length)),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Execute a tool with given parameters (for testing/debugging)
   * POST /api/v1/tools/execute?tool_name={toolName}
   */
  executeToolTest(toolName: string, parameters: Record<string, any> = {}): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/tools/execute`, parameters, {
      params: { tool_name: toolName }
    }).pipe(
      tap(() => this.log('Executed tool test:', toolName)),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // Custom Tools
  // ============================================================================

  getCustomTools(): Observable<CustomTool[]> {
    return this.http.get<CustomTool[]>(`${this.baseUrl}/tools/custom`)
      .pipe(
        tap(tools => this.log('Loaded custom tools:', tools.length)),
        catchError(this.handleError.bind(this))
      );
  }

  getCustomTool(toolId: string): Observable<CustomTool> {
    return this.http.get<CustomTool>(`${this.baseUrl}/tools/custom/${toolId}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  createCustomTool(data: CustomToolCreate): Observable<CustomTool> {
    return this.http.post<CustomTool>(`${this.baseUrl}/tools/custom`, data)
      .pipe(
        tap(tool => this.log('Created custom tool:', tool.id)),
        catchError(this.handleError.bind(this))
      );
  }

  updateCustomTool(toolId: string, data: CustomToolUpdate): Observable<CustomTool> {
    return this.http.patch<CustomTool>(`${this.baseUrl}/tools/custom/${toolId}`, data)
      .pipe(
        tap(() => this.log('Updated custom tool:', toolId)),
        catchError(this.handleError.bind(this))
      );
  }

  deleteCustomTool(toolId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/tools/custom/${toolId}`)
      .pipe(
        tap(() => this.log('Deleted custom tool:', toolId)),
        catchError(this.handleError.bind(this))
      );
  }

  // ============================================================================
  // Files
  // ============================================================================

  uploadFile(file: File, conversationId?: string, projectId?: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    let params: any = {};
    if (conversationId) {
      params.conversation_id = conversationId;
    }
    if (projectId) {
      params.project_id = projectId;
    }

    return this.http.post(`${this.baseUrl}/files/upload`, formData, {
      params,
      reportProgress: true,
      observe: 'events'
    }).pipe(
      // Pass through events
      tap(event => {
        // Log only final response
        if (event['type'] === 4) { // HttpEventType.Response
          this.log('Uploaded file:', (event as any).body?.id);
        }
      }),
      catchError(this.handleError.bind(this))
    );
  }

  getUploadProgress(fileId: string): Observable<UploadProgress> {
    return this.http.get<UploadProgress>(`${this.baseUrl}/files/${fileId}/upload-progress`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Get detailed processing status for a file
   * GET /api/v1/files/{file_id}/status
   */
  getFileProcessingStatus(fileId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/files/${fileId}/status`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  uploadFiles(files: File[], conversationId?: string, projectId?: string): Observable<FileAttachment[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    let params: any = {};
    if (conversationId) {
      params.conversation_id = conversationId;
    }
    if (projectId) {
      params.project_id = projectId;
    }

    return this.http.post<FileAttachment[]>(`${this.baseUrl}/files/batch/upload`, formData, { params })
      .pipe(
        tap(responses => this.log('Uploaded files:', responses.length)),
        catchError(this.handleError.bind(this))
      );
  }

  getFiles(
    conversationId?: string,
    fileType?: string,
    processed?: boolean,
    skip = 0,
    limit = 50
  ): Observable<ListResponse<FileAttachment>> {
    let params: any = { skip: skip.toString(), limit: limit.toString() };
    if (conversationId) params.conversation_id = conversationId;
    if (fileType) params.file_type = fileType;
    if (processed !== undefined) params.processed = processed.toString();

    return this.http.get<ListResponse<FileAttachment>>(`${this.baseUrl}/files`, { params })
      .pipe(
        tap(response => this.log('Loaded files:', response.total)),
        catchError(this.handleError.bind(this))
      );
  }

  getFile(fileId: string): Observable<FileAttachment> {
    return this.http.get<FileAttachment>(`${this.baseUrl}/files/${fileId}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  downloadFile(fileId: string): string {
    return `${this.baseUrl}/files/${fileId}/download`;
  }

  /**
   * Batch delete multiple files
   * DELETE /api/v1/files/batch/delete
   * Note: sends file IDs in the request body
   */
  batchDeleteFiles(fileIds: string[], deleteFromDisk = true): Observable<void> {
    return this.http.request<void>('DELETE', `${this.baseUrl}/files/batch/delete`, {
      body: fileIds,
      params: { delete_from_disk: deleteFromDisk.toString() }
    }).pipe(
      tap(() => this.log('Batch deleted files:', fileIds.length)),
      catchError(this.handleError.bind(this))
    );
  }

  deleteFile(fileId: string, deleteFromDisk = true): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/files/${fileId}`, {
      params: { delete_from_disk: deleteFromDisk.toString() }
    }).pipe(
      tap(() => this.log('Deleted file:', fileId)),
      catchError(this.handleError.bind(this))
    );
  }

  processFile(fileId: string): Observable<FileAttachment> {
    return this.http.post<FileAttachment>(`${this.baseUrl}/files/${fileId}/process`, {})
      .pipe(
        tap(() => this.log('Processing file:', fileId)),
        catchError(this.handleError.bind(this))
      );
  }

  getFileContent(fileId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/files/${fileId}/content`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  // ============================================================================
  // Providers
  // ============================================================================

  getProviders(): Observable<ProvidersResponse> {
    return this.http.get<any>(`${this.baseUrl}/providers`)
      .pipe(
        tap(providers => this.log('Loaded providers')),
        map(response => this.normalizeProvidersResponse(response)),
        catchError(this.handleError.bind(this))
      );
  }

  private normalizeProvidersResponse(response: any): ProvidersResponse {
    if (!response || !response.models) {
      return { providers: [], models: {} };
    }

    const normalized: ProvidersResponse = {
      providers: response.providers || [],
      models: {}
    };

    for (const [provider, modelList] of Object.entries(response.models)) {
      normalized.models[provider] = (modelList as any[]).map((model: any) => ({
        ...model,
        // Provide defaults for new fields if backend doesn't include them
        supports_thinking: model.supports_thinking ?? false,
        is_active: model.is_active ?? true,
        is_custom: model.is_custom ?? false
      }));
    }

    return normalized;
  }

  // ============================================================================
  // OAuth Bitbucket
  // ============================================================================

  getBitbucketStatus(): Observable<OAuthStatus> {
    return this.http.get<OAuthStatus>(`${this.baseUrl}/oauth/bitbucket/status`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  revokeBitbucket(): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/oauth/bitbucket/revoke`, {})
      .pipe(catchError(this.handleError.bind(this)));
  }

  getBitbucketAuthorizeUrl(): string {
    return `${this.baseUrl}/oauth/bitbucket/authorize`;
  }
}