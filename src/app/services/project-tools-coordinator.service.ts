// src/app/services/project-tools-coordinator.service.ts
import { Injectable } from '@angular/core';
import { ProjectService } from './project.service';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { ListResponse, FileAttachment } from '../models/models';

@Injectable({
    providedIn: 'root'
})
export class ProjectToolsCoordinatorService {
    // Cache for project file status with shared cache
    private projectFilesCache = new Map<string, boolean>();

    // Observable for tool state changes
    private toolStateSubject = new BehaviorSubject<ToolState>(this.getInitialToolState());
    toolState$ = this.toolStateSubject.asObservable();

    // Track temporary file attachments (for RAG without project)
    private temporaryFileAttachments: string[] = [];

    constructor(private projectService: ProjectService) {
        this.log('ProjectToolsCoordinatorService initialized');
    }

    private log(message: string, ...optionalParams: any[]): void {
        console.log(`[ProjectToolsCoordinator] ${message}`, ...optionalParams);
    }

    private getInitialToolState(): ToolState {
        return {
            ragEnabled: false,
            ragStatus: 'disabled',
            ragMessage: 'RAG is disabled',
            availableTools: [],
            recommendedTools: [],
            hasProjectFiles: false,
            hasTemporaryFiles: false,
            projectId: null
        };
    }

    /**
     * Check if a project has files and update the tool state accordingly
     * @param projectId The project ID to check
     */
    checkProjectFiles(projectId: string | null): Observable<ToolState> {
        // Clear previous project data if no project
        if (!projectId) {
            const newState = this.getCurrentState();
            newState.projectId = null;
            newState.hasProjectFiles = false;
            newState.ragStatus = 'disabled';
            newState.ragMessage = 'No project selected';
            this.updateToolState(newState);
            return of(newState);
        }

        // Check cache first
        if (this.projectFilesCache.has(projectId)) {
            const hasFiles = this.projectFilesCache.get(projectId)!;
            const newState = this.getCurrentState();
            newState.projectId = projectId;
            newState.hasProjectFiles = hasFiles;
            this.updateRagState(newState);
            return of(newState);
        }

        // Fetch from API
        return this.projectService.getProjectFiles(projectId, 0, 1).pipe(
            map(res => {
                const hasFiles = res.items && res.items.length > 0;
                this.projectFilesCache.set(projectId, hasFiles);

                const newState = this.getCurrentState();
                newState.projectId = projectId;
                newState.hasProjectFiles = hasFiles;
                this.updateRagState(newState);

                return newState;
            }),
            catchError(err => {
                console.warn('Error checking project files for RAG auto-select', err);
                this.projectFilesCache.set(projectId!, false);

                const newState = this.getCurrentState();
                newState.projectId = projectId;
                newState.hasProjectFiles = false;
                newState.ragStatus = 'error';
                newState.ragMessage = 'Error checking project files';
                this.updateToolState(newState);

                return of(newState);
            })
        );
    }

    /**
     * Add temporary file attachments for RAG without project
     * @param fileIds Array of file IDs to add
     */
    addTemporaryFileAttachments(fileIds: string[]): void {
        this.temporaryFileAttachments = [...new Set([...this.temporaryFileAttachments, ...fileIds])];
        const newState = this.getCurrentState();
        newState.hasTemporaryFiles = this.temporaryFileAttachments.length > 0;
        this.updateRagState(newState);
    }

    /**
     * Remove temporary file attachments
     * @param fileIds Array of file IDs to remove
     */
    removeTemporaryFileAttachments(fileIds: string[]): void {
        this.temporaryFileAttachments = this.temporaryFileAttachments.filter(
            id => !fileIds.includes(id)
        );
        const newState = this.getCurrentState();
        newState.hasTemporaryFiles = this.temporaryFileAttachments.length > 0;
        this.updateRagState(newState);
    }

    /**
     * Clear all temporary file attachments
     */
    clearTemporaryFileAttachments(): void {
        this.temporaryFileAttachments = [];
        const newState = this.getCurrentState();
        newState.hasTemporaryFiles = false;
        this.updateRagState(newState);
    }

    /**
     * Get current tool state
     */
    getCurrentState(): ToolState {
        return this.toolStateSubject.value;
    }

    /**
     * Determine recommended tools based on current context
     * @param currentSelection Currently selected tools
     */
    getRecommendedTools(currentSelection: string[]): string[] {
        const state = this.getCurrentState();
        let tools = [...currentSelection];

        // RAG logic based on current state
        const shouldEnableRag = this.shouldEnableRag(state);

        if (shouldEnableRag) {
            if (!tools.includes('rag_search')) {
                tools.push('rag_search');
            }
        } else {
            // Only remove RAG if it was auto-added, not if manually added
            // We'll keep manual selections but warn about the state
            tools = tools.filter(t => t !== 'rag_search');
        }

        return tools;
    }

    /**
     * Check if RAG should be enabled based on current state
     */
    private shouldEnableRag(state: ToolState): boolean {
        // Enable RAG if we have project files OR temporary files
        return state.hasProjectFiles || state.hasTemporaryFiles;
    }

    /**
     * Update the RAG state based on current conditions
     */
    private updateRagState(state: ToolState): void {
        const hasFiles = state.hasProjectFiles || state.hasTemporaryFiles;

        if (hasFiles) {
            state.ragStatus = 'enabled';
            state.ragMessage = state.hasProjectFiles
                ? 'RAG enabled with project files'
                : 'RAG enabled with temporary files';
        } else if (state.projectId) {
            // Project selected but no files
            state.ragStatus = 'disabled_no_files';
            state.ragMessage = 'Project selected but no files available for RAG';
        } else {
            // No project selected
            state.ragStatus = 'disabled';
            state.ragMessage = 'No project selected';
        }

        this.updateToolState(state);
    }

    /**
     * Update the tool state and notify subscribers
     */
    private updateToolState(state: ToolState): void {
        this.toolStateSubject.next(state);
    }

    /**
     * Validate tool configurations
     * @param tools Tools to validate
     * @param projectId Current project ID
     */
    validateToolConfigurations(tools: string[], projectId: string | null): ToolValidationResult {
        const state = this.getCurrentState();
        const result: ToolValidationResult = {
            isValid: true,
            warnings: [],
            errors: []
        };

        // Validate RAG tool specifically
        if (tools.includes('rag_search')) {
            const hasFiles = state.hasProjectFiles || state.hasTemporaryFiles;

            if (!hasFiles) {
                result.warnings.push('RAG is enabled but has no file source - it will not function properly');
                result.isValid = false; // RAG won't work without files
            }
        }

        // Add more tool validations here as needed

        return result;
    }
}

/**
 * Tool state interface
 */
export interface ToolState {
    ragEnabled: boolean;
    ragStatus: 'enabled' | 'disabled' | 'disabled_no_files' | 'error';
    ragMessage: string;
    availableTools: string[];
    recommendedTools: string[];
    hasProjectFiles: boolean;
    hasTemporaryFiles: boolean;
    projectId: string | null;
}

/**
 * Tool validation result
 */
export interface ToolValidationResult {
    isValid: boolean;
    warnings: string[];
    errors: string[];
}