(function initDsaContentFormatter(root, factory) {
    const formatter = factory();
    if (typeof module === 'object' && module.exports) module.exports = formatter;
    if (root) root.NotezillaDsaContentFormatter = formatter;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDsaContentFormatter() {
    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const normalizeMarkdown = (value) => String(value || '')
        .replace(/\\([*_`])/g, '$1')
        // AI output sometimes emits four opening stars but only two closing
        // stars. Normalize those runs into a valid bold marker pair.
        .replace(/\*{3,}(?=\S)/g, '**')
        .replace(/(\S)\*{3,}/g, '$1**');

    const toSafeHtml = (value) => {
        const codeSpans = [];
        let html = escapeHtml(normalizeMarkdown(value));

        html = html.replace(/`([^`\n]+)`/g, (_, code) => {
            const token = `\uE000${codeSpans.length}\uE001`;
            codeSpans.push(`<code>${code}</code>`);
            return token;
        });

        html = html
            .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
            // Do not leave malformed formatting markers visible in lessons.
            .replace(/\*\*/g, '')
            .replace(/__/g, '')
            .replace(/\n/g, '<br>');

        return html.replace(/\uE000(\d+)\uE001/g, (_, index) => codeSpans[Number(index)] || '');
    };

    return { normalizeMarkdown, toSafeHtml };
}));
