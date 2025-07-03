import * as vscode from "vscode";
import { ResetMode, simpleGit, SimpleGit, StatusResult } from "simple-git";
import * as path from "path";
import * as os from "os";
import { CommitEditor } from "./commitEditor";

interface GitBranch {
  name: string;
  commit: string;
  current: boolean;
}

export class GitManager {
  private readonly git: SimpleGit;
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly commitEditor: CommitEditor;

  constructor(private context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.git = simpleGit(workspaceFolder?.uri.fsPath || process.cwd());
    this.commitEditor = new CommitEditor(context);

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
      vscode.commands.registerCommand("wirenboard.gitSwitchBranch", () =>
        this.switchBranch()
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
      ),
      vscode.commands.registerCommand("wirenboard.gitSyncBranch", () =>
        this.syncCurrentBranch()
      )
    );
  }

  private async showQuickPick() {
    const choices = [
      {
        label: "$(git-branch) Переключить ветку",
        command: "wirenboard.gitSwitchBranch",
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
        label: "$(sync) Синхронизировать текущую ветку",
        command: "wirenboard.gitSyncBranch",
      },      
      {
        label: "$(cloud-upload) Отправить изменения",
        command: "wirenboard.gitPushChanges",
      },
      {
        label: "$(trashcan) Почистить локальные ветки",
        command: "wirenboard.gitCleanBranches",
      }
    ];
    const choice = await vscode.window.showQuickPick(choices);
    if (choice) await vscode.commands.executeCommand(choice.command);
  }

  private async switchBranch() {
    try {
      const status = await this.git.status();
      if (status.files.length > 0) {
        const choice = await this.handleUncommittedChanges();
        if (!choice) return;
      }

      const { branches } = await this.git.branchLocal();
      const selected = await vscode.window.showQuickPick(
        Object.values(branches)
          .filter((b) => !b.current)
          .map((b) => ({ label: b.name, description: b.commit.slice(0, 7) })),
        { placeHolder: "Выберите ветку для переключения" }
      );

      if (selected) {
        await this.git.checkout(selected.label);
        await this.syncBranch(selected.label);
        vscode.window.showInformationMessage(
          `Переключено на ветку ${selected.label}`
        );
      }
    } catch (err) {
      this.showError(err);
    }
  }

  private async handleUncommittedChanges(): Promise<boolean> {
    const choice = await vscode.window.showQuickPick([
      {
        label: "Сохранить в новую ветку",
        detail: "Создаст временную ветку с изменениями",
      },
      {
        label: "Отменить изменения",
        detail: "Удалит все незакоммиченные изменения",
      },
      { label: "Отмена", detail: "Прервать операцию" },
    ]);

    switch (choice?.label) {
      case "Сохранить в новую ветку":
        const branchName = await vscode.window.showInputBox({
          prompt: "Имя временной ветки",
        });
        if (!branchName) return false;
        await this.git.checkoutLocalBranch(branchName);
        await this.git.add(".");
        await this.git.commit("Auto-save changes");
        return true;
      case "Отменить изменения":
        await this.git.reset(ResetMode.HARD);
        return true;
      default:
        return false;
    }
  }

  private async syncBranch(branchName: string): Promise<boolean> {
    try {
      await this.git.fetch();
      const pullOutput = await this.git.raw(["pull", "origin", branchName]); // Получаем сырой вывод
  
      if (pullOutput.includes("CONFLICT")) {
        vscode.window.showErrorMessage(
          `Конфликты слияния в ветке ${branchName}! Исправьте их вручную.`
        );
        return false;
      }
      return true;
    } catch (err) {
      this.showError(err);
      return false;
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

      await this.syncBranch(currentBranch);
      
      await this.git.add(".");
      const workspacePath =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
      const commitMessage = await this.commitEditor.showFromStatus(
        status,
        workspacePath
      );
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

  private async cleanBranches() {
    try {
      await this.git.fetch(["--prune"]);

      const localBranches = (await this.git.branchLocal()).branches;
      const currentBranch = (await this.git.branch()).current;

      const remoteRefs = await this.git.raw(["ls-remote", "--heads", "origin"]);
      const remoteBranches = new Set(
        remoteRefs
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split("\t")[1].replace("refs/heads/", ""))
      );

      const branchesToClean = Object.entries(localBranches)
        .filter(
          ([name]) =>
            name !== currentBranch &&
            name !== "main" &&
            !remoteBranches.has(name)
        )
        .map(([name, branch]) => ({
          name,
          commit: branch.commit,
        }));

      const branchesToDelete = await vscode.window.showQuickPick(
        branchesToClean.map((b) => ({
          label: b.name,
          description: b.commit.slice(0, 7),
          detail: "Только локальная ветка",
        })),
        {
          canPickMany: true,
          placeHolder: "Выберите локальные ветки для удаления",
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

  private async syncCurrentBranch() {
    try {
      const current = (await this.git.branch()).current;
      if (!current) {
        vscode.window.showInformationMessage(
          "Не удалось определить текущую ветку"
        );
        return;
      }
      await this.syncBranch(current);
      vscode.window.showInformationMessage(
        `Ветка ${current} синхронизирована с origin/${current}`
      );
    } catch (err) {
      this.showError(err);
    }
  }

  private showError(err: unknown) {
    vscode.window.showErrorMessage(
      `Ошибка: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}
