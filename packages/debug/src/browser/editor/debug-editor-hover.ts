/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import debounce = require('lodash.debounce');

import { injectable, postConstruct, inject } from 'inversify';
import { Widget } from '@phosphor/widgets';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugHoverWidget } from './debug-hover-widget';
import { DebugEditor } from './debug-editor';
import { DebugExpressionProvider } from './debug-expression-provider';

export interface ShowDebugHoverOptions {
    selection: monaco.Range
    /** default: false */
    focus?: boolean
    /** default: true */
    immediate?: boolean
}

export interface HideDebugHoverOptions {
    /** default: true */
    immediate?: boolean
}

@injectable()
export class DebugEditorHover implements monaco.editor.IContentWidget, Disposable {

    protected readonly toDispose = new DisposableCollection(
        Disposable.create(() => this.hide())
    );

    allowEditorOverflow = true;

    static ID = 'debug.editor.hover';
    getId(): string {
        return DebugEditorHover.ID;
    }

    protected readonly domNode = document.createElement('div');
    getDomNode(): HTMLElement {
        return this.domNode;
    }

    @inject(DebugEditor)
    protected readonly editor: monaco.editor.IStandaloneCodeEditor;

    @inject(DebugSessionManager)
    protected readonly sessions: DebugSessionManager;

    @inject(DebugHoverWidget)
    protected readonly widget: DebugHoverWidget;

    @inject(DebugExpressionProvider)
    protected readonly expressionProvider: DebugExpressionProvider;

    @postConstruct()
    protected init(): void {
        this.editor.addContentWidget(this);
        this.toDispose.push(Disposable.create(() => this.editor.removeContentWidget(this)));
        Widget.attach(this.widget, this.domNode);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    show(options: ShowDebugHoverOptions): void {
        const { currentFrame } = this.sessions;
        if (!currentFrame || !currentFrame.source ||
            this.editor.getModel().uri.toString() !== currentFrame.source.uri.toString()) {
            return;
        }
        this.schedule(() => this.doShow(options), options.immediate);
    }
    hide(options?: HideDebugHoverOptions): void {
        this.schedule(() => this.doHide(), options && options.immediate);
    }
    protected schedule(fn: () => void, immediate: boolean = true): void {
        if (immediate) {
            this.doSchedule.cancel();
            fn();
        } else {
            this.doSchedule(fn);
        }
    }
    protected readonly doSchedule = debounce((fn: () => void) => fn(), 300);

    protected visible = false;
    protected options: ShowDebugHoverOptions | undefined;
    protected doHide(): void {
        if (!this.visible) {
            return;
        }
        this.visible = false;
        this.options = undefined;
        this.editor.layoutContentWidget(this);
    }
    protected async doShow(options: ShowDebugHoverOptions): Promise<void> {
        if (this.options && this.options.selection.equalsRange(options.selection)) {
            return;
        }
        this.options = options;
        this.visible = true;
        const expression = this.expressionProvider.get(this.editor.getModel(), options.selection);
        if (!expression) {
            this.hide();
            return;
        }
        if (!await this.widget.hoverSource.evaluate(expression)) {
            this.hide();
            return;
        }
        this.editor.layoutContentWidget(this);
    }

    getPosition(): monaco.editor.IContentWidgetPosition {
        const position = this.options && this.options.selection.getStartPosition();
        return this.visible && position ? {
            position,
            preference: [
                monaco.editor.ContentWidgetPositionPreference.ABOVE,
                monaco.editor.ContentWidgetPositionPreference.BELOW
            ]
        } : undefined!;
    }
}
