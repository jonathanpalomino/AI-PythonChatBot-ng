import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Project, UploadingFile } from '../../models/models';
import { HttpEventType } from '@angular/common/http';

@Component({
    selector: 'app-chat-input',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './chat-input.html',
    styleUrls: ['./chat-input.scss']
})
export class ChatInputComponent implements OnChanges {
    @Input() isLoading: boolean = false;
    @Input() currentProjectId: string | null = null;
    @Input() currentConversationId: string | null = null;
    @Input() uploadedFileIds: string[] = [];
    @Input() hasTemporaryCollection: boolean = false;

    @Output() onSendMessage = new EventEmitter<{ message: string, fileIds: string[], fileInfo: any[] }>();
    @Output() onCancelChat = new EventEmitter<void>();
    @Output() onFileUploadStart = new EventEmitter<FileList>();
    @Output() onHasTemporaryCollectionChange = new EventEmitter<boolean>();
    @Output() onUploadedFileIdsChange = new EventEmitter<string[]>();

    @ViewChild('messageInput') private messageInput!: ElementRef;
    @ViewChild('fileInput') private fileInput!: ElementRef;

    messageText: string = '';
    uploadedFiles: UploadingFile[] = [];

    constructor(private apiService: ApiService) { }

    get hasUploadingFiles(): boolean {
        return this.uploadedFiles.some(f => f.isUploading);
    }

    ngOnChanges(changes: SimpleChanges): void {
        // Sincronizar archivos si se limpian desde fuera
        if (changes['uploadedFileIds'] && !changes['uploadedFileIds'].firstChange) {
            if (this.uploadedFileIds.length === 0) {
                this.uploadedFiles = [];
            }
        }
    }

    onFileSelected(event: any): void {
        const files: FileList = event.target.files;
        if (!files || files.length === 0) return;

        this.onFileUploadStart.emit(files);

        Array.from(files).forEach(file => {
            const uploadingFile: UploadingFile = Object.assign(file, {
                uploadProgress: 0,
                isUploading: true,
                uploadError: false
            });

            this.uploadedFiles.push(uploadingFile);

            // Emitir cambio de colección temporal (como en app.ts)
            if (!this.hasTemporaryCollection) {
                this.hasTemporaryCollection = true;
                this.onHasTemporaryCollectionChange.emit(true);
            }

            this.apiService.uploadFile(file, this.currentConversationId || undefined, this.currentProjectId || undefined).subscribe({
                next: (event: any) => {
                    if (event.type === HttpEventType.UploadProgress) {
                        if (event.total) {
                            const progress = Math.round(100 * event.loaded / event.total);
                            uploadingFile.uploadProgress = progress;
                        }
                    } else if (event.type === HttpEventType.Response) {
                        uploadingFile.uploadProgress = 100;
                        uploadingFile.isUploading = false;
                        const response = event.body;

                        // Check if file is still in the list (it might have been cancelled)
                        if (!this.uploadedFiles.includes(uploadingFile)) {
                            if (response && response.id) {
                                // Clean up the orphan file
                                this.apiService.deleteFile(response.id).subscribe();
                            }
                            return;
                        }

                        if (response && response.id) {
                            uploadingFile.id = response.id;
                            this.uploadedFileIds.push(response.id);
                            this.onUploadedFileIdsChange.emit([...this.uploadedFileIds]);
                        }
                    }
                },
                error: (err) => {
                    console.error('Upload failed:', err);
                    // Only update if still in list
                    if (this.uploadedFiles.includes(uploadingFile)) {
                        uploadingFile.isUploading = false;
                        uploadingFile.uploadError = true;
                        uploadingFile.uploadProgress = 0;
                    }
                }
            });
        });

        // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
        if (this.fileInput) {
            this.fileInput.nativeElement.value = '';
        }
    }

    removeFile(file: UploadingFile): void {
        const index = this.uploadedFiles.indexOf(file);
        if (index > -1) {
            this.uploadedFiles.splice(index, 1);

            // Use file.id directly if it exists
            if (file.id) {
                const idIndex = this.uploadedFileIds.indexOf(file.id);
                if (idIndex > -1) {
                    this.uploadedFileIds.splice(idIndex, 1);
                    this.onUploadedFileIdsChange.emit([...this.uploadedFileIds]);
                }

                // Eliminar del servidor
                this.apiService.deleteFile(file.id).subscribe({
                    error: (err) => console.error('Error deleting file from server:', err)
                });
            }

            // Actualizar estado de colección temporal
            if (this.uploadedFileIds.length === 0 && this.uploadedFiles.length === 0) {
                this.hasTemporaryCollection = false;
                this.onHasTemporaryCollectionChange.emit(false);
            }
        }
    }

    onEnterPress(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    sendMessage(): void {
        if ((!this.messageText.trim() && this.uploadedFileIds.length === 0) || this.hasUploadingFiles || this.isLoading) {
            return;
        }

        const fileInfo = this.uploadedFiles.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type
        }));

        this.onSendMessage.emit({
            message: this.messageText,
            fileIds: [...this.uploadedFileIds],
            fileInfo
        });

        // Limpiar estado local
        this.messageText = '';
        this.uploadedFiles = [];
        this.uploadedFileIds = [];
        this.hasTemporaryCollection = false;
        // La limpieza de colecciones temporales se maneja vía eventos o vía el reset de uploadedFileIds
    }

    cancelChat(): void {
        this.onCancelChat.emit();
    }

    focus(): void {
        if (this.messageInput) {
            this.messageInput.nativeElement.focus();
        }
    }
}
