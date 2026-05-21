import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../../models/models';
import { FileIconPipe } from '../../pipes/file-icon.pipe';
import { Subject } from 'rxjs';
import hljs from 'highlight.js';
import { marked } from 'marked';

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

    constructor() {
        const renderer = new marked.Renderer();
        renderer.code = function(token: any) {
            const text = typeof token === 'string' ? arguments[0] : token.text;
            const lang = typeof token === 'string' ? arguments[1] : token.lang;
            const langClass = lang || 'text';
            
            const escapedCode = text.replace(/[<>&]/g, (m: string) => {
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return '&amp;';
            });

            return `
        <div class="code-block-container">
          <div class="code-block-header">
            <span class="code-lang">${langClass}</span>
          </div>
          <pre><code class="language-${langClass}">${escapedCode}</code></pre>
        </div>`;
        };
        marked.use({
            renderer,
            breaks: true,
            gfm: true
        });
    }

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
        try {
            return marked.parse(content) as string;
        } catch (e) {
            console.error('Error parsing markdown:', e);
            return content;
        }
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
