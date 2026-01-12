import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../../models/models';
import { FileIconPipe } from '../../pipes/file-icon.pipe';
import { Subject } from 'rxjs';
import hljs from 'highlight.js';

@Component({
    selector: 'app-message-list',
    standalone: true,
    imports: [CommonModule, FileIconPipe],
    templateUrl: './message-list.html',
    styleUrls: ['./message-list.scss']
})
export class MessageListComponent implements AfterViewChecked, OnDestroy {
    @Input() messages: Message[] = [];
    @Input() isLoading: boolean = false;

    @Output() onRegenerate = new EventEmitter<void>();

    @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

    private expandedThinking = new Set<string>();
    private destroy$ = new Subject<void>();
    private userAtBottom = true;
    private lastScrollHeight = 0;

    ngAfterViewChecked(): void {
        if (this.messagesContainer) {
            const container = this.messagesContainer.nativeElement;
            const currentHeight = container.scrollHeight;

            // Only auto-scroll if height changed AND user was at bottom
            if (currentHeight !== this.lastScrollHeight) {
                if (this.userAtBottom) {
                    this.scrollToBottom();
                }
                this.lastScrollHeight = currentHeight;
            }
        }
        this.highlightCodeBlocks();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    trackByMessageId(index: number, message: Message): string {
        return message.id;
    }

    scrollToBottom(): void {
        if (this.messagesContainer) {
            const container = this.messagesContainer.nativeElement;
            container.scrollTop = container.scrollHeight;
        }
    }

    onScroll(event: Event): void {
        const container = event.target as HTMLElement;
        const threshold = 5; // Much more sensitive threshold (5px)
        const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
        this.userAtBottom = atBottom;
    }

    getAvatarIcon(role: string): string {
        switch (role) {
            case 'user': return 'icon-user';
            case 'assistant': return 'icon-bot';
            case 'system': return 'icon-settings';
            default: return 'icon-message';
        }
    }

    toggleThinking(messageId: string): void {
        if (this.expandedThinking.has(messageId)) {
            this.expandedThinking.delete(messageId);
        } else {
            this.expandedThinking.add(messageId);
        }
    }

    isThinkingExpanded(messageId: string): boolean {
        return this.expandedThinking.has(messageId);
    }

    getThinkingWordCount(content: string): number {
        if (!content) return 0;
        return content.trim().split(/\s+/).length;
    }

    // Formatting logic (consolidated from app.ts)
    formatMessage(content: string | undefined): string {
        if (!content) return '';

        // 1) Extract code blocks first (on raw content) to avoid double escaping
        const fences: { lang: string, code: string }[] = [];
        let placeholderHtml = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const id = fences.length;
            fences.push({ lang: lang || 'text', code: code.trim() });
            return `__FENCE_${id}__`;
        });

        // 2) Escape the remaining text part
        let html = this.escapePreservingEntities(placeholderHtml);

        // 3) Basic Markdown-like formatting (inline)
        html = this.applyInline(html);

        // 4) Restore code blocks with highlight.js structure
        fences.forEach((f, i) => {
            const codeHtml = this.escapePreservingEntities(f.code);
            const replacement = `
        <div class="code-block-container">
          <div class="code-block-header">
            <span class="code-lang">${f.lang}</span>
          </div>
          <pre><code class="language-${f.lang}">${codeHtml}</code></pre>
        </div>`;
            html = html.replace(`__FENCE_${i}__`, replacement);
        });

        return html;
    }

    private escapePreservingEntities(s: string): string {
        return s.replace(/[<>&]/g, (m) => {
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return '&amp;';
        });
    }

    private applyInline(s: string): string {
        return s
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    private highlightCodeBlocks(): void {
        if (this.messagesContainer) {
            const blocks = this.messagesContainer.nativeElement.querySelectorAll('pre code:not(.hljs)');
            blocks.forEach((block: HTMLElement) => {
                hljs.highlightElement(block);
                this.injectCopyButtons(block);
            });
        }
    }

    private injectCopyButtons(codeBlock: HTMLElement): void {
        const container = codeBlock.closest('.code-block-container')?.querySelector('.code-block-header');
        if (!container || container.querySelector('.code-copy-btn')) return;

        const button = document.createElement('button');
        button.className = 'code-copy-btn';
        button.innerHTML = 'Copy';
        button.title = 'Copy to clipboard';

        button.onclick = () => {
            const code = codeBlock.innerText;
            navigator.clipboard.writeText(code).then(() => {
                button.innerHTML = 'Copied!';
                button.classList.add('copied');
                setTimeout(() => {
                    button.innerHTML = 'Copy';
                    button.classList.remove('copied');
                }, 2000);
            });
        };

        container.appendChild(button);
    }

    regenerate(): void {
        this.onRegenerate.emit();
    }
}
