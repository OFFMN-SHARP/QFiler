import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseQuery } from './fqlParser';
import { searchFiles } from './fqlSearcher';

// 用法提示列表
const helpItems: vscode.QuickPickItem[] = [
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(symbol-keyword)  QFiler 用法', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(file)  [ex:sio]      按后缀搜索', detail: '[ex:ts] [ex:json] [ex:sio]' },
    { label: '$(file)  [nhd:mai]     文件名开头', detail: '文件名以 mai 开头' },
    { label: '$(file)  [ned:.bin]    文件名结尾', detail: '文件名以 .bin 结尾' },
    { label: '$(file)  [nin:boot]    文件名包含', detail: '文件名包含 boot' },
    { label: '$(file)  [flnh:MZ]     文件头内容', detail: '搜索 PE 文件（MZ 开头）' },
    { label: '$(file)  [fled:0x55AA]  文件尾内容', detail: '搜索 MBR 引导文件' },
    { label: '$(file)  [fin:Hello]   文件内容搜索', detail: '搜索内容含 Hello 的文件' },
    { label: '$(file)  [fln(0):@ppc] 某行内容', detail: '搜索第 0 行含 @ppc 的文件' },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(run)  --run          搜索后打开所有文件', detail: '追加在查询末尾' },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(star)  示例', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(search)  . [ex:sio] [fin:main]', detail: '找 .sio 文件且内容含 main' },
    { label: '$(search)  ./src [nhd:mai] --run', detail: '找 src 下 mai 开头的文件并全部打开' },
    { label: '$(search)  . [flnh:MZ] [ex:dll]', detail: '找所有 DLL 文件' },
];

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('qfiler.search', async () => {
            await runSearch(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('qfiler.searchFromDir', async (uri: vscode.Uri) => {
            await runSearch(uri?.fsPath);
        })
    );

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = "$(search) QFiler";
    statusBar.command = 'qfiler.search';
    statusBar.tooltip = "QFiler: 搜索文件";
    statusBar.show();
    context.subscriptions.push(statusBar);
}

async function runSearch(rootPath?: string) {
    const defaultRoot = rootPath || vscode.workspace.rootPath || '.';
    const relRoot = rootPath ? path.relative(vscode.workspace.rootPath || '.', rootPath) : '.';

    // ── 创建自定义 QuickPick ──
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'QFiler 文件搜索';
    quickPick.placeholder = `${relRoot} [ex:sio] [fin:main]`;
    quickPick.value = `${relRoot} `;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = helpItems;
    quickPick.canSelectMany = false;
    quickPick.ignoreFocusOut = false;

    // ── 用户输入时更新提示和预览结果 ──
    quickPick.onDidChangeValue(async (value) => {
        if (!value.trim()) {
            quickPick.items = helpItems;
            return;
        }

        // 尝试解析查询，预览结果数量
        try {
            const parsed = parseQuery(value);
            if (parsed.filters.length === 0) {
                quickPick.items = helpItems;
                return;
            }

            const searchRoot = path.isAbsolute(parsed.rootPath)
                ? parsed.rootPath
                : path.join(vscode.workspace.rootPath || '.', parsed.rootPath);

            const files = searchFiles(searchRoot, parsed.filters);
            
            // 显示结果预览 + 用法提示
            const previewItems: vscode.QuickPickItem[] = [];

            if (files.length > 0) {
                previewItems.push({
                    label: `$(check) 找到 ${files.length} 个文件（回车查看详情）`,
                    description: `${parsed.filters.length} 个过滤器`
                });
                // 显示前 5 个文件名预览
                for (let i = 0; i < Math.min(5, files.length); i++) {
                    previewItems.push({
                        label: `  $(file) ${path.basename(files[i])}`,
                        description: path.relative(vscode.workspace.rootPath || '.', files[i])
                    });
                }
                if (files.length > 5) {
                    previewItems.push({
                        label: `  ... 还有 ${files.length - 5} 个文件`
                    });
                }
            } else {
                previewItems.push({
                    label: '$(warning) 没有找到匹配的文件'
                });
            }

            // 加一条分隔线，后面继续显示用法
            previewItems.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
            previewItems.push(...helpItems);

            quickPick.items = previewItems;
        } catch {
            quickPick.items = helpItems;
        }
    });

    // ── 用户选中某个条目或按回车 ──
    quickPick.onDidAccept(async () => {
        const query = quickPick.value;
        quickPick.hide();

        if (!query) return;

        const parsed = parseQuery(query);
        const searchRoot = path.isAbsolute(parsed.rootPath)
            ? parsed.rootPath
            : path.join(vscode.workspace.rootPath || '.', parsed.rootPath);

        vscode.window.showInformationMessage(
            `QFiler: 搜索 ${searchRoot}（${parsed.filters.length} 个过滤器）`
        );

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

        if (parsed.runAfterSearch) {
            let opened = 0;
            for (const f of files) {
                try {
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(f));
                    opened++;
                } catch { /* 跳过 */ }
            }
            vscode.window.showInformationMessage(
                `QFiler: 已打开 ${opened}/${files.length} 个文件`
            );
            return;
        }

        // 显示详细结果列表
        const items = files.slice(0, 200).map(f => ({
            label: `$(file) ${path.basename(f)}`,
            description: path.relative(vscode.workspace.rootPath || '.', f),
            detail: `${(fs.statSync(f).size / 1024).toFixed(1)} KB`,
            filePath: f
        } as vscode.QuickPickItem & { filePath: string }));

        if (files.length > 200) {
            items.push({
                label: `... 还有 ${files.length - 200} 个文件`,
                description: '',
                detail: '',
                filePath: ''
            } as any);
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `找到 ${files.length} 个文件`,
            matchOnDescription: true
        });

        if (selected && (selected as any).filePath) {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file((selected as any).filePath));
        }
    });

    quickPick.show();
}
