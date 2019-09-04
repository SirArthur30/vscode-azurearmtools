// ----------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.  All rights reserved.
// ----------------------------------------------------------------------------

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import { callWithTelemetryAndErrorHandlingSync, parseError, TelemetryProperties } from 'vscode-azureextensionui';
import { Message } from 'vscode-jsonrpc';
import { CloseAction, ErrorAction, ErrorHandler, LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient';
import { armDeploymentLanguageId } from '../constants';
import { ext } from '../extensionVariables';
import { armDeploymentDocumentSelector } from '../supported';

const languageServerName = 'ARM Language Server';
const languageServerDllName = 'Microsoft.ArmLanguageServer.dll';
let serverStartMs: number;
const languageServerErrorTelemId = "Language Server Error";

export function startArmLanguageServer(context: ExtensionContext): void {
    callWithTelemetryAndErrorHandlingSync('startArmLanguageClient', () => {
        // The server is implemented in .NET Core. We run it by calling 'dotnet' with the dll as an argument

        let serverExe = os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet';

        let serverDllPath = workspace.getConfiguration('armTools').get<string | undefined>('languageServer.path');

        if (typeof serverDllPath !== 'string' || serverDllPath === '') {
            // Check for the files under LanguageServerBin
            let serverFolderPath = context.asAbsolutePath(languageServerFolderName);
            serverDllPath = path.join(serverFolderPath, languageServerDllName);
            if (!fs.existsSync(serverFolderPath) || !fs.existsSync(serverDllPath)) {
                throw new Error(`Couldn't find the ARM language server at ${serverDllPath}, you may need to reinstall the extension.`);
            }

            serverDllPath = path.join(serverFolderPath, languageServerDllName);
        } else {
            if (!fs.existsSync(serverDllPath)) {
                throw new Error(`Couldn't find the ARM language server at ${serverDllPath}.  Please verify your 'armTools.languageServer.path' setting.`);
            }

            if (fs.statSync(serverDllPath).isDirectory()) {
                serverDllPath = path.join(serverDllPath, languageServerDllName);
            }
        }

        // The debug options for the server
        // let debugOptions = { execArgv: ['-lsp', '-d' };

        // These trace levels are available in the server:
        //   Trace
        //   Debug
        //   Information
        //   Warning
        //   Error
        //   Critical
        //   None
        let trace: string = workspace.getConfiguration('armTools').get<string>("languageServer.traceLevel");

        let commonArgs = [
            serverDllPath,
            '--logLevel',
            trace
        ];

        if (workspace.getConfiguration('armTools').get<boolean>('languageServer.waitForDebugger', false) === true) {
            commonArgs.push('--wait-for-debugger');
        }
        if (ext.addCompletionDiagnostic) {
            // Forces the server to add a completion message to its diagnostics
            commonArgs.push('--verbose-diagnostics');
        }

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        let serverOptions: ServerOptions = {
            run: {
                command: serverExe, args: commonArgs, options: { shell: true }
            },
            debug: {
                command: serverExe, args: commonArgs, options: { shell: true }
            },
        };

        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            documentSelector: armDeploymentDocumentSelector,
        };

        // Create the language client and start the client.
        ext.outputChannel.appendLine(`Starting ARM Language Server at ${serverDllPath}`);
        ext.outputChannel.appendLine(`Client options:\n${JSON.stringify(clientOptions, null, 2)}`);
        ext.outputChannel.appendLine(`Server options:\n${JSON.stringify(serverOptions, null, 2)}`);
        const client = new LanguageClient(armDeploymentLanguageId, languageServerName, serverOptions, clientOptions);

        let defaultHandler = client.createDefaultErrorHandler();
        client.clientOptions.errorHandler = new WrappedErrorHandler(defaultHandler);

        try {
            serverStartMs = Date.now();
            let disposable = client.start();
            context.subscriptions.push(disposable);
        } catch (error) {
            throw new Error(
                // tslint:disable-next-line: prefer-template
                `${languageServerName}: unexpectedly failed to start.\n\n` +
                parseError(error).message);
        }
    });
}

// tslint:disable-next-line:no-suspicious-comment
// TODO: Verify error handling
class WrappedErrorHandler implements ErrorHandler {
    constructor(private _handler: ErrorHandler) {
    }

    /**
     * An error has occurred while writing or reading from the connection.
     *
     * @param error - the error received
     * @param message - the message to be delivered to the server if known.
     * @param count - a count indicating how often an error is received. Will
     *  be reset if a message got successfully send or received.
     */
    public error(error: Error, message: Message | undefined, count: number): ErrorAction {
        let parsed = parseError(error);
        ext.reporter.sendTelemetryEvent(
            languageServerErrorTelemId,
            <TelemetryProperties>{
                error: parsed.errorType,
                errorMessage: parsed.message,
                result: "Failed",
                jsonrpcMessage: message ? message.jsonrpc : "",
                count: String(count),
                stack: parsed.stack
            },
            {
                secondsSinceStart: (Date.now() - serverStartMs) / 1000
            });

        return this._handler.error(error, message, count);
    }

    /**
     * The connection to the server got closed.
     */
    public closed(): CloseAction {
        ext.reporter.sendTelemetryEvent(
            languageServerErrorTelemId,
            <TelemetryProperties>{
                error: "Crashed",
                errorMessage: '(Language server crashed)',
                result: "Failed"
            },
            {
                secondsSinceStart: (Date.now() - serverStartMs) / 1000
            });

        return this._handler.closed();
    }
}
