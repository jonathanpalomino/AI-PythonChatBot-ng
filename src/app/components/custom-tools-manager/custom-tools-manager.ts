// src/app/components/custom-tools-manager/custom-tools-manager.ts
import { Component, inject, signal, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule, JsonPipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { CustomTool, CustomToolParameter, CustomToolCreate, CustomToolUpdate } from '../../models/models';

const SESSION_KEY = 'ctm_oauth_pending_form';

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
    encapsulation: ViewEncapsulation.None,
    imports: [CommonModule, FormsModule, JsonPipe, TitleCasePipe],
    templateUrl: './custom-tools-manager.html',
    styleUrls: ['./custom-tools-manager.scss']
})
export class CustomToolsManager implements OnInit {
    private apiService = inject(ApiService);

    // State
    tools = signal<CustomTool[]>([]);
    isLoading = signal<boolean>(false);
    error = signal<string | null>(null);

    // Tool types
    toolTypes = signal<Record<string, ToolType>>({});
    selectedToolType = signal<string>('http_request');

    // Form state for creating/editing tools
    showForm = signal<boolean>(false);
    currentTool = signal<Partial<CustomTool> | null>(null);
    activeTab = signal<string>('general');

    // Form fields
    formData = signal<Partial<CustomTool>>({
        name: '',
        description: '',
        tool_type: 'http_request' as any,
        configuration: {
            url: '',
            method: 'POST',
            headers: {},
            parameters: []
        },
        intent_examples: [],
        content_prompt: '',
        is_active: true
    });

    // New intent example form
    newIntentExample = signal<string>('');

    // Available actions for multi-intent tools
    availableActions = signal<Array<{name: string, description: string, default_params: any}>>([]);

    // ── OAuth / Provider integration (for git_tool) ──────────────────────────
    /** Git provider currently selected in the form (bitbucket | github | gitlab) */
    selectedProvider = signal<string>('bitbucket');

    /** Whether the selected provider's OAuth is connected for the current user */
    providerConnected = signal<boolean>(false);

    /** True while we are checking the OAuth status */
    providerChecking = signal<boolean>(false);
    // ─────────────────────────────────────────────────────────────────────────

    // Computed properties
    supportsMultiIntent() {
        const toolType = this.formData().tool_type;
        // Tools that support multiple actions/intents
        return toolType === 'git_tool' as any || toolType === 'codebase_tool' as any;
    }

    hasIntentActions() {
        const config = this.formData().configuration;
        return config && typeof config === 'object' && 'intent_actions' in config;
    }

    getIntentActions() {
        const config = this.formData().configuration;
        if (this.hasIntentActions() && config && typeof config === 'object') {
            return config['intent_actions'] as Record<string, {examples: string[], default_params: any}>;
        }
        return {};
    }

    // Multi-intent editing
    selectedAction = signal<string>('');
    newActionExample = signal<string>('');

    // Load available actions when tool type changes
    async loadAvailableActions() {
        const toolType = this.formData().tool_type as string;
        console.log('loadAvailableActions called with tool_type:', toolType);

        if (!this.supportsMultiIntent()) {
            console.log('Tool does not support multi-intent, clearing available actions');
            this.availableActions.set([]);
            return;
        }

        try {
            console.log('Fetching tool details for:', toolType);
            const toolDetails = await this.apiService.getToolDetails(toolType).toPromise();
            console.log('Tool details received:', toolDetails);
            this.availableActions.set(toolDetails.available_actions || []);
            console.log('Available actions set:', this.availableActions());
        } catch (error) {
            console.error('Error loading available actions:', error);
            this.availableActions.set([]);
        }
    }

    selectAndEnableAction(actionName: string) {
        const config = this.formData().configuration || {};
        if (!config['intent_actions']) {
            config['intent_actions'] = {};
        }

        // If action is not enabled, enable it
        if (!config['intent_actions'][actionName]) {
            const availableAction = this.availableActions().find(a => a.name === actionName);
            config['intent_actions'][actionName] = {
                examples: [],
                default_params: availableAction?.default_params || {}
            };
        }

        // Toggle selection
        if (this.selectedAction() === actionName) {
            this.selectedAction.set('');
        } else {
            this.selectedAction.set(actionName);
        }

        this.formData.set({...this.formData(), configuration: config});
    }

    isActionEnabled(actionName: string): boolean {
        const config = this.formData().configuration;
        return config && config['intent_actions'] && config['intent_actions'][actionName];
    }

    hasConfiguredActions(): boolean {
        return Object.keys(this.getIntentActions()).length > 0;
    }

    addActionExample() {
        const action = this.selectedAction();
        const example = this.newActionExample().trim();
        if (!action || !example) return;

        const config = this.formData().configuration || {};
        if (config['intent_actions'] && config['intent_actions'][action]) {
            config['intent_actions'][action].examples.push(example);
            this.formData.set({...this.formData(), configuration: config});
            this.newActionExample.set(''); // Clear input after adding
        }
    }

    removeActionExample(actionName: string, exampleIndex: number) {
        const config = this.formData().configuration || {};
        if (config['intent_actions'] && config['intent_actions'][actionName]) {
            config['intent_actions'][actionName].examples.splice(exampleIndex, 1);
            this.formData.set({...this.formData(), configuration: config});
        }
    }

    updateActionParams(actionName: string, paramsJson: string) {
        const config = this.formData().configuration || {};
        if (config['intent_actions'] && config['intent_actions'][actionName]) {
            try {
                config['intent_actions'][actionName].default_params = JSON.parse(paramsJson) || {};
            } catch {
                config['intent_actions'][actionName].default_params = {};
            }
            this.formData.set({...this.formData(), configuration: config});
        }
    }

    parseJson(jsonString: string): any {
        try {
            return JSON.parse(jsonString);
        } catch {
            return {};
        }
    }

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

    // New key-value pair form for object fields (params, headers, etc.) - using Record to track per field
    newKeyValueKey = signal<Record<string, string>>({});
    newKeyValueValue = signal<Record<string, string>>({});

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

    ngOnInit(): void {
        // Check if we are returning from an OAuth redirect
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('oauth_success')) {
            // Clean URL so it doesn't fire again on refresh
            window.history.replaceState({}, document.title, window.location.pathname);
            this.restoreFormFromSession();
        } else if (urlParams.has('oauth_error')) {
            window.history.replaceState({}, document.title, window.location.pathname);
            this.error.set('No se pudo conectar la cuenta. Inténtalo de nuevo.');
        }
    }

    // ── OAuth Provider helpers ────────────────────────────────────────────────

    /** Called when the provider dropdown changes inside the git_tool configuration */
    async onProviderChange(): Promise<void> {
        await this.checkProviderStatus();
    }

    /** Checks whether the currently-selected provider has a valid OAuth token */
    async checkProviderStatus(): Promise<void> {
        const provider = this.selectedProvider();
        if (provider !== 'bitbucket') {
            // For GitHub/GitLab we don't have OAuth yet — mark as disconnected
            this.providerConnected.set(false);
            return;
        }
        this.providerChecking.set(true);
        try {
            const status = await this.apiService.getBitbucketStatus().toPromise();
            this.providerConnected.set(status?.authorized ?? false);
        } catch {
            this.providerConnected.set(false);
        } finally {
            this.providerChecking.set(false);
        }
    }

    /**
     * Keep `configuration.provider` in sync with the custom select dropdown.
     * Called from the (ngModelChange) of the provider dropdown.
     */
    syncProviderToConfig(provider: string): void {
        const config = { ...this.formData().configuration, provider };
        this.formData.set({ ...this.formData(), configuration: config });
    }

    /**
     * Saves form state to sessionStorage, then redirects to the OAuth authorize URL.
     * On return, ngOnInit restores the state via restoreFormFromSession().
     */
    connectProvider(): void {
        const provider = this.selectedProvider();
        if (provider !== 'bitbucket') {
            alert(`La integración OAuth con ${provider} aún no está disponible.`);
            return;
        }
        // Persist current form state before leaving the page
        const snapshot = {
            formData: this.formData(),
            selectedToolType: this.selectedToolType(),
            selectedProvider: this.selectedProvider(),
            showForm: true,
            activeTab: this.activeTab()
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
        // Navigate to OAuth flow
        const authUrl = this.apiService.getBitbucketAuthorizeUrl();
        window.location.href = authUrl;
    }

    /** Restores the form from sessionStorage after OAuth redirect returns */
    private restoreFormFromSession(): void {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return;
        sessionStorage.removeItem(SESSION_KEY);
        try {
            const snapshot = JSON.parse(raw);
            this.selectedToolType.set(snapshot.selectedToolType || 'git_tool');
            this.selectedProvider.set(snapshot.selectedProvider || 'bitbucket');
            this.activeTab.set(snapshot.activeTab || 'config');
            // Restore form data and auto-fill name/description if empty
            const restored = snapshot.formData || {};
            this.formData.set({
                ...restored,
                name: restored.name || this.buildDefaultName(snapshot.selectedProvider),
                description: restored.description || this.buildDefaultDescription(snapshot.selectedProvider)
            });
            this.showForm.set(true);
            // Now check the status — we should be connected
            this.checkProviderStatus();
        } catch (e) {
            console.error('Failed to restore form from session:', e);
        }
    }

    private buildDefaultName(provider: string): string {
        const names: Record<string, string> = {
            bitbucket: 'Bitbucket',
            github: 'GitHub',
            gitlab: 'GitLab'
        };
        return names[provider] || 'Git Tool';
    }

    private buildDefaultDescription(provider: string): string {
        const descs: Record<string, string> = {
            bitbucket: 'Herramienta de integración con Bitbucket para listar repositorios, analizar ramas y detectar conflictos.',
            github: 'Herramienta de integración con GitHub para listar repositorios y analizar cambios en ramas.',
            gitlab: 'Herramienta de integración con GitLab para listar proyectos y analizar cambios en ramas.'
        };
        return descs[provider] || 'Herramienta Git integrada.';
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Initialize with default tool types
    initializeDefaultToolTypes(): void {
        const defaultTypes: Record<string, ToolType> = {
            'http_request': {
                name: 'HTTP Request',
                description: 'Make HTTP requests to external APIs',
                config_schema: {},
                example: {}
            },
            'sql_query': {
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
    async showCreateForm(): Promise<void> {
        console.log('showCreateForm called');
        this.currentTool.set(null);
        this.activeTab.set('general');
        this.updateFormForToolType();
        console.log('After updateFormForToolType, tool_type:', this.formData().tool_type);
        await this.loadAvailableActions();
        console.log('After loadAvailableActions, available actions:', this.availableActions());
        this.showForm.set(true);
    }

    // Handle tool type change
    async onToolTypeChange(): Promise<void> {
        console.log('Tool type changed to:', this.selectedToolType());

        // Clear cache when tool type changes
        this.cachedSchemaFields = [];
        this.cachedCurrentSchema = {};

        // If we're creating a new tool, update the form
        if (!this.currentTool()) {
            this.updateFormForToolType();
            await this.loadAvailableActions();
        } else {
            if (confirm('Changing the tool type may affect the existing configuration. Do you want to continue?')) {
                this.updateFormForToolType();
                await this.loadAvailableActions();
            }
        }

     // For git_tool: reset provider and check OAuth status
     if (this.selectedToolType() === 'git_tool') {
        this.selectedProvider.set('bitbucket');
        await this.checkProviderStatus();
     } else {
        this.selectedProvider.set('github');
        this.providerConnected.set(false);
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
            tool_type: toolType as any,
            configuration: { ...example.configuration },
            intent_examples: isEditing ? currentForm.intent_examples : [],
            content_prompt: isEditing ? currentForm.content_prompt : '',
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
                // Hide the dynamic `provider` field for git_tool — we use our own selector above
                if (this.selectedToolType() === 'git_tool' && key === 'provider') continue;
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
    async showEditForm(tool: CustomTool): Promise<void> {
        console.log('showEditForm called for tool:', tool.name);
        this.currentTool.set(tool);
        this.selectedToolType.set(tool.tool_type);
        this.activeTab.set('general');
        const config = tool.configuration || {};

        this.formData.set({
            name: tool.name,
            description: tool.description,
            tool_type: tool.tool_type,
            configuration: { ...config },
            intent_examples: [...(tool.intent_examples || [])],
            content_prompt: tool.content_prompt || '',
            is_active: tool.is_active
        });

        console.log('Form data set, tool_type:', this.formData().tool_type);
        await this.loadAvailableActions();
        console.log('Available actions loaded:', this.availableActions());

        // Sync OAuth provider status so the inline card reflects reality on edit
        if (this.selectedToolType() === 'git_tool') {
            // Sync selectedProvider from the stored configuration so the badge shows the right state
            const stored = this.formData().configuration?.['provider'] as string | undefined;
            if (stored) this.selectedProvider.set(stored);
            await this.checkProviderStatus();
        }

        this.showForm.set(true);
    }

    // Intent examples management
    addIntentExample(): void {
        const example = this.newIntentExample().trim();
        if (!example) return;

        const currentForm = this.formData();
        const examples = [...(currentForm.intent_examples || []), example];
        this.formData.set({ ...currentForm, intent_examples: examples });
        this.newIntentExample.set('');
    }

    removeIntentExample(index: number): void {
        const currentForm = this.formData();
        const examples = [...(currentForm.intent_examples || [])];
        examples.splice(index, 1);
        this.formData.set({ ...currentForm, intent_examples: examples });
    }

    setActiveTab(tab: string): void {
        this.activeTab.set(tab);
    }

    // Add new parameter to form
    addParameter(): void {
        const currentForm = this.formData();
        const param = this.newParameter();

        if (!param.name) {
            this.error.set('Parameter name is required');
            return;
        }

        const newParams = [...(currentForm.configuration?.['parameters'] || []), {
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
        const newParams = [...(currentForm.configuration?.['parameters'] || [])];
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
        const newHeaders = { ...(currentForm.configuration?.['headers'] || {}), [key]: value };
        const newConfig = { ...(currentForm.configuration || {}), headers: newHeaders };
        this.formData.set({ ...currentForm, configuration: newConfig });
    }

    // Remove header from form
    removeHeader(key: string): void {
        const currentForm = this.formData();
        const newHeaders = { ...(currentForm.configuration?.['headers'] || {}) };
        delete newHeaders[key];
        const newConfig = { ...(currentForm.configuration || {}), headers: newHeaders };
        this.formData.set({ ...currentForm, configuration: newConfig });
    }

    // Key-value pair management for object fields (params, headers, etc.)
    addKeyValuePair(field: string): void {
        const keys = this.newKeyValueKey();
        const values = this.newKeyValueValue();
        const key = keys[field] || '';
        const value = values[field] || '';

        if (!key) {
            this.error.set('Key is required');
            return;
        }

        const currentForm = this.formData();
        const currentObj = { ...(currentForm.configuration?.[field] || {}) };
        currentObj[key] = value;

        const newConfig = { ...(currentForm.configuration || {}), [field]: currentObj };
        this.formData.set({ ...currentForm, configuration: newConfig });

        // Reset form for this field only
        const updatedKeys = { ...keys, [field]: '' };
        const updatedValues = { ...values, [field]: '' };
        this.newKeyValueKey.set(updatedKeys);
        this.newKeyValueValue.set(updatedValues);
    }

    removeKeyValuePair(field: string, key: string): void {
        const currentForm = this.formData();
        const currentObj = { ...(currentForm.configuration?.[field] || {}) };
        delete currentObj[key];

        const newConfig = { ...(currentForm.configuration || {}), [field]: currentObj };
        this.formData.set({ ...currentForm, configuration: newConfig });
    }

    editKeyValuePair(field: string, key: string, value: any): void {
        // Populate inputs with current values
        this.updateNewKey(field, key);
        this.updateNewValue(field, value);
        
        // Remove current entry so it can be "updated" on add
        this.removeKeyValuePair(field, key);
    }

    // Update key-value input for specific field
    updateNewKey(field: string, value: string): void {
        const current = this.newKeyValueKey();
        this.newKeyValueKey.set({ ...current, [field]: value });
    }

    updateNewValue(field: string, value: string): void {
        const current = this.newKeyValueValue();
        this.newKeyValueValue.set({ ...current, [field]: value });
    }

    // Get current new key for field
    getNewKey(field: string): string {
        return this.newKeyValueKey()[field] || '';
    }

    // Get current new value for field
    getNewValue(field: string): string {
        return this.newKeyValueValue()[field] || '';
    }

    // Get object entries as array for display
    getObjectEntries(fieldKey: string): [string, any][] {
        const obj = this.getFieldValue(fieldKey);
        return obj ? Object.entries(obj) : [];
    }

    // Check if field should use key-value editor
    isKeyValueField(fieldKey: string): boolean {
        // Fields that should use key-value editor
        const keyValueFields = ['params', 'headers'];
        return keyValueFields.includes(fieldKey);
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
                    tool_type: toolType as any,
                    configuration: configuration,
                    intent_examples: toolData.intent_examples,
                    content_prompt: toolData.content_prompt,
                    is_active: toolData.is_active
                };
                await this.apiService.updateCustomTool(this.currentTool()!.id as string, updateData).toPromise();
            } else {
                // Create new tool
                const createData: CustomToolCreate = {
                    name: toolData.name!,
                    description: toolData.description,
                    tool_type: toolType as any,
                    configuration: configuration,
                    intent_examples: toolData.intent_examples,
                    content_prompt: toolData.content_prompt,
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
        return toolType === 'http_request' || toolType === 'custom';
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
}