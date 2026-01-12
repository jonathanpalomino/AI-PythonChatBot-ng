import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import {
    Project,
    ProjectCreate,
    ProjectUpdate,
    ListResponse,
    ConversationListItem,
    FileAttachment
} from '../models/models';

import { BaseService } from './base.service';

@Injectable({
    providedIn: 'root'
})
export class ProjectService extends BaseService {
    private readonly baseUrl = `${environment.apiBaseUrl}${environment.apiUrl}/projects`;

    constructor(private http: HttpClient) {
        super('ProjectService');
        this.log('initialized');
    }

    // ============================================================================
    // Project CRUD
    // ============================================================================

    getProjects(skip = 0, limit = 100): Observable<ListResponse<Project>> {
        return this.http.get<ListResponse<Project>>(`${this.baseUrl}`, {
            params: { skip: skip.toString(), limit: limit.toString() }
        }).pipe(
            tap(response => this.log('Loaded projects:', response.total)),
            catchError(this.handleError.bind(this))
        );
    }

    getProject(id: string): Observable<Project> {
        return this.http.get<Project>(`${this.baseUrl}/${id}`)
            .pipe(catchError(this.handleError.bind(this)));
    }

    createProject(data: ProjectCreate): Observable<Project> {
        return this.http.post<Project>(`${this.baseUrl}`, data)
            .pipe(
                tap(proj => this.log('Created project:', proj.id)),
                catchError(this.handleError.bind(this))
            );
    }

    updateProject(id: string, data: ProjectUpdate): Observable<Project> {
        return this.http.patch<Project>(`${this.baseUrl}/${id}`, data)
            .pipe(
                tap(() => this.log('Updated project:', id)),
                catchError(this.handleError.bind(this))
            );
    }

    deleteProject(id: string): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/${id}`)
            .pipe(
                tap(() => this.log('Deleted project:', id)),
                catchError(this.handleError.bind(this))
            );
    }

    // ============================================================================
    // Project Resources
    // ============================================================================

    getProjectConversations(projectId: string, skip = 0, limit = 100): Observable<ListResponse<ConversationListItem>> {
        return this.http.get<ListResponse<ConversationListItem>>(`${this.baseUrl}/${projectId}/conversations`, {
            params: { skip: skip.toString(), limit: limit.toString() }
        }).pipe(
            tap(response => this.log(`Loaded conversations for project ${projectId}:`, response.total)),
            catchError(this.handleError.bind(this))
        );
    }

    uploadProjectFile(projectId: string, file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);

        // Note: Project files might follow a different path or use the generic files endpoint
        // The spec says: POST /projects/{id}/files
        return this.http.post(`${this.baseUrl}/${projectId}/files`, formData, {
            reportProgress: true,
            observe: 'events'
        }).pipe(
            tap(event => {
                if (event['type'] === 4) { // HttpEventType.Response
                    this.log('Uploaded file to project:', projectId);
                }
            }),
            catchError(this.handleError.bind(this))
        );
    }

    getProjectFiles(projectId: string, skip = 0, limit = 100): Observable<ListResponse<FileAttachment>> {
        // Based on spec, "Files Tab: List files uploaded to this project"
        // Generic GET /files usually supports filtering, but let's check if there's a specific sub-resource
        // The spec doesn't explicitly list GET /projects/{id}/files for listing, but it implies it or generic /files?projection_id
        // Let's assume generic /files filter for now, OR if the spec allows, we can try to fetch from /projects/{id}/files if available.
        // Re-reading spec: "POST /projects/{id}/files: Upload a file".
        // "Files Tab: List files uploaded to this project."
        // Likely standard is GET /projects/{id}/files for listing too, or filtering generic. 
        // I'll implement a method that filters generic files by project_id if the backend supports it, 
        // or check if the backend has a specific LIST endpoint. 
        // Wait, spec says: "GET /projects/{id}/conversations". 
        // It doesn't explicitly say "GET /projects/{id}/files" returns list, but usually it does.
        // However, the generic 'FileModel' now has 'project_id'. 
        // Safest bet is to query generic files endpoint with project_id param if my ApiService supports it.
        // Looking at ApiService.getFiles: accepts (conversationId, fileType, processed...). It does NOT currently accept project_id.
        // I should update ApiService.getFiles or add a new method here.
        // Let's assume there is a GET /projects/{id}/files endpoint for listing.

        return this.http.get<ListResponse<FileAttachment>>(`${this.baseUrl}/${projectId}/files`, {
            params: { skip: skip.toString(), limit: limit.toString() }
        }).pipe(
            tap(response => this.log(`Loaded files for project ${projectId}:`, response.total)),
            catchError(this.handleError.bind(this))
        );
    }
}
