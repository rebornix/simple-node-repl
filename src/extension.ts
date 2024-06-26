import * as vscode from 'vscode';
import * as REPL from 'repl';
import { Writable, Readable } from 'stream';
import * as vm from 'vm';

export function activate(context: vscode.ExtensionContext) {
	const controller = vscode.notebooks.createNotebookController('nodeREPL', 'interactive', 'Node REPL');
	controller.supportedLanguages = ['javascript'];
	controller.description = 'Node.js REPL';

	let inputStream = new Readable({
		read: () => { }
	});

	const outputStream = new Writable({
		write: (chunk, encoding, callback) => { callback(); }
	});

	let customEval = (cmd: any, context: any, filename: any, callback: any) => { };

	let replServer: REPL.REPLServer | undefined;
	inputStream.push('');
	replServer = REPL.start({
		prompt: '',
		input: inputStream,
		output: outputStream,
		eval: (cmd, context, filename, callback) => {
			customEval(cmd, context, filename, callback);
		},
		terminal: false
	});

	const vmContext = vm.createContext();

	controller.executeHandler = async (cells: vscode.NotebookCell[], _notebook, _controller) => {
		for (const cell of cells) {
			const exec = controller.createNotebookCellExecution(cell);
			exec.start(Date.now());

			const code = cell.document.getText();
			let replOutput = '';

			await new Promise<void>((resolve) => {
				customEval = (cmd: any, context: any, filename: any, callback: any) => {
					let result;
					try {
						result = vm.runInContext(cmd, vmContext);
					} catch (e) {
						callback(e);
						resolve();
					}

					callback(null, result);
					replOutput = result;
					resolve();
				};

				inputStream.push(code + '\n');
			});

			exec.replaceOutput([
				new vscode.NotebookCellOutput([
					vscode.NotebookCellOutputItem.text(replOutput, 'text/plain')
				])
			]);

			exec.end(true);
		}
	};

	let notebookEditor: vscode.NotebookEditor | undefined;
	let notebookDocument: vscode.NotebookDocument | undefined;

	context.subscriptions.push(vscode.commands.registerCommand('simple-node-repl.new', async () => {
		if (!notebookEditor) {
			const interactiveWindowObject = (await vscode.commands.executeCommand(
				'interactive.open',
				{
					preserveFocus: true,
					viewColumn: vscode.ViewColumn.Beside,
				},
				undefined,
				controller.id,
				'Node REPL',
			)) as { notebookEditor: vscode.NotebookEditor };
			notebookEditor = interactiveWindowObject.notebookEditor;
			notebookDocument = interactiveWindowObject.notebookEditor.notebook;
		}

		if (notebookEditor && notebookDocument) {
			await vscode.window.showNotebookDocument(notebookDocument, { viewColumn: vscode.ViewColumn.Beside });
			controller.updateNotebookAffinity(notebookDocument, vscode.NotebookControllerAffinity.Default);

			await vscode.commands.executeCommand('notebook.selectKernel', {
				notebookEditor,
				id: controller.id,
				extension: 'rebornix.simple-node-repl',
			});
		}
	}));
}

// This method is called when your extension is deactivated
export function deactivate() { }
