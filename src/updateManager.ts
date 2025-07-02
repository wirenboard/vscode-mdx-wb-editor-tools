import * as vscode from 'vscode';
import axios from 'axios';
import * as semver from 'semver';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

export class UpdateManager {
  private readonly autoUpdate: boolean;
  private readonly updateCheckIntervalHours: number;
  constructor(private context: vscode.ExtensionContext) {
    const cfg = vscode.workspace.getConfiguration('wirenboard.vscode-mdx-wb-editor-tools');
    this.autoUpdate = cfg.get<boolean>('autoUpdate', true);
    this.updateCheckIntervalHours = cfg.get<number>('updateCheckIntervalHours', 24);
  }

  public async checkForUpdates(): Promise<void> {
    if (!this.autoUpdate) {
      console.log('Auto‐update disabled');
      return;
    }
  
    if (this.updateCheckIntervalHours !== 0) {
    const lastCheckTime = this.context.globalState.get<number>('lastUpdateCheckTime');
    const currentTime = Date.now();
    const updateCheckIntervalMs = this.updateCheckIntervalHours * 60 * 60 * 1000;

    if (lastCheckTime && (currentTime - lastCheckTime) < updateCheckIntervalMs) {
      console.log(`Update check skipped (next check in ${Math.ceil((updateCheckIntervalMs - (currentTime - lastCheckTime)) / (60 * 60 * 1000))} hours)`);
      return;
    }
    }

    try {
      const pkgPath = path.join(this.context.extensionPath, 'package.json');
      const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf-8'));
      const current = pkg.version as string;

      if (!pkg.repository?.url) {
        throw new Error('Repository URL not found in package.json');
      }

      const repoUrl = new URL(pkg.repository.url);
      if (repoUrl.hostname !== 'github.com') {
        throw new Error('Non-GitHub repositories are not supported');
      }

      const [, owner, repo] = repoUrl.pathname.match(/\/([^\/]+)\/([^\/]+?)(?:\.git)?$/) || [];
      if (!owner || !repo) {
        throw new Error('Could not parse repository owner/name');
      }

      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      const releasesUrl = `https://github.com/${owner}/${repo}/releases`;

      const { data } = await axios.get(apiUrl);
      const latest = (data.tag_name as string).replace(/^v/, '');

      console.debug(`Auto‐update check (current: ${current}, latest: ${latest})`);

      if (semver.gt(latest, current)) {
        const choice = await vscode.window.showInformationMessage(
          `Version ${latest} is available`,
          'Update',
          'View Changes',
          'Later'
        );
  
        if (choice === 'View Changes') {
          await vscode.env.openExternal(vscode.Uri.parse(releasesUrl));
          await this.checkForUpdates();
        }
        else if (choice === 'Update') {
          await this.downloadAndInstall(data);
        }
      }

      if (this.updateCheckIntervalHours !== 0) {
        await this.context.globalState.update('lastUpdateCheckTime', Date.now());
    }
    } catch (err) {
      console.error('Update check error:', err);
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to check for updates: ${message}`);
  }
  }
  
  private async downloadAndInstall(release: any): Promise<void> {
    const asset = release.assets.find((a: any) => a.name.endsWith('.vsix'));
    if (!asset) {
      vscode.window.showWarningMessage('VSIX not found in release');
      return;
    }

    const tmp = path.join(os.tmpdir(), `ext-${release.tag_name}.vsix`);
    const resp = await axios.get(asset.browser_download_url, { responseType: 'stream' });
    await streamPipeline(resp.data, fs.createWriteStream(tmp));

    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      vscode.Uri.file(tmp)
    );

    const reload = await vscode.window.showInformationMessage(
      'Updated, reload now?',
      'Reload'
    );
    if (reload === 'Reload') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}