import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from './api.config';

export interface AppConfig {
  apiBaseUrl: string;
}

/**
 * The backend's address, loaded once at startup from `/config.json`.
 *
 * One file to change per deployment: local development points it at nothing, so
 * calls stay same-origin and the dev server proxies them past CORS; a deployment
 * points it at the backend's own URL. Anything unset falls back to the constant
 * in `api.config.ts`, so the app still boots when the file is missing.
 *
 * Nothing is fetched on the server. A server render has no backend to call with
 * the answer, so waiting there would hold the whole page on a request that could
 * not change what it paints.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private config: AppConfig | null = null;

  async load(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    try {
      this.config = await firstValueFrom(this.http.get<AppConfig>('/config.json'));
    } catch {
      this.config = null;
    }
  }

  getApiBaseUrl(): string {
    const configured = (this.config?.apiBaseUrl ?? '').trim();
    return configured || API_BASE_URL;
  }
}

export const loadConfig = (configService: ConfigService) => () => configService.load();
