import * as fs from 'fs';
import * as path from 'path';
import { FQLFilter } from './fqlParser';

export function searchFiles(rootPath: string, filters: FQLFilter[]): string[] {
    if (!fs.existsSync(rootPath)) return [];

    let files = collectAllFiles(rootPath);

    for (const f of filters) {
        files = files.filter(filePath => applyFilter(filePath, f));
    }

    return files;
}

function collectAllFiles(dir: string): string[] {
    const results: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // 跳过隐藏目录和 node_modules
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    results.push(...collectAllFiles(full));
                }
            } else {
                results.push(full);
            }
        }
    } catch { /* 无权限目录跳过 */ }
    return results;
}

function applyFilter(filePath: string, filter: FQLFilter): boolean {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);

    try {
        switch (filter.type) {
            case 'ex':   // 后缀 [ex:sio] → .sio
                return ext === '.' + filter.value;

            case 'nhd':  // 文件名开头 [nhd:mai] → main*
                return fileName.startsWith(filter.value);

            case 'ned':  // 文件名结尾 [ned:.bin] → *.bin
                return fileName.endsWith(filter.value);

            case 'nin':  // 文件名包含 [nin:boot] → *boot*
                return fileName.includes(filter.value);

            case 'flnh': { // 文件头内容 [flnh:MZ]
                const len = filter.value.length;
                const fd = fs.openSync(filePath, 'r');
                const buf = Buffer.alloc(len);
                fs.readSync(fd, buf, 0, len, 0);
                fs.closeSync(fd);
                return buf.toString() === filter.value;
            }

            case 'fled': { // 文件尾内容 [fled:0x55AA]
                const len = filter.value.length;
                const stat = fs.statSync(filePath);
                if (stat.size < len) return false;
                const fd = fs.openSync(filePath, 'r');
                const buf = Buffer.alloc(len);
                fs.readSync(fd, buf, 0, len, stat.size - len);
                fs.closeSync(fd);
                return buf.toString() === filter.value;
            }

            case 'fin': { // 文件内容全文 [fin:Hello]
                const content = fs.readFileSync(filePath, 'utf-8');
                return content.includes(filter.value);
            }

            case 'fln': { // 某行内容 [fln(2):3456]
                const lineNum = parseInt(filter.subType || '0');
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                return (lines[lineNum] || '').includes(filter.value);
            }

            default:
                return true;
        }
    } catch {
        return false;  // 无法读取的文件直接排除
    }
}
