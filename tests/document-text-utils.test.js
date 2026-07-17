const assert = require('assert');
const {
    extractPowerPointText,
    extractSpreadsheetText,
    hasUsableText,
    normalizeExtractedText
} = require('../document-text-utils');
const formatter = require('../public/document-formatter');
const aiService = require('../ai-service');

const presentationAst = {
    content: [
        {
            type: 'slide',
            metadata: { slideNumber: 1 },
            children: [
                { type: 'heading', text: 'Quarterly Results' },
                { type: 'paragraph', text: 'Revenue increased by 12.5% in 2024.' },
                { type: 'paragraph', text: '1' }
            ]
        },
        {
            type: 'slide',
            metadata: { slideNumber: 2 },
            children: [
                { type: 'paragraph', text: '2' },
                {
                    type: 'table',
                    children: [
                        {
                            type: 'row',
                            children: [
                                { type: 'cell', text: '2023' },
                                { type: 'cell', text: '100' }
                            ]
                        },
                        {
                            type: 'row',
                            children: [
                                { type: 'cell', text: '2024' },
                                { type: 'cell', text: '112.5' }
                            ]
                        }
                    ]
                },
                { type: 'paragraph', text: 'Slide 2 of 2' }
            ]
        }
    ]
};

const presentationText = extractPowerPointText(presentationAst);
assert(!presentationText.split('\n').includes('1'), 'trailing slide 1 footer should be removed');
assert(!presentationText.includes('Slide 2 of 2'), 'slide counter footer should be removed');
assert(presentationText.includes('12.5%'), 'legitimate percentages must remain');
assert(presentationText.includes('2024\t112.5'), 'legitimate numerical table data must remain');
assert(presentationText.includes('\f'), 'slide boundaries should remain available to the formatter');

const spreadsheetAst = {
    content: [
        {
            type: 'sheet',
            metadata: { sheetName: 'Marks' },
            children: [
                {
                    type: 'row',
                    children: [
                        { type: 'cell', text: 'Student' },
                        { type: 'cell', text: 'Score' }
                    ]
                },
                {
                    type: 'row',
                    children: [
                        { type: 'cell', text: 'A01' },
                        { type: 'cell', text: '98.75' }
                    ]
                }
            ]
        }
    ]
};

const spreadsheetText = extractSpreadsheetText(spreadsheetAst);
assert(spreadsheetText.includes('A01\t98.75'), 'spreadsheet values should remain tab-separated');
assert(hasUsableText('123456'), 'number-only documents should count as usable text');
assert.strictEqual(normalizeExtractedText(' 10\u00a020 \r\n30 '), '10 20\n30');
assert.strictEqual(aiService.getMimeType('xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

const formattedBlocks = formatter.parse(spreadsheetText);
assert(formattedBlocks.some(block => block.type === 'table'), 'tab-separated numerical rows should render as a table');

console.log('Document extraction and formatting tests passed.');
