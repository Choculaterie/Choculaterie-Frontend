import { Component } from '@angular/core';

@Component({
    selector: 'app-reconnecting-toast',
    standalone: true,
    template: `
        <span class="reconnecting-content">
            <span class="reconnecting-text" i18n>Trying to reconnect to server…</span>
            <img src="loading.gif" alt="" class="reconnecting-gif" />
        </span>
    `,
    styles: [`
        .reconnecting-content {
            display: flex;
            align-items: center;
            width: 100%;
        }
        .reconnecting-text {
            flex: 1;
        }
        .reconnecting-gif {
            width: 22px;
            height: 22px;
            object-fit: contain;
            flex-shrink: 0;
            margin-left: 12px;
        }
    `],
})
export class ReconnectingToastComponent { }
