export interface FQLQuery {
    rootPath: string;
    filters: FQLFilter[];
    runAfterSearch: boolean;
}

export interface FQLFilter {
    type: string;       // ex, nhd, ned, nin, flnh, fled, fin, fln
    value: string;
    subType?: string;   // fln(2) 里的 "2"
}

export function parseQuery(input: string): FQLQuery {
    let rootPath = '.';
    let runAfterSearch = false;
    const filters: FQLFilter[] = [];

    // 按空格分割，但保留引号内的内容
    const tokens = tokenize(input);

    for (const token of tokens) {
        if (token === '--run') {
            runAfterSearch = true;
            continue;
        }

        // 匹配 [ex:sio] [fln(2):Hello] 这种
        const filterMatch = token.match(/^\[(.+)\]$/);
        if (filterMatch) {
            const f = parseSingleFilter(filterMatch[1]);
            if (f) filters.push(f);
        } else if (!token.startsWith('[') && !token.startsWith('-')) {
            rootPath = token;
        }
    }

    return { rootPath, filters, runAfterSearch: runAfterSearch };
}

function tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (const ch of input) {
        if (inQuote) {
            if (ch === inQuote) {
                inQuote = null;
            } else {
                current += ch;
            }
        } else if (ch === '"' || ch === "'") {
            inQuote = ch;
        } else if (ch === ' ' || ch === '\t') {
            if (current) { tokens.push(current); current = ''; }
        } else {
            current += ch;
        }
    }
    if (current) tokens.push(current);
    return tokens;
}

function parseSingleFilter(input: string): FQLFilter | null {
    const colonIdx = input.indexOf(':');
    if (colonIdx < 0) return null;

    const typePart = input.substring(0, colonIdx);
    const value = input.substring(colonIdx + 1);

    // fln(2):Hello → { type: "fln", subType: "2", value: "Hello" }
    const parenMatch = typePart.match(/^(\w+)\((\d+)\)$/);
    if (parenMatch) {
        return { type: parenMatch[1], subType: parenMatch[2], value };
    }

    return { type: typePart, value };
}
