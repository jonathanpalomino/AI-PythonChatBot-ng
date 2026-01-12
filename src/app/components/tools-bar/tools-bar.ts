import { Component, Input, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conversation, QdrantCollection, ToolInstance } from '../../models/models';

@Component({
    selector: 'app-tools-bar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './tools-bar.html',
    styleUrls: ['./tools-bar.scss']
})
export class ToolsBarComponent {
    @Input() activeConversation: Conversation | null = null;
    @Input() availableCollections: QdrantCollection[] = [];
    @Input() selectedCollectionId: string | null = null;
    @Input() hasTemporaryCollection: boolean = false;
    @Input() availableTools: ToolInstance[] = [];
    @Input() messagesLength: number = 0;
    @Input() isLoading: boolean = false;
    @Input() uploadedFileIds: string[] = [];

    @Output() onToolToggle = new EventEmitter<string>();
    @Output() onCollectionSelect = new EventEmitter<string | null>();
    @Output() onRegenerate = new EventEmitter<void>();

    showCollectionsDropdown: boolean = false;

    private readonly toolMetadata: Record<string, { icon: string, label: string }> = {
        'rag_search': { icon: 'icon-search', label: 'RAG' },
        'code_analyzer': { icon: 'icon-code', label: 'Code' },
        'memory': { icon: 'icon-brain', label: 'Memory' },
        'web_search': { icon: 'icon-globe', label: 'Web' }
    };

    constructor(private elementRef: ElementRef) { }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.elementRef.nativeElement.contains(event.target)) {
            this.showCollectionsDropdown = false;
        }
    }

    isToolActive(toolName: string): boolean {
        if (!this.activeConversation) return false;
        return this.activeConversation.settings.enabled_tools.includes(toolName);
    }

    toggleTool(toolName: string): void {
        this.onToolToggle.emit(toolName);
    }

    getNonRagTools(): ToolInstance[] {
        return this.availableTools.filter(t => t.name !== 'rag_search');
    }

    getToolIcon(name: string): string {
        return this.toolMetadata[name]?.icon || 'icon-tool';
    }

    getToolLabel(name: string): string {
        return this.toolMetadata[name]?.label || name;
    }

    getCollectionBadgeText(): string {
        if (this.hasTemporaryCollection) return 'Temporal';
        const found = this.availableCollections.find(c => c.id === this.selectedCollectionId);
        return found ? found.display_name : 'Seleccionar...';
    }

    toggleCollectionsDropdown(event: Event): void {
        event.stopPropagation();
        this.showCollectionsDropdown = !this.showCollectionsDropdown;
    }

    selectCollection(id: string | null): void {
        this.onCollectionSelect.emit(id);
        this.showCollectionsDropdown = false;
    }

    regenerate(): void {
        this.onRegenerate.emit();
    }
}
