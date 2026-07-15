(function initDocumentFormatter(root, factory) {
    const formatter = factory();
    if (typeof module === 'object' && module.exports) module.exports = formatter;
    if (root) root.NotezillaDocumentFormatter = formatter;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDocumentFormatter() {
    const bulletPattern = /^\s*(?:[•●▪◦‣*-]|(?:\d+|[A-Za-z])[.)])\s+(.+)$/;
    const sectionPattern = /^(?:chapter|unit|module|section|part|topic|lesson|appendix)\b/i;
    const numberedHeadingPattern = /^\d+(?:\.\d+){0,4}\s+[A-Z][^.!?]{1,100}$/;

    function isHeading(line, followsBlankLine) {
        if (!line || line.length > 120 || bulletPattern.test(line)) return false;

        const letters = line.replace(/[^A-Za-z]/g, '');
        const words = line.split(/\s+/).filter(Boolean);
        const isUppercase = letters.length >= 4 && letters === letters.toUpperCase();
        const isSection = sectionPattern.test(line);
        const isNumbered = numberedHeadingPattern.test(line);
        const titleCaseWords = words.filter(word => /^[A-Z][A-Za-z0-9&/'()-]*$/.test(word)).length;
        const looksLikeTitle = followsBlankLine
            && line.length <= 72
            && words.length >= 1
            && words.length <= 10
            && titleCaseWords / words.length >= 0.65
            && !/[.!?]$/.test(line);

        return isUppercase || isSection || isNumbered || looksLikeTitle;
    }

    function normalizeParagraphLines(lines) {
        return lines.reduce((text, line) => {
            if (!text) return line;
            if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line)) return `${text.slice(0, -1)}${line}`;
            return `${text} ${line}`;
        }, '').replace(/\s+/g, ' ').trim();
    }

    function parse(text) {
        const source = String(text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n?/g, '\n')
            .replace(/\f/g, '\n\f\n');
        const lines = source.split('\n');
        const blocks = [];
        let paragraphLines = [];
        let listItems = [];
        let tableRows = [];
        let followsBlankLine = true;

        const flushParagraph = () => {
            const value = normalizeParagraphLines(paragraphLines);
            if (value) blocks.push({ type: 'paragraph', text: value });
            paragraphLines = [];
        };
        const flushList = () => {
            if (listItems.length) blocks.push({ type: 'list', items: listItems });
            listItems = [];
        };
        const flushTable = () => {
            if (tableRows.length) blocks.push({ type: 'table', rows: tableRows });
            tableRows = [];
        };
        const flushAll = () => {
            flushParagraph();
            flushList();
            flushTable();
        };

        lines.forEach(rawLine => {
            if (rawLine === '\f') {
                flushAll();
                blocks.push({ type: 'pageBreak' });
                followsBlankLine = true;
                return;
            }

            const line = rawLine.replace(/[ \t]+$/g, '').trim();
            if (!line) {
                flushAll();
                followsBlankLine = true;
                return;
            }

            const bulletMatch = line.match(bulletPattern);
            if (bulletMatch) {
                flushParagraph();
                flushTable();
                listItems.push(bulletMatch[1].trim());
                followsBlankLine = false;
                return;
            }

            const columns = rawLine.includes('\t')
                ? rawLine.split(/\t+/).map(value => value.trim()).filter(Boolean)
                : (line.includes('|') ? line.split('|').map(value => value.trim()).filter(Boolean) : []);
            if (columns.length >= 2) {
                flushParagraph();
                flushList();
                tableRows.push(columns);
                followsBlankLine = false;
                return;
            }

            if (isHeading(line, followsBlankLine)) {
                flushAll();
                const level = /^(?:chapter|unit|module|part)\b/i.test(line) || /^[A-Z\s\d:&-]+$/.test(line) ? 2 : 3;
                blocks.push({ type: 'heading', level, text: line.replace(/:\s*$/, '') });
                followsBlankLine = false;
                return;
            }

            flushList();
            flushTable();
            paragraphLines.push(line.replace(/\s+/g, ' '));
            const paragraphLength = paragraphLines.reduce((sum, value) => sum + value.length + 1, 0);
            if (paragraphLength >= 320 && /[.!?]$/.test(line)) flushParagraph();
            // Some PDF/PPT extractors omit blank lines between a paragraph and
            // the next heading. A completed sentence is a safe section boundary.
            followsBlankLine = /[.!?]$/.test(line);
        });

        flushAll();
        return blocks;
    }

    return { parse };
}));
