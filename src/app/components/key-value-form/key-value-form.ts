// src/app/components/key-value-form/key-value-form.ts
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface KeyValueItem {
    key: string;
    value: string;
}

@Component({
    selector: 'app-key-value-form',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './key-value-form.html',
    styleUrls: ['./key-value-form.scss']
})
export class KeyValueFormComponent implements OnInit {
    @Input() items: KeyValueItem[] = [];
    @Input() title: string = 'Key-Value Pairs';
    @Input() keyPlaceholder: string = 'Key';
    @Input() valuePlaceholder: string = 'Value';
    @Input() allowEmptyKeys: boolean = false;
    @Input() allowEmptyValues: boolean = false;
    @Input() keyLabel: string = 'Key';
    @Input() valueLabel: string = 'Value';
    @Input() addButtonText: string = 'Add';
    @Input() removeButtonText: string = 'Remove';
    @Input() showHeaders: boolean = true;
    @Input() disabled: boolean = false;

    @Output() itemsChange = new EventEmitter<KeyValueItem[]>();

    newKey: string = '';
    newValue: string = '';
    error: string | null = null;

    ngOnInit(): void {
        // Initialize with empty array if undefined
        if (!this.items) {
            this.items = [];
        }
    }

    addItem(): void {
        this.error = null;

        // Validation
        if (!this.allowEmptyKeys && !this.newKey.trim()) {
            this.error = `${this.keyLabel} is required`;
            return;
        }

        if (!this.allowEmptyValues && !this.newValue.trim()) {
            this.error = `${this.valueLabel} is required`;
            return;
        }

        // Check for duplicate keys
        if (this.newKey.trim() && this.items.some(item => item.key === this.newKey.trim())) {
            this.error = `Duplicate ${this.keyLabel.toLowerCase()}: "${this.newKey.trim()}" already exists`;
            return;
        }

        // Add new item
        const newItem: KeyValueItem = {
            key: this.newKey.trim(),
            value: this.newValue.trim()
        };

        this.items = [...this.items, newItem];
        this.itemsChange.emit(this.items);

        // Reset form
        this.newKey = '';
        this.newValue = '';
    }

    removeItem(index: number): void {
        this.items = this.items.filter((_, i) => i !== index);
        this.itemsChange.emit(this.items);
    }

    updateItem(index: number, field: 'key' | 'value', value: string): void {
        const updatedItems = [...this.items];
        updatedItems[index] = {
            ...updatedItems[index],
            [field]: value
        };
        this.items = updatedItems;
        this.itemsChange.emit(this.items);
    }

    clearError(): void {
        this.error = null;
    }

    // Helper methods
    hasItems(): boolean {
        return this.items && this.items.length > 0;
    }

    canAddItem(): boolean {
        const hasKey = this.allowEmptyKeys || this.newKey.trim().length > 0;
        const hasValue = this.allowEmptyValues || this.newValue.trim().length > 0;
        return !this.disabled && hasKey && hasValue;
    }
}