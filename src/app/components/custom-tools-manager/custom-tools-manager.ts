// src/app/components/custom-tools-manager/custom-tools-manager.ts
import { Component, inject, signal, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { CustomTool, CustomToolParameter, CustomToolCreate, CustomToolUpdate } from '../../models/models';
import { KeyValueFormComponent, KeyValueItem } from '../key-value-form/key-value-form';

interface ToolType {
    name: string;
    description: string;
    config_schema: any;
    example: any;
}

interface SchemaField {
    key: string;
    value: any;
}

@Component({
    selector: 'app-custom-tools-manager',
    standalone: true,
    imports: [CommonModule, FormsModule, KeyValueFormComponent],
    templateUrl: './custom-tools-manager.html',
    styleUrls: ['./custom-tools-manager.scss']
})
export class CustomToolsManager {
    private apiService = inject(ApiService);

    // State
    tools = signal<CustomTool[]>([]);
    isLoading = signal<boolean>(false);
    error = signal<string | null>(null);

    // Tool types
    toolTypes = signal<Record<string, ToolType>>({});
    selectedToolType = signal<string>('http');

    // Form state for creating/editing tools
    showForm = signal<boolean>(false);
    currentTool = signal<Partial<CustomTool> | null>(null);

    // Form fields
    formData = signal<Partial<CustomTool>>({
        name: '',
        description: '',
        tool_type: 'http',
        configuration: {
            url: '',
            method: 'POST',
            headers: {},
            parameters: []
        },
        is_active: true
    });

    // New parameter form
    newParameter = signal<Partial<CustomToolParameter>>({
        name: '',
        type: 'string',
        description: '',
        required: false,
        enum: [],
        default: ''
    });

    // New header form
    newHeaderKey = signal<string>('');
    newHeaderValue = signal<string>('');

    // Dynamic array management
    newArrayItemObject = signal<Record<string, any>>({});
    newArrayItemValue = signal<Record<string, string>>({});

    // Memoized values to prevent infinite loops
    private cachedToolTypes: string[] = [];
    private cachedSchemaFields: SchemaField[] = [];
    private cachedCurrentSchema: any = {};

    constructor() {
        // Initialize with default tool types before loading from API
        this.initializeDefaultToolTypes();
        this.loadTools();
        this.loadToolTypes();
    }

    // Initialize with default tool types
    initializeDefaultToolTypes(): void {
        const defaultTypes: Record<string, ToolType> = {
            'http': {
                name: 'HTTP Request',
                description: 'Make HTTP requests to external APIs',
                config_schema: {},
                example: {}
            },
            'sql': {
                name: 'SQL Query',
                description: 'Execute SQL queries against databases',
                config_schema: {},
                example: {}
            },
            'custom': {
                name: 'Custom Tool',
                description: 'Custom tool with flexible configuration',
                config_schema: {},
                example: {}
            }
        };
        this.toolTypes.set(defaultTypes);
    }

    // Load tool types
    async loadToolTypes(): Promise<void> {
        this.isLoading.set(true);
        this.error.set(null);

        try {
            console.log('Loading tool types...');
            const toolTypes = await this.apiService.getToolTypes().toPromise();
            console.log('Tool types response:', toolTypes);

            // Process the response if it's valid
            if (toolTypes && typeof toolTypes === 'object' && Object.keys(toolTypes).length > 0) {
                const types: Record<string, ToolType> = {};
                Object.entries(toolTypes).forEach(([key, value]) => {
                    console.log(`Processing tool type: ${key}`, value);
                    types[key] = {
                        name: value.name || key,
                        description: value.description || '',
                        config_schema: value.config_schema || {},
                        example: value.example || {}
                    };
                });
                this.toolTypes.set(types);
                console.log('Processed tool types:', types);

                // Clear cache when tool types are updated
                this.cachedToolTypes = [];
                this.cachedSchemaFields = [];
                this.cachedCurrentSchema = {};

                // Ensure selectedToolType is valid
                const currentType = this.selectedToolType();
                if (!types[currentType]) {
                    // If the current selected type doesn't exist, select the first available type
                    const firstType = Object.keys(types)[0];
                    this.selectedToolType.set(firstType);
                    console.log(`Selected tool type changed to: ${firstType}`);
                }
            } else {
                console.warn('Tool types response is empty or not in the expected format, keeping defaults');
            }
        } catch (err) {
            console.error('Error loading tool types:', err);
            this.error.set('Failed to load tool types. Using default tool types.');
            // Don't throw error, just keep the default types
        } finally {
            this.isLoading.set(false);
        }
    }

    // Load all custom tools
    async loadTools(): Promise<void> {
        this.isLoading.set(true);
        this.error.set(null);

        try {
            console.log('Loading custom tools...');
            const tools = await this.apiService.getCustomTools().toPromise();
            console.log('Custom tools response:', tools);
            this.tools.set(tools || []);
        } catch (err) {
            console.error('Error loading custom tools:', err);
            this.error.set('Failed to load custom tools');
        } finally {
            this.isLoading.set(false);
        }
    }

    // Show create form
    showCreateForm(): void {
        this.currentTool.set(null);
        this.updateFormForToolType();
        this.showForm.set(true);
    }

    // Handle tool type change
    onToolTypeChange(): void {
        console.log('Tool type changed to:', this.selectedToolType());

        // Clear cache when tool type changes
        this.cachedSchemaFields = [];
        this.cachedCurrentSchema = {};

        // If we're creating a new tool, update the form
        if (!this.currentTool()) {
            this.updateFormForToolType();
        } else {
            // If we're editing an existing tool, we might want to ask for confirmation
            // before changing the tool type, as it could affect the configuration
            if (confirm('Changing the tool type may affect the existing configuration. Do you want to continue?')) {
                this.updateFormForToolType();
            } else {
                // Revert the tool type selection
                this.selectedToolType.set(this.currentTool()?.tool_type || 'http');
            }
        }
    }

    // Update form data based on the selected tool type
    updateFormForToolType(): void {
        const toolType = this.selectedToolType();
        const toolTypes = this.toolTypes();

        console.log(`Updating form for tool type: ${toolType}`);
        console.log('Available tool types:', toolTypes);

        // Get the example configuration for the selected tool type
        const example = toolTypes[toolType]?.example || {};
        console.log('Example configuration:', example);

        // Update the form data
        const currentForm = this.formData();

        // If we're editing an existing tool, preserve the name and description
        const isEditing = this.currentTool() !== null && this.currentTool() !== undefined;

        this.formData.set({
            ...currentForm,
            name: isEditing ? currentForm.name : '',
            description: isEditing ? currentForm.description : '',
            tool_type: toolType,
            configuration: { ...example.configuration },
            is_active: isEditing ? currentForm.is_active : true
        });

        console.log('Form data updated:', this.formData());
    }

    // Dynamic schema-based methods

    // Get display name for tool type
    getToolTypeDisplayName(toolType: string): string {
        const types = this.toolTypes();
        return types[toolType]?.name || toolType;
    }

    // Get current tool schema (memoized)
    getCurrentToolSchema(): any {
        const toolType = this.selectedToolType();
        const types = this.toolTypes();
        const schema = types[toolType]?.config_schema || {};

        // Cache the schema to prevent infinite loops
        if (JSON.stringify(this.cachedCurrentSchema) !== JSON.stringify(schema)) {
            this.cachedCurrentSchema = schema;
        }

        return this.cachedCurrentSchema;
    }

    // Get schema fields as array (memoized)
    getSchemaFields(): SchemaField[] {
        const schema = this.getCurrentToolSchema();
        const fields = [];

        if (schema && schema.properties) {
            for (const key of Object.keys(schema.properties)) {
                fields.push({
                    key: key,
                    value: schema.properties[key]
                });
            }
        }

        // Cache the fields array to prevent infinite loops
        const fieldsJson = JSON.stringify(fields);
        const cachedFieldsJson = JSON.stringify(this.cachedSchemaFields);

        if (fieldsJson !== cachedFieldsJson) {
            this.cachedSchemaFields = [...fields];
        }

        return this.cachedSchemaFields;
    }

    // Get field type for dynamic rendering
    getFieldType(fieldKey: string): string {
        const schema = this.getCurrentToolSchema();
        const field = schema?.properties?.[fieldKey];

        if (!field) return 'string';

        // Check for password format
        if (field.format === 'password') {
            return 'password';
        }

        // Check for enum (select)
        if (field.enum && Array.isArray(field.enum)) {
            return 'string_enum';
        }

        // Check for array type
        if (field.type === 'array') {
            return 'array';
        }

        // Check for object type
        if (field.type === 'object') {
            return 'object';
        }

        // Return the basic type
        return field.type || 'string';
    }

    // Get field label (pretty formatted)
    getFieldLabel(fieldKey: string): string {
        return fieldKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // Get field value from form data
    getFieldValue(fieldKey: string): any {
        const form = this.formData();
        return form.configuration?.[fieldKey];
    }

    // Update dynamic config field
    updateDynamicConfig(fieldKey: string, value: any): void {
        const currentForm = this.formData();
        const newConfig = { ...(currentForm.configuration || {}), [fieldKey]: value };
        this.formData.set({ ...currentForm, configuration: newConfig });
    }

    // Format object as JSON string
    formatObjectAsJson(obj: any): string {
        if (!obj) return '';
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return '';
        }
    }

    // Update object config from JSON string
    updateObjectConfig(fieldKey: string, jsonString: string): void {
        try {
            const parsed = jsonString ? JSON.parse(jsonString) : {};
            this.updateDynamicConfig(fieldKey, parsed);
        } catch (error) {
            // Invalid JSON, don't update
            console.warn('Invalid JSON for field:', fieldKey);
        }
    }

    // Array management methods
    getArrayItems(fieldKey: string): any[] {
        const value = this.getFieldValue(fieldKey);
        return Array.isArray(value) ? value : [];
    }

    isObjectArray(fieldKey: string): boolean {
        const items = this.getArrayItems(fieldKey);
        return items.length > 0 && typeof items[0] === 'object' && !Array.isArray(items[0]);
    }

    getObjectArrayDisplay(item: any): string {
        if (typeof item === 'object' && item !== null) {
            const keys = Object.keys(item);
            if (keys.includes('name')) return item.name;
            if (keys.includes('key')) return item.key;
            return JSON.stringify(item);
        }
        return String(item);
    }

    removeArrayItem(fieldKey: string, index: number): void {
        const currentForm = this.formData();
        const currentArray = this.getArrayItems(fieldKey);
        const newArray = [...currentArray];
        newArray.splice(index, 1);
        this.updateDynamicConfig(fieldKey, newArray);
    }

    getObjectArrayProperties(fieldKey: string): string[] {
        const items = this.getArrayItems(fieldKey);
        if (items.length > 0 && typeof items[0] === 'object') {
            return Object.keys(items[0]);
        }
        return [];
    }

    getNewArrayItemObject(): Record<string, any> {
        const toolType = this.selectedToolType();
        const currentValue = this.newArrayItemObject();

        // Return the value, ensuring it's properly initialized
        if (!currentValue[toolType]) {
            return { ...currentValue, [toolType]: {} };
        }

        return currentValue;
    }

    addArrayItem(fieldKey: string): void {
        const currentForm = this.formData();
        const currentArray = this.getArrayItems(fieldKey);

        let newItem: any;

        if (this.isObjectArray(fieldKey)) {
            const toolType = this.selectedToolType();
            const newItemData = this.getNewArrayItemObject()[toolType] || {};
            newItem = { ...newItemData };

            // Clear the form for next item
            this.newArrayItemObject.set({
                ...this.newArrayItemObject(),
                [toolType]: {}
            });
        } else {
            const toolType = this.selectedToolType();
            newItem = this.newArrayItemValue()[toolType] || '';

            // Clear the form for next item
            this.newArrayItemValue.set({
                ...this.newArrayItemValue(),
                [toolType]: ''
            });
        }

        const newArray = [...currentArray, newItem];
        this.updateDynamicConfig(fieldKey, newArray);
    }

    getNewArrayItemValue(): Record<string, string> {
        const toolType = this.selectedToolType();
        const currentValue = this.newArrayItemValue();

        // Return the value, ensuring it's properly initialized
        if (!currentValue[toolType]) {
            return { ...currentValue, [toolType]: '' };
        }

        return currentValue;
    }

    // Show edit form
    showEditForm(tool: CustomTool): void {
        this.currentTool.set(tool);
        this.selectedToolType.set(tool.tool_type);
        const config = tool.configuration || {};

        this.formData.set({
            name: tool.name,
            description: tool.description,
            tool_type: tool.tool_type,
            configuration: { ...config },
            is_active: tool.is_active
        });

        this.showForm.set(true);
    }

    // Add new parameter to form
    addParameter(): void {
        const currentForm = this.formData();
        const param = this.newParameter();

        if (!param.name) {
            this.error.set('Parameter name is required');
            return;
        }

        const newParams = [...(currentForm.configuration?.parameters || []), {
            name: param.name,
            type: param.type || 'string',
            description: param.description || '',
            required: param.required || false,
            enum: param.enum || [],
            default: param.default || ''
        }];

        const newConfig = { ...(currentForm.configuration || {}), parameters: newParams };
        this.formData.set({ ...currentForm, configuration: newConfig });

        // Reset new parameter form
        this.newParameter.set({
            name: '',
            type: 'string',
            description: '',
            required: false,
            enum: [],
            default: ''
        });
    }

    // Remove parameter from form
    removeParameter(index: number): void {
        const currentForm = this.formData();
        const newParams = [...(currentForm.configuration?.parameters || [])];
        newParams.splice(index, 1);
        const newConfig = { ...(currentForm.configuration || {}), parameters: newParams };
        this.formData.set({ ...currentForm, configuration: newConfig });
    }

    // Add header to form
    addHeader(key: string, value: string): void {
        if (!key || !value) {
            this.error.set('Header key and value are required');
            return;
        }

        const currentForm = this.formData();
        const newHeaders = { ...(currentForm.configuration?.headers || {}), [key]: value };
        const newConfig = { ...(currentForm.configuration || {}), headers: newHeaders };
        this.formData.set({ ...currentForm, configuration: newConfig });
    }

    // Remove header from form
    removeHeader(key: string): void {
        const currentForm = this.formData();
        const newHeaders = { ...(currentForm.configuration?.headers || {}) };
        delete newHeaders[key];
        const newConfig = { ...(currentForm.configuration || {}), headers: newHeaders };
        this.formData.set({ ...currentForm, configuration: newConfig });
    }

    // Save tool (create or update)
    async saveTool(): Promise<void> {
        const toolData = this.formData();
        const toolType = this.selectedToolType();

        // Validate required fields based on schema
        const schema = this.getCurrentToolSchema();
        const properties = schema?.properties || {};

        if (!toolData.name) {
            this.error.set('Name is required');
            return;
        }

        // Validate required fields from schema
        for (const [fieldKey, fieldConfig] of Object.entries(properties)) {
            const config = fieldConfig as any;
            if (config.required && !this.getFieldValue(fieldKey)) {
                this.error.set(`${this.getFieldLabel(fieldKey)} is required`);
                return;
            }
        }

        // Special validation for URL fields
        const urlFields = Object.keys(properties).filter(key => {
            const config = properties[key] as any;
            return config.type === 'string' &&
                (config.description?.includes('URL') || key.includes('url'));
        });

        for (const urlField of urlFields) {
            const urlValue = this.getFieldValue(urlField);
            if (urlValue && !this.isValidUrl(urlValue)) {
                this.error.set(`${this.getFieldLabel(urlField)} must start with http:// or https://`);
                return;
            }
        }

        try {
            // Configuration is already properly structured in formData
            const configuration = { ...toolData.configuration };

            if (this.currentTool() && this.currentTool()!.id !== undefined) {
                // Update existing tool
                const updateData: CustomToolUpdate = {
                    name: toolData.name,
                    description: toolData.description,
                    tool_type: toolType,
                    configuration: configuration,
                    is_active: toolData.is_active
                };
                await this.apiService.updateCustomTool(this.currentTool()!.id as string, updateData).toPromise();
            } else {
                // Create new tool
                const createData: CustomToolCreate = {
                    name: toolData.name!,
                    description: toolData.description,
                    tool_type: toolType,
                    configuration: configuration,
                    is_active: toolData.is_active
                };
                await this.apiService.createCustomTool(createData).toPromise();
            }

            // Refresh list and close form
            await this.loadTools();
            this.showForm.set(false);
        } catch (err) {
            this.error.set('Failed to save custom tool');
            console.error('Error saving custom tool:', err);
        }
    }

    // Helper to validate URL format
    isValidUrl(url: string): boolean {
        return url.startsWith('http://') || url.startsWith('https://');
    }

    // Delete tool
    async deleteTool(toolId: string): Promise<void> {
        if (!confirm('Are you sure you want to delete this custom tool?')) {
            return;
        }

        try {
            await this.apiService.deleteCustomTool(toolId).toPromise();
            await this.loadTools();
        } catch (err) {
            this.error.set('Failed to delete custom tool');
            console.error('Error deleting custom tool:', err);
        }
    }

    // Cancel form
    cancelForm(): void {
        this.showForm.set(false);
        this.error.set(null);
    }

    // Helper to get parameter types for dropdown
    getParameterTypes(): string[] {
        return ['string', 'number', 'boolean', 'array', 'object'];
    }

    // Helper to get HTTP methods for dropdown
    getHttpMethods(): string[] {
        return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    }

    // Helper to get available tool types (memoized)
    getToolTypes(): string[] {
        const types = this.toolTypes();
        const keys = Object.keys(types);

        // Cache the keys to prevent infinite loops
        const keysJson = JSON.stringify(keys);
        const cachedKeysJson = JSON.stringify(this.cachedToolTypes);

        if (keysJson !== cachedKeysJson) {
            this.cachedToolTypes = [...keys];
        }

        return this.cachedToolTypes;
    }

    // Helper to check if object has keys
    objectKeys(obj: any): string[] {
        return obj ? Object.keys(obj) : [];
    }

    // Helper to check if the current tool type supports parameters and headers
    isHttpOrCustomToolType(): boolean {
        const toolType = this.selectedToolType();
        return toolType === 'http' || toolType === 'custom';
    }

    // Helper to update configuration fields
    updateConfig(field: string, value: any): void {
        this.updateDynamicConfig(field, value);
    }

    // Helper methods for array item management that can be called from templates
    updateNewArrayItemValue(fieldKey: string, value: string): void {
        const toolType = this.selectedToolType();
        const currentValue = this.newArrayItemValue();
        this.newArrayItemValue.set({
            ...currentValue,
            [toolType]: value
        });
    }

    updateNewArrayItemObject(fieldKey: string, propertyKey: string, value: any): void {
        const toolType = this.selectedToolType();
        const currentValue = this.newArrayItemObject();
        const currentToolValue = currentValue[toolType] || {};
        this.newArrayItemObject.set({
            ...currentValue,
            [toolType]: {
                ...currentToolValue,
                [propertyKey]: value
            }
        });
    }

    // Helper methods for params conversion (key-value format)
    getParamsAsKeyValueItems(): KeyValueItem[] {
        const params = this.getFieldValue('parameters') || [];
        return params.map((param: any) => ({
            key: param.name || '',
            value: param.description || ''
        }));
    }

    updateParamsFromKeyValueItems(items: KeyValueItem[]): void {
        const params = items.map(item => ({
            name: item.key,
            type: 'string', // Default type for params
            description: item.value,
            required: false,
            enum: [],
            default: ''
        }));
        this.updateDynamicConfig('parameters', params);
    }

    // Helper methods for object params conversion (key-value format)
    getObjectParamsAsKeyValueItems(): KeyValueItem[] {
        const params = this.getFieldValue('params') || {};
        return Object.entries(params).map(([key, value]) => ({
            key: key,
            value: String(value || '')
        }));
    }

    updateObjectParamsFromKeyValueItems(items: KeyValueItem[]): void {
        const params = items.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
        }, {} as Record<string, string>);
        this.updateDynamicConfig('params', params);
    }

    // Helper to check if field is params (should use key-value form)
    isParamsField(fieldKey: string): boolean {
        const lowerKey = fieldKey.toLowerCase();
        return lowerKey === 'parameters' || lowerKey === 'params' ||
            lowerKey.includes('param') || lowerKey.includes('query');
    }

    // Helper to check if field should use key-value form (for both array and object types)
    shouldUseKeyValueForm(fieldKey: string, fieldType: string): boolean {
        const isParams = this.isParamsField(fieldKey);
        const isArray = fieldType === 'array';
        const isObject = fieldType === 'object';

        // Use key-value form for params fields that are arrays or objects
        return isParams && (isArray || isObject);
    }
}