export class FileUtils {
    static getFileIcon(fileName: string | undefined | null): string {
        if (!fileName) return 'icon-file';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const iconMap: Record<string, string> = {
            'pdf': 'icon-file-pdf',
            'docx': 'icon-file-word',
            'doc': 'icon-file-word',
            'txt': 'icon-file-text',
            'md': 'icon-file-text',
            'js': 'icon-file-code',
            'ts': 'icon-file-code',
            'py': 'icon-file-code',
            'java': 'icon-file-code',
            'sql': 'icon-file-database',
            'pptx': 'icon-file-powerpoint',
            'xlsx': 'icon-file-excel',
            'csv': 'icon-file-csv',
            'json': 'icon-file-json',
            'yaml': 'icon-file-yaml',
            'yml': 'icon-file-yaml',
            'html': 'icon-file-code',
            'css': 'icon-file-css',
            'png': 'icon-file-image',
            'jpg': 'icon-file-image',
            'jpeg': 'icon-file-image',
            'gif': 'icon-file-image',
            'svg': 'icon-file-image'
        };
        return iconMap[ext] || 'icon-file';
    }

    static isCodeFile(fileName: string | undefined | null): boolean {
        if (!fileName) return false;
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const codeExtensions = [
            'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
            'go', 'rs', 'php', 'rb', 'sql', 'html', 'css', 'sh',
            'kt', 'swift', 'scala', 'hs', 'lua', 'pl', 'pm', 'bat'
        ];
        return codeExtensions.includes(ext);
    }
}
