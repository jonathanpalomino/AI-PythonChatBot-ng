import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Project, ConversationListItem, FileAttachment, UploadingFile } from '../../models/models';
import { ProjectService } from '../../services/project.service';
import { ChatService } from '../../services/chat.service';
import { ApiService } from '../../services/api.service';
import { FileUtils } from '../../utils/file-utils';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FileIconPipe } from '../../pipes/file-icon.pipe';

@Component({
    selector: 'app-project-details',
    standalone: true,
    imports: [CommonModule, FormsModule, FileIconPipe],
    templateUrl: './project-details.html',
    styleUrls: ['./project-details.scss']
})
export class ProjectDetailsComponent implements OnInit, OnChanges, OnDestroy {
    @Input() project!: Project;
    @Output() close = new EventEmitter<void>();
    @Output() openConversation = new EventEmitter<string>();
    @Output() createNewConversation = new EventEmitter<void>();

    activeTab: 'conversations' | 'files' = 'conversations';
    conversations: ConversationListItem[] = [];
    files: FileAttachment[] = [];
    isLoading = false;
    isUploading = false;
    uploadingFiles: UploadingFile[] = [];
    private destroy$ = new Subject<void>();

    constructor(
        private projectService: ProjectService,
        private chatService: ChatService,
        private apiService: ApiService,
        private router: Router
    ) { }

    ngOnInit() {
        if (this.project) {
            this.loadData();
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['project'] && !changes['project'].firstChange) {
            this.loadData();
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadData() {
        this.loadConversations();
        this.loadFiles();
    }

    switchTab(tab: 'conversations' | 'files') {
        this.activeTab = tab;
    }

    loadConversations() {
        this.isLoading = true;
        this.projectService.getProjectConversations(this.project.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    this.conversations = response.items;
                    this.isLoading = false;
                },
                error: (err) => {
                    console.error('Error loading conversations', err);
                    this.isLoading = false;
                }
            });
    }

    loadFiles() {
        this.isLoading = true;
        this.projectService.getProjectFiles(this.project.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    this.files = response.items;
                    this.isLoading = false;
                },
                error: (err) => {
                    console.error('Error loading files', err);
                    this.isLoading = false;
                }
            });
    }

    onNewConversation() {
        this.createNewConversation.emit();
    }

    onOpenConversation(id: string) {
        this.openConversation.emit(id);
    }

    onDeleteConversation(event: Event, conversation: ConversationListItem) {
        event.stopPropagation();
        if (confirm(`¿Estás seguro de eliminar la conversación "${conversation.title}"?`)) {
            this.chatService.deleteConversation(conversation.id)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        this.conversations = this.conversations.filter(c => c.id !== conversation.id);
                    },
                    error: (err) => console.error('Error deleting conversation', err)
                });
        }
    }

    // Method removed as it's now handled by FileIconPipe

    onFileUpload(event: any) {
        const files = event.target.files;
        if (files && files.length > 0) {
            const file: UploadingFile = files[0];

            // Initialize state
            file.isUploading = true;
            file.isProcessing = false;
            file.status = 'uploading';
            file.uploadProgress = 0;
            file.processingProgress = 0;
            file.uploadError = false;

            this.uploadingFiles.push(file);

            this.projectService.uploadProjectFile(this.project.id, file)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (event: any) => {
                        if (event.type === 1) { // HttpEventType.UploadProgress
                            if (event.total) {
                                file.uploadProgress = Math.round(100 * event.loaded / event.total);
                            }
                        } else if (event.type === 4) { // HttpEventType.Response
                            // Upload complete, now start processing phase
                            file.uploadProgress = 100;
                            file.isUploading = false;
                            file.isProcessing = true;
                            file.status = 'processing';

                            // Get the ID from response to poll progress
                            const responseBody = event.body;
                            if (responseBody && responseBody.id) {
                                file.id = responseBody.id;
                                this.pollProcessingProgress(file);
                            } else {
                                // Fallback if no ID returned (shouldn't happen with correct API)
                                this.finishfileUpload(file);
                            }
                        }
                    },
                    error: (err) => {
                        console.error('Error uploading file', err);
                        file.isUploading = false;
                        file.isProcessing = false;
                        file.status = 'error';
                        file.uploadError = true;
                        file.errorMessage = err.message || 'Error en subida';
                    }
                });
        }
        // Clear input
        event.target.value = '';
    }

    pollProcessingProgress(file: UploadingFile) {
        if (!file.id) return;

        const pollInterval = setInterval(() => {
            this.apiService.getUploadProgress(file.id!)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (res) => {
                        if (res) {
                            file.processingProgress = res.processing_progress || 0;
                            file.status = res.status;

                            if (res.status === 'completed') {
                                clearInterval(pollInterval);
                                this.finishfileUpload(file);
                            } else if (res.status === 'error') {
                                clearInterval(pollInterval);
                                file.isProcessing = false;
                                file.status = 'error';
                                file.uploadError = true;
                                file.errorMessage = 'Error en procesamiento';
                            }
                        }
                    },
                    error: (err) => {
                        console.error('Error polling progress', err);
                        // Don't stop immediately on one error, maybe transient
                    }
                });
        }, 1000); // Poll every 1 second
    }

    finishfileUpload(file: UploadingFile) {
        // Remove from uploading list
        const index = this.uploadingFiles.indexOf(file);
        if (index > -1) {
            this.uploadingFiles.splice(index, 1);
        }
        // Refresh main list
        this.loadFiles();
    }

    onDeleteFile(event: Event, file: FileAttachment) {
        event.stopPropagation(); // Prevent row click
        if (confirm(`¿Eliminar archivo "${file.file_name}"?\nEsta acción eliminará también los vectores asociados.`)) {
            this.apiService.deleteFile(file.id)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        this.files = this.files.filter(f => f.id !== file.id);
                    },
                    error: (err) => console.error('Error deleting file', err)
                });
        }
    }

    onDeleteProject() {
        if (confirm(`ADVERTENCIA: ¿Estás seguro de ELIMINAR el proyecto "${this.project.name}"?\n\nEsta acción es IRREVERSIBLE y eliminará:\n- Todas las conversaciones\n- Todos los archivos\n- Toda la BASE DE CONOCIMIENTO vectorial (Qdrant) asociada.`)) {
            this.projectService.deleteProject(this.project.id)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        this.close.emit(); // Close details
                        // Assuming parent component refreshes list or we redirect
                        window.location.reload(); // Simple reload to refresh state for now, or use output to notify parent
                    },
                    error: (err) => {
                        console.error('Error deleting project', err);
                        alert('Error al eliminar proyecto: ' + err.message);
                    }
                });
        }
    }

    getAvatarIcon(role: string): string {
        return 'icon-message-square';
    }
}
