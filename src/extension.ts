import * as vscode from 'vscode';
import * as path from 'path';
import { parseQuery } from './fqlParser';
import { searchFiles } from './fqlSearcher';

export function activate(context: vscode.ExtensionContext) {
    // ── 命令面板：QFiler: 搜索文件 ──
    context.subscriptions.push(
        vscode.commands.registerCommand('qfiler.search', async () => {
            await runSearch(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
        })
    );

    // ── 右键菜单：QFiler: 从此目录搜索 ──
    context.subscriptions.push(
        vscode.commands.registerCommand('qfiler.searchFromDir', async (uri: vscode.Uri) => {
            await runSearch(uri?.fsPath);
        })
    );

    // ── 状态栏显示 ──
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 100
    );
    statusBar.text = "$(search) QFiler";
    statusBar.command = 'qfiler.search';
    statusBar.tooltip = "QFiler: 搜索文件";
    statusBar.show();
    context.subscriptions.push(statusBar);
}

async function runSearch(rootPath?: string) {
    const defaultRoot = rootPath || vscode.workspace.rootPath || '.';

    // ── 1. 输入查询 ──
    const query = await vscode.window.showInputBox({
        prompt: 'QFiler: 输入搜索条件（添加 --run 自动打开每个文件）',
        placeHolder: `${defaultRoot} [ex:sio] [fin:main]`,
        value: `${rootPath ? path.relative(vscode.workspace.rootPath || '.', rootPath) : '.'} `
    });
    if (!query) return;

    // ── 2. 解析 ──
    const parsed = parseQuery(query);
    const searchRoot = path.isAbsolute(parsed.rootPath)
        ? parsed.rootPath
        : path.join(vscode.workspace.rootPath || '.', parsed.rootPath);

    vscode.window.showInformationMessage(
        `QFiler: 搜索 ${searchRoot}（${parsed.filters.length} 个过滤器）`
    );

    // ── 3. 搜索 ──
    let files: string[];
    try {
        files = searchFiles(searchRoot, parsed.filters);
    } catch (err: any) {
        vscode.window.showErrorMessage(`QFiler 搜索失败: ${err.message}`);
        return;
    }

    if (files.length === 0) {
        vscode.window.showInformationMessage('QFiler: 没有找到匹配的文件');
        return;
    }

    // ── 4. 如果 --run，直接打开所有文件 ──
    if (parsed.runAfterSearch) {
        let opened = 0;
        for (const f of files) {
            try {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(f));
                opened++;
            } catch { /* 跳过打不开的 */ }
        }
        vscode.window.showInformationMessage(
            `QFiler: 已打开 ${opened}/${files.length} 个文件`
        );
        return;
    }

    // ── 5. 显示结果列表（让用户选择打开哪个）──
    const items = files.slice(0, 200).map(f => ({
        label: `$(file) ${path.basename(f)}`,
        description: path.relative(vscode.workspace.rootPath || '.', f),
        detail: `${(fs.statSync(f).size / 1024).toFixed(1)} KB`,
        filePath: f
    }));

    if (files.length > 200) {
        items.push({
            label: `... 还有 ${files.length - 200} 个文件`,
            description: '',
            detail: '',
            filePath: ''
        });
    }

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `找到 ${files.length} 个文件（选择打开，或输入 --run 自动打开全部）`,
        matchOnDescription: true,
        matchOnDetail: false
    });

    if (selected && selected.filePath) {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(selected.filePath));
    }
}

// 仅供 QuickPick 里显示文件大小用
import * as fs from 'fs';
