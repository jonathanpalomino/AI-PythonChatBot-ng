import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Project, ProjectCreate, ProjectUpdate } from '../../models/models';
import { ProjectService } from '../../services/project.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'app-project-form-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './project-form-modal.html',
    styleUrls: ['./project-form-modal.scss']
})
export class ProjectFormModalComponent implements OnInit, OnDestroy {
    @Input() projectToEdit?: Project; // If provided, edit mode
    @Output() close = new EventEmitter<void>();
    @Output() save = new EventEmitter<Project>();

    name: string = '';
    description: string = '';
    isSubmitting = false;
    error: string | null = null;
    private destroy$ = new Subject<void>();

    constructor(private projectService: ProjectService) { }

    ngOnInit() {
        if (this.projectToEdit) {
            this.name = this.projectToEdit.name;
            this.description = this.projectToEdit.description || '';
        }
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onSubmit() {
        if (!this.name.trim()) {
            this.error = 'El nombre del proyecto es obligatorio.';
            return;
        }

        this.isSubmitting = true;
        this.error = null;

        if (this.projectToEdit) {
            const updateData: ProjectUpdate = {
                name: this.name,
                description: this.description
            };
            this.projectService.updateProject(this.projectToEdit.id, updateData)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (project) => {
                        this.isSubmitting = false;
                        this.save.emit(project);
                    },
                    error: (err) => {
                        this.isSubmitting = false;
                        this.error = err.message || 'Error al actualizar el proyecto.';
                    }
                });
        } else {
            const createData: ProjectCreate = {
                name: this.name,
                description: this.description
            };
            this.projectService.createProject(createData)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                    next: (project) => {
                        this.isSubmitting = false;
                        this.save.emit(project);
                    },
                    error: (err) => {
                        this.isSubmitting = false;
                        this.error = err.message || 'Error al crear el proyecto.';
                    }
                });
        }
    }

    onDelete() {
        if (!this.projectToEdit || !confirm('¿Estás seguro de que deseas eliminar este proyecto? Esta acción no se puede deshacer.')) {
            return;
        }
        this.isSubmitting = true;
        this.projectService.deleteProject(this.projectToEdit.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.isSubmitting = false;
                    this.save.emit(undefined); // Emit undefined to signal deletion if handled by parent
                    this.close.emit(); // Or just close
                },
                error: (err) => {
                    this.isSubmitting = false;
                    this.error = err.message || 'Error al eliminar.';
                }
            })
    }

}
