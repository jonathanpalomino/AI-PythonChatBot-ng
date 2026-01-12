// src/app/components/file-upload/file-upload.ts
import { Component, EventEmitter, Input, Output, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { FileUtils } from '../../utils/file-utils';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FileIconPipe } from '../../pipes/file-icon.pipe';

interface UploadFile {
  file: File;
  id: string;
  uploadedId?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
  preview?: string;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-upload.html',
  styleUrls: ['./file-upload.scss']
})
export class FileUpload implements OnDestroy {
  @Input() conversationId?: string;
  @Input() projectId?: string;
  @Input() maxFiles = 5;
  @Input() maxFileSize = 10 * 1024 * 1024; // 10MB
  @Output() filesUploaded = new EventEmitter<string[]>();
  @Output() uploadStateChanged = new EventEmitter<boolean>();

  uploadFiles: UploadFile[] = [];
  isDragging = false;
  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService) { }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = ''; // Reset input
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    if (event.dataTransfer?.files) {
      this.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  addFiles(files: File[]): void {
    // Validar límite de archivos
    const remainingSlots = this.maxFiles - this.uploadFiles.length;
    if (remainingSlots <= 0) {
      alert(`Máximo ${this.maxFiles} archivos permitidos`);
      return;
    }

    const filesToAdd = files.slice(0, remainingSlots);

    for (const file of filesToAdd) {
      // Validar tamaño
      if (file.size > this.maxFileSize) {
        alert(`${file.name} excede el tamaño máximo de ${this.maxFileSize / 1024 / 1024}MB`);
        continue;
      }

      const uploadFile: UploadFile = {
        file,
        id: `temp-${Date.now()}-${Math.random()}`,
        progress: 0,
        status: 'pending'
      };

      // Generar preview para imágenes
      if (file.type.startsWith('image/')) {
        this.generatePreview(uploadFile);
      }

      this.uploadFiles.push(uploadFile);
    }

    // Iniciar upload automático
    this.startUploads();
  }

  generatePreview(uploadFile: UploadFile): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadFile.preview = e.target?.result as string;
    };
    reader.readAsDataURL(uploadFile.file);
  }

  startUploads(): void {
    const pendingFiles = this.uploadFiles.filter(f => f.status === 'pending');

    pendingFiles.forEach(uploadFile => {
      this.uploadFile(uploadFile);
    });

    this.uploadStateChanged.emit(true);
  }

  uploadFile(uploadFile: UploadFile): void {
    uploadFile.status = 'uploading';
    uploadFile.progress = 0;

    this.apiService.uploadFile(uploadFile.file, this.conversationId, this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          if (event.type === 1) { // HttpEventType.UploadProgress
            const progress = Math.round((event.loaded * 100) / event.total);
            uploadFile.progress = progress;
          } else if (event.type === 4) { // HttpEventType.Response
            uploadFile.progress = 100;
            uploadFile.status = 'completed';
            uploadFile.uploadedId = event.body?.id;

            this.checkAllCompleted();
          }
        },
        error: (error) => {
          uploadFile.status = 'error';
          uploadFile.errorMessage = error.message || 'Error al subir archivo';
          uploadFile.progress = 0;

          this.checkAllCompleted();
        }
      });
  }

  checkAllCompleted(): void {
    const allDone = this.uploadFiles.every(f =>
      f.status === 'completed' || f.status === 'error'
    );

    if (allDone) {
      this.uploadStateChanged.emit(false);

      const completedIds = this.uploadFiles
        .filter(f => f.status === 'completed' && f.uploadedId)
        .map(f => f.uploadedId!);

      if (completedIds.length > 0) {
        this.filesUploaded.emit(completedIds);
      }
    }
  }

  removeFile(uploadFile: UploadFile): void {
    const index = this.uploadFiles.indexOf(uploadFile);
    if (index > -1) {
      this.uploadFiles.splice(index, 1);

      // Si tenía ID (ya subido), eliminar del servidor
      if (uploadFile.uploadedId) {
        this.apiService.deleteFile(uploadFile.uploadedId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            error: (error) => console.error('Error deleting file:', error)
          });
      }
    }
  }

  retryUpload(uploadFile: UploadFile): void {
    uploadFile.status = 'pending';
    uploadFile.progress = 0;
    uploadFile.errorMessage = undefined;
    this.uploadFile(uploadFile);
  }

  clearAll(): void {
    // Eliminar archivos completados del servidor
    const completedFiles = this.uploadFiles.filter(f => f.uploadedId);
    completedFiles.forEach(f => {
      if (f.uploadedId) {
        this.apiService.deleteFile(f.uploadedId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            error: (error) => console.error('Error deleting file:', error)
          });
      }
    });

    this.uploadFiles = [];
    this.uploadStateChanged.emit(false);
  }

  // Method removed as it's now handled by FileIconPipe

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  get completedFiles(): UploadFile[] {
    return this.uploadFiles.filter(f => f.status === 'completed');
  }

  get hasErrors(): boolean {
    return this.uploadFiles.some(f => f.status === 'error');
  }

  get isUploading(): boolean {
    return this.uploadFiles.some(f => f.status === 'uploading');
  }
}