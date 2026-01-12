import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

/**
 * Base abstract service that provides common functionality for all services,
 * specifically standardized error handling and logging.
 */
export abstract class BaseService {
    constructor(private serviceName: string) { }

    /**
     * Standardized error handling for HTTP requests.
     * Logs the error and throws a new Error with a user-friendly message.
     */
    protected handleError(error: HttpErrorResponse): Observable<never> {
        let errorMessage = 'An error occurred';

        if (error.error instanceof ErrorEvent) {
            // Client-side error
            errorMessage = `Client Error: ${error.error.message}`;
        } else {
            // Server-side error
            const errorBody = error.error;

            if (typeof errorBody === 'string') {
                try {
                    const parsed = JSON.parse(errorBody);
                    errorMessage = parsed.error?.message || parsed.detail || parsed.message || errorBody;
                } catch {
                    errorMessage = errorBody;
                }
            } else if (errorBody) {
                errorMessage = errorBody.error?.message || errorBody.detail || errorBody.message || error.message;
            } else {
                errorMessage = error.message || `Server Error: ${error.status} - ${error.statusText || error.status}`;
            }
        }

        this.log('Error:', errorMessage, error);
        return throwError(() => new Error(errorMessage));
    }

    /**
     * Standardized logging with service name prefix.
     */
    protected log(...args: any[]): void {
        console.log(`[${this.serviceName}]`, ...args);
    }

    /**
     * Standardized warning logging with service name prefix.
     */
    protected warn(...args: any[]): void {
        console.warn(`[${this.serviceName}]`, ...args);
    }

    /**
     * Standardized error logging with service name prefix.
     */
    protected error(...args: any[]): void {
        console.error(`[${this.serviceName}]`, ...args);
    }
}
