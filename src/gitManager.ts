import * as vscode from "vscode";
import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import * as path from "path";
import * as os from "os";

interface GitBranch {
    name: string;
    commit: string;
    current: boolean;
}

export class GitManager {
  private readonly git: SimpleGit;
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(private context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.git = simpleGit(workspaceFolder?.uri.fsPath || process.cwd());

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.text = "$(git-branch) WB Git";
    this.statusBarItem.tooltip = "Wiren Board Git Actions";
    this.statusBarItem.command = "wirenboard.gitActions";
    this.statusBarItem.show();

    this.registerCommands();
  }

  private registerCommands() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand("wirenboard.gitActions", () => this.showQuickPick()),
      vscode.commands.registerCommand("wirenboard.gitSwitchBranch", () => this.switchBranch()),
      vscode.commands.registerCommand("wirenboard.gitSwitchToMain", () => this.switchToMain()),
      vscode.commands.registerCommand("wirenboard.gitCreateBranch", () => this.createBranch()),
      vscode.commands.registerCommand("wirenboard.gitPushChanges", () => this.pushChanges()),
      vscode.commands.registerCommand("wirenboard.gitCleanBranches", () => this.cleanBranches())
    );
  }

  private async showQuickPick() {
    const choices = [
      { label: "$(git-branch) Переключить ветку", command: "wirenboard.gitSwitchBranch" },
      { label: "$(git-branch) Переключиться на main", command: "wirenboard.gitSwitchToMain" },
      { label: "$(git-branch) Создать ветку", command: "wirenboard.gitCreateBranch" },
      { label: "$(cloud-upload) Отправить изменения", command: "wirenboard.gitPushChanges" },
      { label: "$(trashcan) Почистить локальные ветки", command: "wirenboard.gitCleanBranches" }
    ];
    const choice = await vscode.window.showQuickPick(choices);
    if (choice) await vscode.commands.executeCommand(choice.command);
  }

  private async switchBranch() {
    try {
      const { branches } = await this.git.branchLocal();
      const selected = await vscode.window.showQuickPick(
        Object.values(branches)
          .filter(b => !b.current)
          .map(b => ({ label: b.name, description: b.commit.slice(0, 7) })),
        { placeHolder: "Выберите ветку для переключения" }
      );

      if (selected) {
        await this.git.checkout(selected.label);
        vscode.window.showInformationMessage(`Переключено на ветку ${selected.label}`);
      }
    } catch (err) {
      this.showError(err);
    }
  }

  private async switchToMain() {
    try {
      const status = await this.git.status();
      if (status.files.length > 0) {
        const branchName = await vscode.window.showInputBox({
          prompt: "Введите имя ветки для сохранения изменений",
          placeHolder: "feature/my-feature",
        });
        if (!branchName) return;

        await this.git.checkoutLocalBranch(branchName);
        await this.git.add(".");
        await this.git.commit("Auto commit before switching to main");
      }

      await this.git.checkout("main");
      vscode.window.showInformationMessage("Переключено на ветку main");
    } catch (err) {
      this.showError(err);
    }
  }

  private async createBranch() {
    const branchName = await vscode.window.showInputBox({
      prompt: "Введите имя новой ветки",
      placeHolder: "feature/my-feature",
    });
    if (!branchName) return;

    try {
      await this.git.checkoutLocalBranch(branchName);
      vscode.window.showInformationMessage(`Создана ветка ${branchName}`);
    } catch (err) {
      this.showError(err);
    }
  }

  private async pushChanges() {
    try {
      const status = await this.git.status();
      if (status.files.length === 0) {
        vscode.window.showInformationMessage("Нет изменений для отправки");
        return;
      }

      let currentBranch = (await this.git.branch()).current;
      if (currentBranch === "main") {
        const branchName = await vscode.window.showInputBox({
          prompt: "Нельзя коммитить в main. Введите имя новой ветки",
          placeHolder: "feature/my-feature",
        });
        if (!branchName) return;

        await this.git.checkoutLocalBranch(branchName);
        currentBranch = branchName;
      }

      await this.git.add(".");
      const commitMessage = await this.showCommitEditor(status);
      if (!commitMessage) {
        vscode.window.showInformationMessage("Коммит отменён");
        return;
      }

      await this.git.commit(commitMessage);
      await this.git.push();
      vscode.window.showInformationMessage("Изменения успешно отправлены");
    } catch (err) {
      this.showError(err);
    }
  }

  private async showCommitEditor(status: StatusResult): Promise<string | undefined> {
    const panel = vscode.window.createWebviewPanel(
      'commitMessage',
      'Commit Message',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    return new Promise<string | undefined>((resolve) => {
      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { padding: 10px; }
            textarea { width: 100%; height: 200px; margin-bottom: 10px; }
            button { padding: 5px 10px; }
          </style>
        </head>
        <body>
          <h3>Changed files:</h3>
          <ul>
            ${status.files.map(f => `<li>${f.path}</li>`).join('')}
          </ul>
          <textarea id="message" placeholder="Enter commit message"></textarea>
          <div>
            <button id="submit">Commit</button>
            <button id="cancel">Cancel</button>
          </div>
          <script>
            const vscode = acquireVsCodeApi();
            document.getElementById('submit').addEventListener('click', () => {
              const message = document.getElementById('message').value;
              if (message.trim()) {
                vscode.postMessage({ command: 'submit', text: message });
              }
            });
            document.getElementById('cancel').addEventListener('click', () => {
              vscode.postMessage({ command: 'cancel' });
            });
          </script>
        </body>
        </html>
      `;

      panel.webview.onDidReceiveMessage(message => {
        if (message.command === 'submit') {
          resolve(message.text);
          panel.dispose();
        } else if (message.command === 'cancel') {
          resolve(undefined);
          panel.dispose();
        }
      });

      panel.onDidDispose(() => {
        resolve(undefined);
      });
    });
  }

  private async cleanBranches() {
    try {
      await this.git.fetch();
      const { branches } = await this.git.branch(["-a"]);

      const remoteBranches = new Set(
        Object.values(branches as Record<string, GitBranch>)
          .filter(b => b.name.startsWith("remotes/"))
          .map(b => b.name.replace(/^remotes\/[^\/]+\//, ''))
      );

      const worktrees = await this.git.raw(['worktree', 'list', '--porcelain']);
      const protectedBranches = new Set(
        worktrees.split('\n')
          .filter(line => line.startsWith('branch '))
          .map(line => line.replace('branch refs/heads/', ''))
      );

      const localBranches = Object.values(branches as Record<string, GitBranch>)
        .filter((b: GitBranch) =>
          !b.name.startsWith("remotes/") &&
          b.name !== "main" &&
          !remoteBranches.has(b.name) &&
          !protectedBranches.has(b.name)
        );

      const branchesToDelete = await vscode.window.showQuickPick(
        localBranches.map((b) => ({
          label: b.name,
          description: b.commit.slice(0, 7),
          detail: remoteBranches.has(b.name) ? "Есть на сервере" : undefined
        })),
        {
          canPickMany: true,
          placeHolder: "Выберите локальные ветки (без удалённых аналогов) для удаления"
        }
      );

      if (branchesToDelete?.length) {
        await Promise.all(
          branchesToDelete.map((b) => this.git.deleteLocalBranch(b.label, true))
        );
        vscode.window.showInformationMessage(
          `Удалено веток: ${branchesToDelete.length}`
        );
      }
    } catch (err) {
      this.showError(err);
    }
  }

  private showError(err: unknown) {
    vscode.window.showErrorMessage(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}
