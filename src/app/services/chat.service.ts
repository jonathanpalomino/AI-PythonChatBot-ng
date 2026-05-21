// src/app/services/chat.service.ts
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  Conversation,
  ConversationListItem,
  ConversationCreate,
  Message,
  ChatRequest,
  FileAttachment
} from '../models/models';
import { BaseService } from './base.service';

@Injectable({
  providedIn: 'root'
})
export class ChatService extends BaseService {
  // Estado reactivo con BehaviorSubjects
  private conversationsSubject = new BehaviorSubject<ConversationListItem[]>([]);
  public conversations$ = this.conversationsSubject.asObservable();

  private activeConversationSubject = new BehaviorSubject<Conversation | null>(null);
  public activeConversation$ = this.activeConversationSubject.asObservable();

  private messagesSubject = new BehaviorSubject<Message[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  // Track current processing conversation
  private currentProcessingConversationId: string | null = null;
  private currentStreamAbortController: AbortController | null = null;

  constructor(private apiService: ApiService, private zone: NgZone) {
    super('ChatService');
  }

  // ============================================================================
  // Conversations Management
  // ============================================================================

  /**
   * Cargar todas las conversaciones desde el backend
   */
  loadConversations(): Observable<ConversationListItem[]> {
    return this.apiService.getConversations().pipe(
      tap(response => {
        this.conversationsSubject.next(response.items);
        this.log('Service reset');
      }),
      map(response => response.items)
    );
  }

  /**
   * Crear una nueva conversación
   */
  createConversation(data: ConversationCreate): Observable<Conversation> {
    return this.apiService.createConversation(data).pipe(
      tap(conversation => {

        // Convertir a item de lista para agregar a la lista local
        const listItem: ConversationListItem = {
          id: conversation.id,
          title: conversation.title,
          message_count: 0,
          last_message_at: conversation.created_at,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
          provider: conversation.settings.provider,
          model: conversation.settings.model,
          project_id: conversation.project_id
        };

        // Agregar al inicio de la lista
        const current = this.conversationsSubject.value;
        this.conversationsSubject.next([listItem, ...current]);

        // Activar la nueva conversación (ya tenemos los detalles completos)
        this.activeConversationSubject.next(conversation);
        this.messagesSubject.next([]); // Nueva conversación, sin mensajes

        console.log('[ChatService] Created conversation:', conversation.id);
      })
    );
  }

  /**
   * Actualizar una conversación existente
   */
  updateConversation(id: string, data: Partial<Conversation>): Observable<Conversation> {
    return this.apiService.updateConversation(id, data).pipe(
      tap(updated => {
        // Actualizar en la lista
        const current = this.conversationsSubject.value;
        const index = current.findIndex(c => c.id === id);

        if (index > -1) {
          // Actualizar solo los campos que cambiaron o existen en el item de lista
          const updatedItem: ConversationListItem = {
            ...current[index],
            title: updated.title,
            updated_at: updated.updated_at,
            project_id: updated.project_id
            // Actualizar otros campos si es necesario, pero ConversationListItem tiene menos campos
          };
          current[index] = updatedItem;
          this.conversationsSubject.next([...current]);
        }

        // Si es la activa, actualizar también
        if (this.activeConversationSubject.value?.id === id) {

          this.activeConversationSubject.next(updated);
        }

        this.log('Updated conversation:', id);
      })
    );
  }

  /**
   * Eliminar una conversación
   */
  deleteConversation(id: string): Observable<void> {
    return this.apiService.deleteConversation(id).pipe(
      tap(() => {
        // Remover de la lista
        const current = this.conversationsSubject.value;
        this.conversationsSubject.next(current.filter(c => c.id !== id));

        // Si era la activa, limpiar
        if (this.activeConversationSubject.value?.id === id) {
          this.activeConversationSubject.next(null);
          this.messagesSubject.next([]);
        }

        this.log('Deleted conversation:', id);
      })
    );
  }

  /**
   * Establecer la conversación activa y cargar sus mensajes
   * Ahora carga los detalles completos de la conversación desde el API
   */
  setActiveConversation(id: string): void {
    // Primero verificamos si está en la lista (para feedback inmediato o validación)
    const listItem = this.conversationsSubject.value.find(c => c.id === id);

    if (listItem) {
      this.loadingSubject.next(true);

      // Cargar detalles completos de la conversación
      this.apiService.getConversation(id).subscribe({
        next: (conversation) => {
          this.activeConversationSubject.next(conversation);
          this.loadMessages(id);
          this.log('Set active conversation:', id);
        },
        error: (error) => {
          console.error('[ChatService] Error loading conversation details:', error);
          this.loadingSubject.next(false);
        }
      });
    } else {
      console.warn('[ChatService] Conversation not found in list:', id);
    }
  }

  /**
   * Limpiar la conversación activa
   */
  clearActiveConversation(): void {
    this.activeConversationSubject.next(null);
    this.messagesSubject.next([]);
    this.log('Cleared active conversation');
  }

  /**
   * Obtener la conversación activa actual
   */
  getActiveConversation(): Conversation | null {
    return this.activeConversationSubject.value;
  }

  /**
   * Obtener todas las conversaciones actuales
   */
  getConversations(): ConversationListItem[] {
    return this.conversationsSubject.value;
  }

  // ============================================================================
  // Messages Management
  // ============================================================================

  /**
   * Cargar mensajes de una conversación
   */
  loadMessages(conversationId: string): void {
    this.apiService.getMessages(conversationId).subscribe({
      next: (messages) => {
        // Procesar mensajes para mover thinking_content a extra_metadata si es necesario
        const processedMessages = messages.map(message => {
          if (message.thinking_content && !message.extra_metadata?.thinking_content) {
            return {
              ...message,
              extra_metadata: {
                ...message.extra_metadata,
                thinking_content: message.thinking_content
              }
            };
          }
          return message;
        });

        this.messagesSubject.next(processedMessages);
        this.log('Loaded messages:', processedMessages.length);
        this.loadingSubject.next(false);

        // Check for attachments with missing details and fetch them
        this.populateMissingFileDetails(processedMessages);
      },
      error: (error) => {
        console.error('[ChatService] Error loading messages:', error);
        this.messagesSubject.next([]);
        this.loadingSubject.next(false);
      }
    });
  }

  private populateMissingFileDetails(messages: Message[]): void {
    const fileIdsToFetch = new Set<string>();

    // Identify files needing details
    messages.forEach(msg => {
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach(att => {
          if (!att['file_name']) {
            const fileId = (att as any).file_id || (att as any).id;
            if (fileId) {
              fileIdsToFetch.add(fileId);
            }
          }
        });
      }
    });

    if (fileIdsToFetch.size === 0) return;

    this.log(`Fetching details for ${fileIdsToFetch.size} files`);

    // Fetch details for each file
    fileIdsToFetch.forEach(fileId => {
      this.apiService.getFile(fileId).subscribe({
        next: (fileDetails) => {
          // Update all messages containing this file
          const currentMessages = this.messagesSubject.value;
          let updated = false;

          currentMessages.forEach(msg => {
            if (msg.attachments) {
              msg.attachments.forEach((att: any) => {
                const attId = att.file_id || att.id;
                if (attId === fileId && !att.file_name) {
                  // Merge details
                  Object.assign(att, {
                    file_name: fileDetails.file_name,
                    file_size: fileDetails.file_size,
                    file_type: fileDetails.file_type,
                    storage_path: fileDetails.storage_path
                  });
                  updated = true;
                }
              });
            }
          });

          if (updated) {
            // Trigget UI update
            this.messagesSubject.next([...currentMessages]);
          }
        },
        error: (err) => console.warn(`[ChatService] Failed to fetch details for file ${fileId}`, err)
      });
    });
  }

  /**
   * Enviar un mensaje y obtener respuesta
   * Usa modo streaming o síncrono según la configuración de la conversación
   */
  sendMessage(message: string, fileIds: string[] = [], fileInfo: Array<{ name: string, size: number, type: string }> = [], collectionName?: string): Observable<void> {
    const conversation = this.activeConversationSubject.value;

    if (!conversation) {
      throw new Error('No active conversation');
    }

    this.loadingSubject.next(true);
    this.currentProcessingConversationId = conversation.id;

    const request: ChatRequest = {
      message,
      file_ids: fileIds,
      collection_name: collectionName
    };

    // Agregar mensaje del usuario optimísticamente
    const userMessage: Message = {
      id: 'temp-' + Date.now(),
      conversation_id: conversation.id,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
      // Include attachments if files were uploaded
      ...(fileIds.length > 0 && {
        attachments: fileIds.map((fileId, index) => ({
          id: fileId,
          file_name: fileInfo[index]?.name || 'Unknown file',
          file_size: fileInfo[index]?.size || 0,
          file_type: fileInfo[index]?.type || 'application/octet-stream',
          storage_path: '', // Placeholder for frontend-only display
          processed: false,
          processing_status: 'completed' as const,
          uploaded_at: new Date().toISOString()
        }))
      })
    };

    const currentMessages = this.messagesSubject.value;
    this.messagesSubject.next([...currentMessages, userMessage]);

    // Verificar si debe usar streaming o modo síncrono
    const useStreaming = conversation.settings.stream_chat === true;

    if (useStreaming) {
      return this.handleStreamingMessage(conversation.id, request, userMessage);
    } else {
      return this.handleSynchronousMessage(conversation.id, request, userMessage);
    }
  }

  /**
   * Manejar mensaje en modo síncrono (comportamiento original)
   */
  private handleSynchronousMessage(
    conversationId: string,
    request: ChatRequest,
    userMessage: Message
  ): Observable<void> {
    return new Observable(observer => {
      this.apiService.sendMessage(conversationId, request).subscribe({
        next: (response) => {
          // Mantener el mensaje temporal del usuario y agregar la respuesta del asistente
          const messages = this.messagesSubject.value;
          // Actualizar timestamp al momento de recepción de la respuesta
          response.message.created_at = new Date().toISOString();

          // Si el backend devuelve thinking_content al mismo nivel que content, moverlo a extra_metadata
          if (response.thinking_content && !response.message.extra_metadata?.thinking_content) {
            response.message.extra_metadata = {
              ...response.message.extra_metadata,
              thinking_content: response.thinking_content
            };
          }

          this.messagesSubject.next([...messages, response.message]);
          this.loadingSubject.next(false);
          this.currentProcessingConversationId = null;
          this.log('Message sent successfully (synchronous)');
          observer.next(undefined);
          observer.complete();
        },
        error: (error) => {
          console.error('[ChatService] Error sending message:', error);
          // Remover mensaje temporal en caso de error
          const messages = this.messagesSubject.value.filter(
            m => m.id !== userMessage.id
          );
          this.messagesSubject.next(messages);
          this.loadingSubject.next(false);
          this.currentProcessingConversationId = null;
          observer.error(error);
        }
      });
    });
  }

  /**
   * Manejar mensaje en modo streaming
   */
  private handleStreamingMessage(
    conversationId: string,
    request: ChatRequest,
    userMessage: Message
  ): Observable<void> {
    return new Observable(observer => {
      // Create abort controller for this streaming request
      this.currentStreamAbortController = new AbortController();

      // Crear mensaje del asistente vacío para ir llenando con el stream
      const assistantMessage: Message = {
        id: 'temp-assistant-' + Date.now(),
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
        extra_metadata: { thinking_content: '' }  // NEW: Initialize thinking content
      };
      // Agregar mensaje vacío del asistente
      const messages = this.messagesSubject.value;
      this.messagesSubject.next([...messages, assistantMessage]);

      // Iniciar streaming
      this.apiService.streamChat(conversationId, request, this.currentStreamAbortController.signal).then(stream => {
        const reader = stream.getReader();
        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Envolver finalización en zone.run
                this.zone.run(() => {
                  // Actualizar timestamp al finalizar el stream
                  assistantMessage.created_at = new Date().toISOString();

                  // Actualizar el mensaje final en la lista
                  const currentMessages = this.messagesSubject.value;
                  const idx = currentMessages.findIndex(m => m.id === assistantMessage.id);
                  if (idx > -1) {
                    currentMessages[idx] = { ...assistantMessage };
                    this.messagesSubject.next([...currentMessages]);
                  }

                  this.loadingSubject.next(false);
                  this.currentProcessingConversationId = null;
                  this.currentStreamAbortController = null;
                  console.log('[ChatService] Streaming completed');
                  observer.next(undefined);
                  observer.complete();
                });
                break;
              }

              // Envolver actualización de mensaje en zone.run
              this.zone.run(() => {
                try {
                  // Parsear el valor como JSON para manejar eventos estructurados
                  const parsed = JSON.parse(value);

                  if (parsed.type === 'thinking') {
                    // Accumulate thinking content
                    assistantMessage.extra_metadata!.thinking_content += parsed.content;
                  } else if (parsed.type === 'content') {
                    // Regular content
                    // Interpretar el chunk como un salto de línea si es " \""
                    if (parsed.chunk === " \"" || parsed.chunk === "\n") {
                      assistantMessage.content += '\n';
                    } else {
                      assistantMessage.content += parsed.chunk;
                    }
                  } else if (parsed.type === 'metadata') {
                    // Handle metadata if needed
                    console.log('Metadata received:', parsed.data);
                  } else {
                    // Backward compatibility: treat as plain content
                    assistantMessage.content += value;
                  }

                  // Actualizar el mensaje en la lista
                  const currentMessages = this.messagesSubject.value;
                  const idx = currentMessages.findIndex(m => m.id === assistantMessage.id);
                  if (idx > -1) {
                    currentMessages[idx] = { ...assistantMessage };
                    this.messagesSubject.next([...currentMessages]);
                  }
                } catch (e) {
                  // Backward compatibility: treat as plain content if not JSON
                  assistantMessage.content += value;

                  // Actualizar el mensaje en la lista
                  const currentMessages = this.messagesSubject.value;
                  const idx = currentMessages.findIndex(m => m.id === assistantMessage.id);
                  if (idx > -1) {
                    currentMessages[idx] = { ...assistantMessage };
                    this.messagesSubject.next([...currentMessages]);
                  }
                }
              });
            }
          } catch (error) {
            console.error('[ChatService] Error processing stream:', error);
            // Remover ambos mensajes temporales en caso de error
            const messages = this.messagesSubject.value.filter(
              m => m.id !== userMessage.id && m.id !== assistantMessage.id
            );
            this.messagesSubject.next(messages);
            this.loadingSubject.next(false);
            this.currentProcessingConversationId = null;
            this.currentStreamAbortController = null;
            observer.error(error);
          }
        };
        processStream();
      }).catch(error => {
        console.error('[ChatService] Error starting stream:', error);
        // Remover mensaje temporal del usuario
        const messages = this.messagesSubject.value.filter(
          m => m.id !== userMessage.id
        );
        this.messagesSubject.next(messages);
        this.loadingSubject.next(false);
        this.currentProcessingConversationId = null;
        this.currentStreamAbortController = null;
        observer.error(error);
      });
    });
  }

  /**
   * Iniciar el procesamiento de un archivo (fallback o manual)
   * @param fileId ID del archivo a procesar
   */
  processFile(fileId: string): Observable<FileAttachment> {
    return this.apiService.processFile(fileId);
  }

  /**
   * Cancelar la ejecución actual del chat
   */
  cancelCurrentChat(): Observable<void> {
    const conversationId = this.currentProcessingConversationId;

    if (!conversationId) {
      console.warn('[ChatService] No active chat to cancel');
      return new Observable<void>(observer => {
        this.loadingSubject.next(false);
        observer.next(undefined);
        observer.complete();
      });
    }

    // Cancel any ongoing streaming request
    if (this.currentStreamAbortController) {
      this.currentStreamAbortController.abort();
      this.currentStreamAbortController = null;
    }

    // Call the API to cancel the chat
    return this.apiService.cancelChat(conversationId).pipe(
      map(() => void 0),
      tap(() => {
        // Clean up temporary messages
        const currentMessages = this.messagesSubject.value;
        const cleanedMessages = currentMessages.filter(msg =>
          !msg.id.startsWith('temp-') && !msg.id.startsWith('temp-assistant-')
        );
        this.messagesSubject.next(cleanedMessages);

        // Reset state
        this.loadingSubject.next(false);
        this.currentProcessingConversationId = null;
        this.currentStreamAbortController = null;

        console.log('[ChatService] Chat cancelled:', conversationId);
      }),
      catchError((error: any) => {
        // Even if API call fails, clean up local state
        this.loadingSubject.next(false);
        this.currentProcessingConversationId = null;
        this.currentStreamAbortController = null;
        console.warn('[ChatService] Error cancelling chat, but cleaned up locally:', error);
        return new Observable<void>(observer => {
          observer.next(undefined);
          observer.complete();
        });
      })
    );
  }

  /**
   * Regenerar el último mensaje del asistente
   */
  regenerateLastMessage(): Observable<Message> {
    const conversation = this.activeConversationSubject.value;

    if (!conversation) {
      throw new Error('No active conversation');
    }

    this.loadingSubject.next(true);

    return this.apiService.regenerateLastMessage(conversation.id).pipe(
      tap(message => {
        // Reemplazar el último mensaje del asistente
        const messages = this.messagesSubject.value;
        const lastAssistantIndex = messages.findLastIndex(m => m.role === 'assistant');

        if (lastAssistantIndex > -1) {
          messages[lastAssistantIndex] = message;
          this.messagesSubject.next([...messages]);
        } else {
          // Si no hay mensaje previo, simplemente agregarlo
          this.messagesSubject.next([...messages, message]);
        }

        this.loadingSubject.next(false);
        console.log('[ChatService] Message regenerated');
      })
    );
  }

  /**
   * Exportar la conversación actual a PDF
   */
  exportConversationPdf(): Observable<Blob> {
    const conversation = this.activeConversationSubject.value;

    if (!conversation) {
      throw new Error('No active conversation');
    }

    this.loadingSubject.next(true);

    return this.apiService.exportConversationPdf(conversation.id).pipe(
      tap(() => {
        this.loadingSubject.next(false);
        console.log('[ChatService] Conversation exported to PDF');
      })
    );
  }

  /**
   * Obtener los mensajes actuales
   */
  getMessages(): Message[] {
    return this.messagesSubject.value;
  }

  /**
   * Agregar un mensaje manualmente (útil para testing o system messages)
   */
  addMessage(message: Message): void {
    const current = this.messagesSubject.value;
    this.messagesSubject.next([...current, message]);
  }

  /**
   * Limpiar todos los mensajes
   */
  clearMessages(): void {
    this.messagesSubject.next([]);
    console.log('[ChatService] Cleared messages');
  }

  // ============================================================================
  // Loading State
  // ============================================================================

  /**
   * Verificar si hay una operación en curso
   */
  isLoading(): boolean {
    return this.loadingSubject.value;
  }

  /**
   * Establecer el estado de loading manualmente
   */
  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Buscar una conversación por ID
   */
  findConversationById(id: string): ConversationListItem | undefined {
    return this.conversationsSubject.value.find(c => c.id === id);
  }

  /**
   * Obtener el número total de conversaciones
   */
  getConversationCount(): number {
    return this.conversationsSubject.value.length;
  }

  /**
   * Obtener el número total de mensajes en la conversación activa
   */
  getMessageCount(): number {
    return this.messagesSubject.value.length;
  }

  /**
   * Verificar si hay una conversación activa
   */
  hasActiveConversation(): boolean {
    return this.activeConversationSubject.value !== null;
  }

  /**
   * Obtener el último mensaje
   */
  getLastMessage(): Message | null {
    const messages = this.messagesSubject.value;
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Filtrar mensajes por rol
   */
  getMessagesByRole(role: 'user' | 'assistant' | 'system'): Message[] {
    return this.messagesSubject.value.filter(m => m.role === role);
  }

  /**
   * Reset completo del servicio
   */
  reset(): void {
    this.conversationsSubject.next([]);
    this.activeConversationSubject.next(null);
    this.messagesSubject.next([]);
    this.loadingSubject.next(false);
    console.log('[ChatService] Service reset');
  }
}

// Extensión para findLastIndex (polyfill si es necesario)
declare global {
  interface Array<T> {
    findLastIndex(predicate: (value: T, index: number, obj: T[]) => boolean): number;
  }
}

if (!Array.prototype.findLastIndex) {
  Array.prototype.findLastIndex = function <T>(
    this: T[],
    predicate: (value: T, index: number, obj: T[]) => boolean
  ): number {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate(this[i], i, this)) {
        return i;
      }
    }
    return -1;
  };
}