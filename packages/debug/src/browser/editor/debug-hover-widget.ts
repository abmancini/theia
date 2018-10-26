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

import { injectable, interfaces, Container, postConstruct, inject } from 'inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import { SourceTreeWidget } from '@theia/core/lib/browser/source-tree';
import { DebugHoverSource } from './debug-hover-source';
import { DebugEditor } from './debug-editor';

@injectable()
export class DebugHoverWidget extends SourceTreeWidget implements monaco.editor.IContentWidget {

    static createContainer(parent: interfaces.Container): Container {
        const child = SourceTreeWidget.createContainer(parent, {
            virtualized: false
        });
        child.bind(DebugHoverSource).toSelf();
        child.unbind(SourceTreeWidget);
        child.bind(DebugHoverWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container): DebugHoverWidget {
        return DebugHoverWidget.createContainer(parent).get(DebugHoverWidget);
    }

    @inject(DebugEditor)
    protected readonly editor: monaco.editor.IStandaloneCodeEditor;

    @inject(DebugHoverSource)
    readonly hoverSource: DebugHoverSource;

    @postConstruct()
    protected init(): void {
        super.init();
        this.source = this.hoverSource;
        this.toDispose.push(this.hoverSource);

        this.editor.addContentWidget(this);
        this.toDispose.push(Disposable.create(() => this.editor.removeContentWidget(this)));
    }

    getId(): string {
        return 'debug.editor.hover';
    }

    getDomNode(): HTMLElement {
        return this.node;
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
    protected matchExpression(selection: monaco.IRange): string {
        const lineContent = this.editor.getModel().getLineContent(selection.startLineNumber);
        const { start, end } = this.getExactExpressionStartAndEnd(lineContent, selection.startColumn, selection.endColumn);
        return lineContent.substring(start - 1, end);
    }
    protected getExactExpressionStartAndEnd(lineContent: string, looseStart: number, looseEnd: number): { start: number, end: number } {
        let matchingExpression: string | undefined = undefined;
        let startOffset = 0;

        // Some example supported expressions: myVar.prop, a.b.c.d, myVar?.prop, myVar->prop, MyClass::StaticProp, *myVar
        // Match any character except a set of characters which often break interesting sub-expressions
        const expression = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
        // tslint:disable-next-line
        let result: RegExpExecArray | null = null;

        // First find the full expression under the cursor
        while (result = expression.exec(lineContent)) {
            const start = result.index + 1;
            const end = start + result[0].length;

            if (start <= looseStart && end >= looseEnd) {
                matchingExpression = result[0];
                startOffset = start;
                break;
            }
        }

        // If there are non-word characters after the cursor, we want to truncate the expression then.
        // For example in expression 'a.b.c.d', if the focus was under 'b', 'a.b' would be evaluated.
        if (matchingExpression) {
            const subExpression: RegExp = /\w+/g;
            // tslint:disable-next-line
            let subExpressionResult: RegExpExecArray | null = null;
            while (subExpressionResult = subExpression.exec(matchingExpression)) {
                const subEnd = subExpressionResult.index + 1 + startOffset + subExpressionResult[0].length;
                if (subEnd >= looseEnd) {
                    break;
                }
            }

            if (subExpressionResult) {
                matchingExpression = matchingExpression.substring(0, subExpression.lastIndex);
            }
        }

        return matchingExpression ?
            { start: startOffset, end: startOffset + matchingExpression.length - 1 } :
            { start: 0, end: 0 };
    }

}
