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
  private statusMessage: vscode.Disposable | undefined;

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
      this.updateStatus("Проверка локальных изменений...");
      const status = await this.git.status();
      if (status.files.length > 0) {
        this.updateStatus("Обнаружены незакоммиченные изменения...");
        const choice = await this.handleUncommittedChanges();
        if (!choice) return;
      }

      this.updateStatus("Получение списка веток...");
      const { branches } = await this.git.branchLocal();

      this.updateStatus("Подготовка к переключению...");
      const selected = await vscode.window.showQuickPick(
        Object.values(branches)
          .filter((b) => !b.current)
          .map((b) => ({ label: b.name, description: b.commit.slice(0, 7) })),
        { placeHolder: "Выберите ветку для переключения" }
      );

      if (selected) {
        this.updateStatus(`Переключение на ${selected.label}...`);
        await this.git.checkout(selected.label);
        await this.syncBranch(selected.label);
        this.showMessage(
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
        const branchName = await this.showInput({
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
      this.updateStatus(`Синхронизация ${branchName}...`);
      await this.git.fetch();

      this.updateStatus(`Получение изменений для ${branchName}...`);
      const pullOutput = await this.git.raw(["pull", "origin", branchName]); // Получаем сырой вывод
  
      if (pullOutput.includes("CONFLICT")) {
        this.showError(
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
        const branchName = await this.showInput({
          prompt: "Введите имя ветки для сохранения изменений",
          placeHolder: "feature/my-feature",
        });
        if (!branchName) return;

        await this.git.checkoutLocalBranch(branchName);
        await this.git.add(".");
        await this.git.commit("Auto commit before switching to main");
      }

      await this.git.checkout("main");
      this.showMessage("Переключено на ветку main");
    } catch (err) {
      this.showError(err);
    }
  }

  private async createBranch() {
    const branchName = await this.showInput({
      prompt: "Введите имя новой ветки",
      placeHolder: "feature/my-feature",
    });
    if (!branchName) return;

    try {
      await this.git.checkoutLocalBranch(branchName);
      this.showMessage(`Создана ветка ${branchName}`);
    } catch (err) {
      this.showError(err);
    }
  }

  private async pushChanges() {
    try {
      if (!(await this.hasChangesToPush())) return;
      
      const currentBranch = await this.ensureNotMainBranch();
      await this.commitChanges(currentBranch);
  
      const isNewBranch = await this.isNewRemoteBranch(currentBranch);
      await this.handlePush(currentBranch, isNewBranch);
  
      this.showMessage("Изменения успешно отправлены");
    } catch (err) {
      this.showError(err);
    }
  }
  
  private async hasChangesToPush(): Promise<boolean> {
    const status = await this.git.status();
    if (status.files.length === 0) {
      this.showMessage("Нет изменений для отправки");
      return false;
    }
    return true;
  }
  
  private async ensureNotMainBranch(): Promise<string> {
    let currentBranch = (await this.git.branch()).current;
    if (currentBranch === "main") {
      const branchName = await this.showInput({
        prompt: "Нельзя коммитить в main. Введите имя новой ветки",
        placeHolder: "feature/my-feature",
      });
      if (!branchName) throw new Error("Отменено создание ветки");
      
      await this.git.checkoutLocalBranch(branchName);
      currentBranch = branchName;
    }
    return currentBranch;
  }
  
  private async commitChanges(branchName: string): Promise<void> {
    await this.git.add(".");
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const status = await this.git.status();
    const commitMessage = await this.commitEditor.showFromStatus(status, workspacePath);
    
    if (!commitMessage) {
      await this.git.reset();
      throw new Error("Коммит отменён");
    }
    await this.git.commit(commitMessage);
  }
  
  private async isNewRemoteBranch(branchName: string): Promise<boolean> {
    const remoteBranches = await this.git.listRemote(["--heads"]);
    return !remoteBranches.includes(`refs/heads/${branchName}`);
  }
  
  private async handlePush(branchName: string, isNewBranch: boolean): Promise<void> {
    if (isNewBranch) {
      await this.git.push("origin", branchName);
      return;
    }
  
    if (!(await this.isBranchInSync(branchName))) {
      await this.handleOutOfSyncBranch(branchName);
    } else {
      await this.git.push();
    }
  }
  
  private async isBranchInSync(branchName: string): Promise<boolean> {
    this.updateStatus("Проверка изменений на сервере...");
    await this.git.fetch();
    const localCommit = await this.git.revparse([branchName]);
    const remoteCommit = await this.git.revparse([`origin/${branchName}`]);
    return localCommit === remoteCommit;
  }
  
  private async handleOutOfSyncBranch(branchName: string): Promise<void> {
    const repoUrl = await this.getNormalizedRepoUrl();
    const branchUrl = `${repoUrl}/tree/${branchName}`;
    
    const choice = await vscode.window.showWarningMessage(
      `Ветка ${branchName} была изменена на сервере. Сначала синхронизируйте изменения.`,
      "Синхронизировать"
    );
  
    if (choice === "Синхронизировать") {
      await this.syncCurrentBranch();
      throw new Error("Повторите отправку после синхронизации");
    }
    throw new Error("Отправка отменена");
  }
  
  private async getNormalizedRepoUrl(): Promise<string> {
    let repoUrl = await this.git.remote(["get-url", "origin"]);
    if (typeof repoUrl !== 'string') throw new Error("Не удалось получить URL репозитория");
    
    repoUrl = repoUrl.trim();
    if (repoUrl.startsWith('git@')) {
      return repoUrl
        .replace('git@', 'https://')
        .replace(':', '/')
        .replace('.git', '');
    }
    return repoUrl.replace('.git', '');
  }
  
  private async openBranchInBrowser(url: string): Promise<void> {
    try {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    } catch (e) {
      throw new Error(`Невозможно открыть URL: ${url}. Проверьте настройки репозитория.`);
    }
  }

  private async cleanBranches() {
    try {
      this.updateStatus("Синхронизация информации о ветках...");
      await this.git.fetch(["--prune"]);
  
      const currentBranch = (await this.git.branch()).current;
      const localBranches = (await this.git.branchLocal()).all;
      const remoteBranches = new Set(
        (await this.git.listRemote(["--heads"]))
          .split("\n")
          .map(ref => ref.replace("refs/heads/", ""))
      );
  
      const branchesToDelete = localBranches
        .filter(branch => 
          branch !== currentBranch && 
          branch !== "main" && 
          !remoteBranches.has(branch)
        );
  
      if (branchesToDelete.length === 0) {
        this.showMessage("Нет локальных веток для удаления");
        return;
      }
  
      const selected = await vscode.window.showQuickPick(
        branchesToDelete.map(branch => ({
          label: branch,
          description: "Только локальная ветка",
          picked: true // Выбраны по умолчанию
        })), {
          canPickMany: true,
          placeHolder: "Выберите ветки для удаления",
        }
      );
  
      if (selected?.length) {
        await Promise.all(
          selected.map(branch => 
            this.git.branch(["-D", branch.label])
          )
        );
        this.showMessage(`Удалено веток: ${selected.length}`);
      }
    } catch (err) {
      this.showError(err);
    }
  }

  private async syncCurrentBranch() {
    try {
      const current = (await this.git.branch()).current;
      if (!current) {
        this.showMessage(
          "Не удалось определить текущую ветку"
        );
        return;
      }
      await this.syncBranch(current);
      this.showMessage(
        `Ветка ${current} синхронизирована с origin/${current}`
      );
    } catch (err) {
      this.showError(err);
    }
  }


  private updateStatus(message: string, timeout?: number) {
    this.clearStatus();
    if (timeout) {
      this.statusMessage = vscode.window.setStatusBarMessage(message, timeout);
    } else {
      this.statusMessage = vscode.window.setStatusBarMessage(message);
    }
  }

  private clearStatus() {
    if (this.statusMessage) {
      this.statusMessage.dispose();
      this.statusMessage = undefined;
    }
  }

  private showMessage(message: string) {
    vscode.window.showInformationMessage(message);
    this.updateStatus(message, 3000);
  }

  private showError(err: unknown) {
    const message = `Ошибка: ${err instanceof Error ? err.message : String(err)}`;
    vscode.window.showErrorMessage(message);
    this.updateStatus(message, 5000);
  }

  private async showInput(options: {
    prompt: string;
    placeHolder?: string;
    value?: string;
    validateInput?: (value: string) => string | undefined;
  }): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      ...options,
      ignoreFocusOut: true // Позволяет не терять фокус при переключении окон
    });
  }

  dispose() {
    this.statusBarItem.dispose();
  }
}
