const vscode = require('vscode');
const { execFile } = require('child_process');

const STATUS_LABELS = {
  ' ': 'Initialized',
  '+': 'Different commit checked out',
  '-': 'Not initialized',
  U: 'Merge conflicts',
};

function resolveCwd(scm) {
  return scm?.rootUri?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseSubmoduleStatus(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([ U+-])([0-9a-f]+)\s+(\S+)(?:\s+\((.+)\))?$/i);
      if (!match) return undefined;
      const [, status, sha, path, describe] = match;
      return { status, sha, path, describe };
    })
    .filter(Boolean);
}

async function listSubmodules(cwd) {
  const { stdout } = await runGit(['submodule', 'status', '--recursive'], cwd);
  return parseSubmoduleStatus(stdout);
}

async function pickSubmodules(cwd, title) {
  let submodules;
  try {
    submodules = await listSubmodules(cwd);
  } catch (err) {
    vscode.window.showErrorMessage(err.stderr || err.message);
    return undefined;
  }

  if (!submodules.length) {
    vscode.window.showInformationMessage('No git submodules found in this repository.');
    return undefined;
  }

  const items = submodules.map((sub) => ({
    label: sub.path,
    description: sub.describe || sub.sha.slice(0, 7),
    detail: STATUS_LABELS[sub.status] || `Status: ${JSON.stringify(sub.status)}`,
    picked: true,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title,
    placeHolder: 'Select one or more submodules',
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected?.length) return undefined;
  return selected.map((item) => item.label);
}

async function runSubmoduleUpdate(scm, { flags, paths, label }) {
  const cwd = resolveCwd(scm);
  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const args = ['submodule', 'update', ...flags, '--', ...(paths || [])];
  const display = `git ${args.join(' ')}`;

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.SourceControl, title: `${label}…` },
    async () => {
      try {
        await runGit(args, cwd);
        const target = paths?.length ? paths.join(', ') : 'all submodules';
        vscode.window.showInformationMessage(`Done: ${label} (${target})`);
      } catch (err) {
        vscode.window.showErrorMessage(err.stderr || err.message || `Failed: ${display}`);
      }
    }
  );
}

const commandHandlers = {
  'submoduleUpdate.init': (scm) =>
    runSubmoduleUpdate(scm, {
      flags: ['--init', '--recursive'],
      label: 'Submodules Init',
    }),

  'submoduleUpdate.remote': (scm) =>
    runSubmoduleUpdate(scm, {
      flags: ['--remote', '--recursive'],
      label: 'Submodules Remote',
    }),

  'submoduleUpdate.initSelected': async (scm) => {
    const cwd = resolveCwd(scm);
    if (!cwd) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }
    const paths = await pickSubmodules(cwd, 'Submodules Init — select');
    if (!paths) return;
    return runSubmoduleUpdate(scm, {
      flags: ['--init', '--recursive'],
      paths,
      label: 'Submodules Init',
    });
  },

  'submoduleUpdate.remoteSelected': async (scm) => {
    const cwd = resolveCwd(scm);
    if (!cwd) {
      vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }
    const paths = await pickSubmodules(cwd, 'Submodules Remote — select');
    if (!paths) return;
    return runSubmoduleUpdate(scm, {
      flags: ['--remote', '--recursive'],
      paths,
      label: 'Submodules Remote',
    });
  },
};

exports.activate = (ctx) => {
  for (const [id, handler] of Object.entries(commandHandlers)) {
    ctx.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }
};
