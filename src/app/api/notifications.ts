/**
 * User inbox notifications API client.
 * Hand-written to match Orval-generated service style.
 */
import {
  HttpClient,
  HttpHeaders,
  HttpResponse as AngularHttpResponse
} from '@angular/common/http';
import type {
  HttpContext,
  HttpEvent,
  HttpParams
} from '@angular/common/http';

import {
  Injectable,
  inject
} from '@angular/core';

import {
  Observable
} from 'rxjs';

import type {
  UserNotificationResponse
} from './generated.schemas';

interface HttpClientOptions {
  readonly headers?: HttpHeaders | Record<string, string | string[]>;
  readonly context?: HttpContext;
  readonly params?:
        | HttpParams
      | Record<string, string | number | boolean | Array<string | number | boolean>>;
  readonly reportProgress?: boolean;
  readonly withCredentials?: boolean;
  readonly credentials?: RequestCredentials;
  readonly keepalive?: boolean;
  readonly priority?: RequestPriority;
  readonly cache?: RequestCache;
  readonly mode?: RequestMode;
  readonly redirect?: RequestRedirect;
  readonly referrer?: string;
  readonly integrity?: string;
  readonly referrerPolicy?: ReferrerPolicy;
  readonly transferCache?: {includeHeaders?: string[]} | boolean;
  readonly timeout?: number;
}

type HttpClientBodyOptions = HttpClientOptions & {
  readonly observe?: 'body';
};

type HttpClientEventOptions = HttpClientOptions & {
  readonly observe: 'events';
};

type HttpClientResponseOptions = HttpClientOptions & {
  readonly observe: 'response';
};

type HttpClientObserveOptions = HttpClientOptions & {
  readonly observe?: 'body' | 'events' | 'response';
};

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  getApiNotifications<TData = UserNotificationResponse[]>(options?: HttpClientBodyOptions): Observable<TData>;
  getApiNotifications<TData = UserNotificationResponse[]>(options?: HttpClientEventOptions): Observable<HttpEvent<TData>>;
  getApiNotifications<TData = UserNotificationResponse[]>(options?: HttpClientResponseOptions): Observable<AngularHttpResponse<TData>>;
  getApiNotifications<TData = UserNotificationResponse[]>(
    options?: HttpClientObserveOptions): Observable<TData | HttpEvent<TData> | AngularHttpResponse<TData>> {
    if (options?.observe === 'events') {
      return this.http.get<TData>(`/api/Notifications`, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'events',
      });
    }
    if (options?.observe === 'response') {
      return this.http.get<TData>(`/api/Notifications`, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'response',
      });
    }
    return this.http.get<TData>(`/api/Notifications`, {
      ...(options as Omit<NonNullable<typeof options>, 'observe'>),
      observe: 'body',
    });
  }

  postApiNotificationsIdRead<TData = unknown>(id: number, options?: HttpClientBodyOptions): Observable<TData>;
  postApiNotificationsIdRead<TData = unknown>(id: number, options?: HttpClientEventOptions): Observable<HttpEvent<TData>>;
  postApiNotificationsIdRead<TData = unknown>(id: number, options?: HttpClientResponseOptions): Observable<AngularHttpResponse<TData>>;
  postApiNotificationsIdRead<TData = unknown>(
    id: number, options?: HttpClientObserveOptions): Observable<TData | HttpEvent<TData> | AngularHttpResponse<TData>> {
    if (options?.observe === 'events') {
      return this.http.post<TData>(`/api/Notifications/${id}/read`, undefined, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'events',
      });
    }
    if (options?.observe === 'response') {
      return this.http.post<TData>(`/api/Notifications/${id}/read`, undefined, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'response',
      });
    }
    return this.http.post<TData>(`/api/Notifications/${id}/read`, undefined, {
      ...(options as Omit<NonNullable<typeof options>, 'observe'>),
      observe: 'body',
    });
  }

  postApiNotificationsIdUnread<TData = unknown>(id: number, options?: HttpClientBodyOptions): Observable<TData>;
  postApiNotificationsIdUnread<TData = unknown>(id: number, options?: HttpClientEventOptions): Observable<HttpEvent<TData>>;
  postApiNotificationsIdUnread<TData = unknown>(id: number, options?: HttpClientResponseOptions): Observable<AngularHttpResponse<TData>>;
  postApiNotificationsIdUnread<TData = unknown>(
    id: number, options?: HttpClientObserveOptions): Observable<TData | HttpEvent<TData> | AngularHttpResponse<TData>> {
    if (options?.observe === 'events') {
      return this.http.post<TData>(`/api/Notifications/${id}/unread`, undefined, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'events',
      });
    }
    if (options?.observe === 'response') {
      return this.http.post<TData>(`/api/Notifications/${id}/unread`, undefined, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'response',
      });
    }
    return this.http.post<TData>(`/api/Notifications/${id}/unread`, undefined, {
      ...(options as Omit<NonNullable<typeof options>, 'observe'>),
      observe: 'body',
    });
  }

  deleteApiNotificationsId<TData = unknown>(id: number, options?: HttpClientBodyOptions): Observable<TData>;
  deleteApiNotificationsId<TData = unknown>(id: number, options?: HttpClientEventOptions): Observable<HttpEvent<TData>>;
  deleteApiNotificationsId<TData = unknown>(id: number, options?: HttpClientResponseOptions): Observable<AngularHttpResponse<TData>>;
  deleteApiNotificationsId<TData = unknown>(
    id: number, options?: HttpClientObserveOptions): Observable<TData | HttpEvent<TData> | AngularHttpResponse<TData>> {
    if (options?.observe === 'events') {
      return this.http.delete<TData>(`/api/Notifications/${id}`, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'events',
      });
    }
    if (options?.observe === 'response') {
      return this.http.delete<TData>(`/api/Notifications/${id}`, {
        ...(options as Omit<NonNullable<typeof options>, 'observe'>),
        observe: 'response',
      });
    }
    return this.http.delete<TData>(`/api/Notifications/${id}`, {
      ...(options as Omit<NonNullable<typeof options>, 'observe'>),
      observe: 'body',
    });
  }
}

export type GetApiNotificationsClientResult = NonNullable<UserNotificationResponse[]>;
export type PostApiNotificationsIdReadClientResult = NonNullable<unknown>;
export type PostApiNotificationsIdUnreadClientResult = NonNullable<unknown>;
export type DeleteApiNotificationsIdClientResult = NonNullable<unknown>;
