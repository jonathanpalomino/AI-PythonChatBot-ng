import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { 
  QdrantCollection, 
  QdrantCollectionCreate, 
  FolderIngestRequest, 
  IngestionStats, 
  ModelInfo 
} from '../../models/models';

@Component({
  selector: 'app-files-collections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './files-collections.html',
  styleUrls: ['./files-collections.scss']
})
export class FilesCollectionsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  collections: QdrantCollection[] = [];
  selectedCollection: QdrantCollection | null = null;
  isLoading = false;
  isIngesting = false;
  ingestionStats: IngestionStats | null = null;

  // Collection Creation
  showCreateModal = false;
  newCollection: QdrantCollectionCreate = {
    name: '',
    display_name: '',
    description: '',
    category: 'general',
    visibility: 'public'
  };

  // Ingestion State
  ingestMode: 'folder' | 'upload' = 'folder';
  folderPath = '';
  recursive = true;
  selectedEmbeddingModel = '';
  embeddingModels: ModelInfo[] = [];
  
  // Upload State
  selectedFiles: File[] = [];
  isDragging = false;

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadCollections();
    this.loadEmbeddingModels();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCollections(): void {
    this.isLoading = true;
    this.apiService.getCollections()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
      )
      .subscribe({
        next: (res) => this.collections = res.items,
        error: (err) => console.error('Error loading collections', err)
      });
  }

  loadEmbeddingModels(): void {
    this.apiService.getProviders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          // Extract embedding models from all providers
          this.embeddingModels = [];
          Object.values(res.models).forEach(models => {
            const embedModels = models.filter(m => m.model_type === 'embedding');
            this.embeddingModels.push(...embedModels);
          });
          if (this.embeddingModels.length > 0) {
            const firstModel = this.embeddingModels[0];
            this.selectedEmbeddingModel = firstModel.id || firstModel.name;
          }
        }
      });
  }

  selectCollection(col: QdrantCollection): void {
    this.selectedCollection = col;
    this.ingestionStats = null;
    console.log('Selected collection:', col.id || col.name);
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.newCollection = {
      name: '',
      display_name: '',
      description: '',
      category: 'general',
      visibility: 'public'
    };
  }

  createCollection(): void {
    if (!this.newCollection.name || !this.newCollection.display_name) return;
    
    this.apiService.createCollection(this.newCollection)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (col) => {
          this.collections.unshift(col);
          this.selectCollection(col);
          this.showCreateModal = false;
        },
        error: (err) => alert('Error creating collection: ' + (err.error?.detail || err.message))
      });
  }

  deleteCollection(col: QdrantCollection): void {
    if (!confirm(`Delete collection "${col.display_name}"?`)) return;
    
    const colId = col.id || col.name;
    console.log('[FilesCollections] Deleting collection with identifier:', colId);
    
    this.apiService.deleteCollection(colId, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.collections = this.collections.filter(c => c.name !== col.name);
          if (this.selectedCollection?.name === col.name) {
            this.selectedCollection = null;
          }
        },
        error: (err) => {
          console.error('Error deleting collection', err);
          alert('Error deleting collection: ' + (err.error?.detail || err.message));
        }
      });
  }

  // Folder Ingestion
  ingestFolder(): void {
    if (!this.selectedCollection || !this.folderPath) return;

    this.isIngesting = true;
    this.ingestionStats = null;

    const request: FolderIngestRequest = {
      folder_path: this.folderPath,
      recursive: this.recursive,
      embedding_model: this.selectedEmbeddingModel
    };

    const colId = this.selectedCollection.id || this.selectedCollection.name;
    console.log('[FilesCollections] Ingesting folder into:', colId, 'Model:', this.selectedEmbeddingModel);

    if (!this.selectedCollection.id) {
       console.warn('[FilesCollections] Ingesting into unregistered collection using name:', colId);
    }
    
    this.apiService.ingestFolder(colId, request)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isIngesting = false)
      )
      .subscribe({
        next: (stats) => this.ingestionStats = stats,
        error: (err) => {
          console.error('[FilesCollections] Ingestion error', err);
          alert('Ingestion error: ' + (err.error?.detail || err.message));
        }
      });
  }

  // File Upload Ingestion
  onFileSelected(event: any): void {
    const files = event.target.files;
    if (files) {
      this.selectedFiles = Array.from(files);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const files = event.dataTransfer?.files;
    if (files) {
      this.selectedFiles = Array.from(files);
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  ingestUpload(): void {
    if (!this.selectedCollection || this.selectedFiles.length === 0) return;

    this.isIngesting = true;
    this.ingestionStats = null;

    const colId = this.selectedCollection.id || this.selectedCollection.name;
    console.log('[FilesCollections] Uploading files into:', colId, 'Model:', this.selectedEmbeddingModel);

    if (!this.selectedCollection.id) {
       console.warn('[FilesCollections] Uploading to unregistered collection using name:', colId);
    }
    
    this.apiService.ingestUpload(colId, this.selectedFiles, this.selectedEmbeddingModel)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isIngesting = false)
      )
      .subscribe({
        next: (stats) => {
          this.ingestionStats = stats;
          this.selectedFiles = [];
          this.loadCollections(); // Refresh vector count
        },
        error: (err) => {
          console.error('[FilesCollections] Upload ingestion error', err);
          alert('Upload ingestion error: ' + (err.error?.detail || err.message));
        }
      });
  }
}
