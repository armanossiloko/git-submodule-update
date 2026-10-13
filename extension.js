const vscode = require('vscode');
const { exec } = require('child_process');

const commands = {
  'submoduleUpdate.init': 'git submodule update --init --recursive',
  'submoduleUpdate.remote': 'git submodule update --remote --recursive',
};

exports.activate = (ctx) => {
  for (const [id, cmd] of Object.entries(commands)) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand(id, (scm) => {
        const cwd = scm?.rootUri?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return vscode.window.withProgress(
          { location: vscode.ProgressLocation.SourceControl, title: `${cmd}…` },
          () => new Promise((resolve) =>
            exec(cmd, { cwd }, (err, _out, stderr) => {
              if (err) vscode.window.showErrorMessage(stderr || err.message);
              else vscode.window.showInformationMessage(`Done: ${cmd}`);
              resolve();
            }))
        );
      })
    );
  }
};
