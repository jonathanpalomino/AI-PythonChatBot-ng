// src/app/components/prompt-manager/prompt-manager.ts
import { Component, OnInit, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { PromptTemplate } from '../../models/models';
import { PromptFormModal } from '../prompt-form-modal/prompt-form-modal';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-prompt-manager',
    standalone: true,
    imports: [CommonModule, FormsModule, PromptFormModal],
    templateUrl: './prompt-manager.html',
    styleUrls: ['./prompt-manager.scss']
})
export class PromptManager implements OnInit, OnDestroy {
    prompts: PromptTemplate[] = [];
    filteredPrompts: PromptTemplate[] = [];
    categories: string[] = [];
    isLoading = false;
    error: string | null = null;

    // Filters
    selectedCategory: string | null = null;
    selectedVisibility: string | null = null;

    // Modal state
    showFormModal = false;
    editingPrompt: PromptTemplate | null = null;

    // Evento para notificar cambios al componente padre
    @Output() promptsChanged = new EventEmitter<void>();
    private destroy$ = new Subject<void>();

    constructor(private apiService: ApiService) { }

    ngOnInit(): void {
        this.loadCategories();
        this.loadPrompts();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadCategories(): void {
        this.apiService.getPromptCategories()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (categories) => {
                    this.categories = categories;
                },
                error: (err) => {
                    console.error('[PromptManager] Error loading categories:', err);
                    this.showError('No se pudieron cargar las categorías');
                }
            });
    }

    loadPrompts(): void {
        this.isLoading = true;
        this.error = null;

        this.apiService.getPromptTemplates(
            this.selectedCategory || undefined,
            this.selectedVisibility || undefined
        )
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (response) => {
                    this.prompts = response.items;
                    this.filteredPrompts = response.items;
                    this.isLoading = false;
                    console.log(`[PromptManager] Loaded ${response.items.length} prompts`);
                },
                error: (err) => {
                    console.error('[PromptManager] Error loading prompts:', err);
                    this.error = 'No se pudieron cargar las plantillas. Por favor, intenta de nuevo.';
                    this.isLoading = false;
                    this.showError(this.error);
                }
            });
    }

    filterByCategory(category: string | null): void {
        this.selectedCategory = category;
        this.loadPrompts();
    }

    filterByVisibility(visibility: string | null): void {
        this.selectedVisibility = visibility;
        this.loadPrompts();
    }

    openCreateModal(): void {
        this.editingPrompt = null;
        this.showFormModal = true;
    }

    openEditModal(prompt: PromptTemplate): void {
        this.editingPrompt = prompt;
        this.showFormModal = true;
    }

    closeFormModal(): void {
        this.showFormModal = false;
        this.editingPrompt = null;
    }

    handleSave(promptData: Partial<PromptTemplate>): void {
        if (this.editingPrompt) {
            // Update existing
            this.apiService.updatePromptTemplate(this.editingPrompt.id, promptData as any)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (updatedPrompt) => {
                        console.log('[PromptManager] Prompt updated successfully:', updatedPrompt.id);
                        this.showSuccess(`Plantilla "${updatedPrompt.name}" actualizada correctamente`);
                        this.loadPrompts();
                        this.closeFormModal();
                        // Notificar al componente padre que los prompts cambiaron
                        this.promptsChanged.emit();
                    },
                    error: (err) => {
                        console.error('[PromptManager] Error updating prompt:', err);
                        this.showError('Error al actualizar la plantilla. Por favor, intenta de nuevo.');
                    }
                });
        } else {
            // Create new
            this.apiService.createPromptTemplate(promptData as any)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (newPrompt) => {
                        console.log('[PromptManager] Prompt created successfully:', newPrompt.id);
                        this.showSuccess(`Plantilla "${newPrompt.name}" creada correctamente`);
                        this.loadPrompts();
                        this.closeFormModal();
                        // Notificar al componente padre que los prompts cambiaron
                        this.promptsChanged.emit();
                    },
                    error: (err) => {
                        console.error('[PromptManager] Error creating prompt:', err);
                        this.showError('Error al crear la plantilla. Por favor, intenta de nuevo.');
                    }
                });
        }
    }

    deletePrompt(id: string, event: Event): void {
        event.stopPropagation();

        const prompt = this.prompts.find(p => p.id === id);
        const promptName = prompt?.name || 'esta plantilla';

        if (confirm(`¿Estás seguro de eliminar la plantilla "${promptName}"? Esta acción no se puede deshacer.`)) {
            this.apiService.deletePromptTemplate(id)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: () => {
                        console.log('[PromptManager] Prompt deleted successfully:', id);
                        this.showSuccess(`Plantilla "${promptName}" eliminada correctamente`);
                        this.loadPrompts();
                        // Notificar al componente padre que los prompts cambiaron
                        this.promptsChanged.emit();
                    },
                    error: (err) => {
                        console.error('[PromptManager] Error deleting prompt:', err);
                        this.showError('Error al eliminar la plantilla. Por favor, intenta de nuevo.');
                    }
                });
        }
    }

    getVisibilityBadgeClass(visibility: string): string {
        switch (visibility) {
            case 'public': return 'badge-public';
            case 'private': return 'badge-private';
            case 'shared': return 'badge-shared';
            default: return '';
        }
    }

    // Utility methods for user feedback
    private showSuccess(message: string): void {
        console.log('[PromptManager] SUCCESS:', message);
    }

    private showError(message: string): void {
        console.error('[PromptManager] ERROR:', message);
    }
}
