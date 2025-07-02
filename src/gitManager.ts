import * as vscode from "vscode";
import { simpleGit, SimpleGit } from 'simple-git';
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
      vscode.commands.registerCommand("wirenboard.gitActions", () =>
        this.showQuickPick()
      ),
      vscode.commands.registerCommand("wirenboard.gitShowPreview", () =>
        this.showPreview()
      ),
      vscode.commands.registerCommand("wirenboard.gitSwitchToMain", () =>
        this.switchToMain()
      ),
      vscode.commands.registerCommand("wirenboard.gitCreateBranch", () =>
        this.createBranch()
      ),
      vscode.commands.registerCommand("wirenboard.gitPushChanges", () =>
        this.pushChanges()
      ),
      vscode.commands.registerCommand("wirenboard.gitCleanBranches", () =>
        this.cleanBranches()
      )
    );
  }

  private async showQuickPick() {
    const choice = await vscode.window.showQuickPick([
      {
        label: "$(eye) Показать предпросмотр",
        command: "wirenboard.gitShowPreview",
      },
      {
        label: "$(git-branch) Переключиться на main",
        command: "wirenboard.gitSwitchToMain",
      },
      {
        label: "$(git-branch) Создать ветку",
        command: "wirenboard.gitCreateBranch",
      },
      {
        label: "$(cloud-upload) Отправить изменения",
        command: "wirenboard.gitPushChanges",
      },
      {
        label: "$(trashcan) Почистить локальные ветки",
        command: "wirenboard.gitCleanBranches",
      },
    ]);

    if (choice) {
      await vscode.commands.executeCommand(choice.command);
    }
  }

  private async showPreview() {
    await vscode.commands.executeCommand(
      "vscode-mdx-wb-editor-tools.showPreview"
    );
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
      vscode.window.showErrorMessage(
        `Ошибка: ${err instanceof Error ? err.message : String(err)}`
      );
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
      vscode.window.showErrorMessage(
        `Ошибка: ${err instanceof Error ? err.message : String(err)}`
      );
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

      const tempUri = vscode.Uri.file(path.join(os.tmpdir(), `wb-commit-${Date.now()}.md`));
      const template = [
        "# Please enter the commit message for your changes.",
        "# Lines starting with '#' will be ignored, and an empty message aborts the commit.",
        "#",
        "# Changes to be committed:",
        ...status.files.map(f => `#\t${f.path}`),
        "#"
      ].join("\n");

      await vscode.workspace.fs.writeFile(tempUri, Buffer.from(template));
      const doc = await vscode.workspace.openTextDocument(tempUri);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One
      });

      await vscode.languages.setTextDocumentLanguage(doc, 'scminput');

      const commitBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
      commitBtn.text = "$(check) Commit";
      commitBtn.command = "wirenboard.commitConfirm";
      commitBtn.show();

      const cancelBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
      cancelBtn.text = "$(close) Cancel";
      cancelBtn.command = "wirenboard.commitCancel";
      cancelBtn.show();

      const commitMessage = await new Promise<string | undefined>(resolve => {
        const disposables: vscode.Disposable[] = [];

        const cleanup = async () => {
            disposables.forEach(d => d.dispose());
            commitBtn.dispose();
            cancelBtn.dispose();
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            try {
              await vscode.workspace.fs.delete(tempUri);
            } catch {}
        };

        disposables.push(
          vscode.commands.registerCommand("wirenboard.commitConfirm", async () => {
            const text = doc.getText();
            const message = text.split('\n')
              .filter(line => !line.trim().startsWith('#'))
              .join('\n')
              .trim();
            await cleanup();
            resolve(message || undefined);
          }),

          vscode.commands.registerCommand("wirenboard.commitCancel", async () => {
            await cleanup();
            resolve(undefined);
          }),

          vscode.window.onDidChangeVisibleTextEditors(async editors => {
            if (!editors.includes(editor)) {
              await cleanup();
              resolve(undefined);
            }
          })
      );
      });

      if (!commitMessage) {
        vscode.window.showInformationMessage("Коммит отменён");
        return;
      }

      await this.git.commit(commitMessage);
      await this.git.push();
    } catch (err) {
      vscode.window.showErrorMessage(
        `Ошибка: ${err instanceof Error ? err.message : String(err)}`
      );
    }
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
      vscode.window.showErrorMessage(
        `Ошибка: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}
