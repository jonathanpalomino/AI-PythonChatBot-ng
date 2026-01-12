// src/app/services/theme.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'rag-chatbot-theme';
  private themeSubject: BehaviorSubject<Theme>;
  public currentTheme$: Observable<Theme>;

  constructor() {
    const savedTheme = this.getSavedTheme();
    const systemTheme = this.getSystemTheme();
    const initialTheme = savedTheme || systemTheme;

    this.themeSubject = new BehaviorSubject<Theme>(initialTheme);
    this.currentTheme$ = this.themeSubject.asObservable();

    // Apply initial theme
    this.applyTheme(initialTheme);

    // Listen for system theme changes
    this.watchSystemTheme();
  }

  /**
   * Get current theme
   */
  getCurrentTheme(): Theme {
    return this.themeSubject.value;
  }

  /**
   * Set theme
   */
  setTheme(theme: Theme): void {
    this.themeSubject.next(theme);
    this.applyTheme(theme);
    this.saveTheme(theme);
  }

  /**
   * Toggle between light and dark
   */
  toggleTheme(): void {
    const currentTheme = this.getCurrentTheme();
    const newTheme: Theme = currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  /**
   * Use system theme preference
   */
  useSystemTheme(): void {
    const systemTheme = this.getSystemTheme();
    this.setTheme(systemTheme);
    // Clear saved preference to follow system
    localStorage.removeItem(this.THEME_STORAGE_KEY);
  }

  /**
   * Check if dark mode is active
   */
  isDarkMode(): boolean {
    return this.getCurrentTheme() === 'dark';
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${theme}-theme`);
  }

  private saveTheme(theme: Theme): void {
    try {
      localStorage.setItem(this.THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  }

  private getSavedTheme(): Theme | null {
    try {
      const saved = localStorage.getItem(this.THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
    return null;
  }

  private getSystemTheme(): Theme {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }
    return 'light';
  }

  private watchSystemTheme(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      // Modern browsers
      if (darkModeQuery.addEventListener) {
        darkModeQuery.addEventListener('change', (e) => {
          // Only auto-switch if no saved preference
          if (!this.getSavedTheme()) {
            const newTheme: Theme = e.matches ? 'dark' : 'light';
            this.setTheme(newTheme);
          }
        });
      }
      // Legacy browsers
      else if ((darkModeQuery as any).addListener) {
        (darkModeQuery as any).addListener((e: MediaQueryListEvent) => {
          if (!this.getSavedTheme()) {
            const newTheme: Theme = e.matches ? 'dark' : 'light';
            this.setTheme(newTheme);
          }
        });
      }
    }
  }
}