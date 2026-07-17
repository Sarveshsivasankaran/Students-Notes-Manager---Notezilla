const normalizeExtractedText = (value) => String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

const hasUsableText = (value) => {
    const meaningfulCharacters = normalizeExtractedText(value).match(/[\p{L}\p{N}]/gu) || [];
    return meaningfulCharacters.length >= 3;
};

const readNodeText = (node) => {
    if (!node || typeof node !== 'object') return '';

    const children = Array.isArray(node.children) ? node.children : [];
    const directText = normalizeExtractedText(node.text);

    if (node.type === 'row') {
        return children.map(readNodeText).join('\t').replace(/\t+$/g, '');
    }

    if (node.type === 'table' || node.type === 'sheet') {
        return children.map(readNodeText).filter(Boolean).join('\n');
    }

    if (directText) return directText;
    return children.map(readNodeText).filter(Boolean).join(node.type === 'cell' ? ' ' : '\n');
};

const isSlideNumberArtifact = (value, slideNumber, totalSlides) => {
    const normalized = normalizeExtractedText(value).replace(/\s+/g, ' ');
    if (!normalized || !Number.isInteger(slideNumber) || slideNumber < 1) return false;

    const escapedSlide = String(slideNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedTotal = String(totalSlides).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
        `^(?:${escapedSlide}|${escapedSlide}\\s*(?:/|of)\\s*${escapedTotal}|slide\\s+${escapedSlide}(?:\\s*(?:/|of)\\s*${escapedTotal})?)$`,
        'i'
    ).test(normalized);
};

const extractPowerPointText = (ast) => {
    const slides = Array.isArray(ast?.content)
        ? ast.content.filter(node => node?.type === 'slide')
        : [];

    if (slides.length === 0) return normalizeExtractedText(ast?.toText?.() || '');

    return slides.map((slide, index) => {
        const slideNumber = Number(slide.metadata?.slideNumber) || index + 1;
        const blocks = (slide.children || [])
            .map(readNodeText)
            .map(normalizeExtractedText)
            .filter(Boolean);

        // Slide-number fields are commonly represented as ordinary text boxes.
        // Remove them only at slide boundaries so lesson values and chart axes
        // remain untouched.
        while (blocks.length && isSlideNumberArtifact(blocks[0], slideNumber, slides.length)) blocks.shift();
        while (blocks.length && isSlideNumberArtifact(blocks[blocks.length - 1], slideNumber, slides.length)) blocks.pop();

        return blocks.filter((block, blockIndex) => blockIndex === 0 || block !== blocks[blockIndex - 1]).join('\n');
    }).filter(Boolean).join('\n\f\n');
};

const extractSpreadsheetText = (ast) => {
    const sheets = Array.isArray(ast?.content)
        ? ast.content.filter(node => node?.type === 'sheet')
        : [];

    if (sheets.length === 0) return normalizeExtractedText(ast?.toText?.() || '');

    return sheets.map((sheet, index) => {
        const sheetName = normalizeExtractedText(sheet.metadata?.sheetName || `Sheet ${index + 1}`);
        const rows = (sheet.children || [])
            .filter(node => node?.type === 'row')
            .map(readNodeText)
            .filter(row => row.replace(/\t/g, '').trim());
        return [`Sheet: ${sheetName}`, ...rows].join('\n');
    }).filter(Boolean).join('\n\f\n');
};

module.exports = {
    extractPowerPointText,
    extractSpreadsheetText,
    hasUsableText,
    normalizeExtractedText,
    readNodeText
};
