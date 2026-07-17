const assert = require('assert');

const originalFetch = global.fetch;
const originalRetries = process.env.WANDBOX_MAX_RETRIES;
const originalTimeout = process.env.WANDBOX_TIMEOUT_MS;

process.env.WANDBOX_MAX_RETRIES = '2';
process.env.WANDBOX_TIMEOUT_MS = '1000';

let listAttempts = 0;
let activeCompiles = 0;
let maxActiveCompiles = 0;

const compilerList = [
    { language: 'Python', name: 'cpython-3.12.0', version: '3.12.0' },
    { language: 'Python', name: 'cpython-3.14.0', version: '3.14.0' },
    { language: 'C', name: 'gcc-13.2.0-c', version: '13.2.0' },
    { language: 'C++', name: 'gcc-13.2.0', version: '13.2.0' },
    { language: 'Java', name: 'openjdk-jdk-22+36', version: '22' }
];

global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/list.json')) {
        listAttempts += 1;
        if (listAttempts === 1) throw new TypeError('simulated socket close');
        return new Response(JSON.stringify(compilerList), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (String(url).endsWith('/compile.json')) {
        activeCompiles += 1;
        maxActiveCompiles = Math.max(maxActiveCompiles, activeCompiles);
        const payload = JSON.parse(options.body);
        await new Promise(resolve => setTimeout(resolve, 5));
        activeCompiles -= 1;
        return new Response(JSON.stringify({
            status: '0',
            program_output: `${payload.stdin}\n`,
            compiler_message: 'non-fatal compiler note'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    throw new Error(`Unexpected URL: ${url}`);
};

const service = require('../compiler-service');

(async () => {
    try {
        const execution = await service.executeCode('print(input())', 'python', [
            { input: 'one', expected_output: 'one' },
            { input: 'two', expected_output: 'two' },
            { input: 'three', expected_output: 'three' }
        ]);

        assert.strictEqual(listAttempts, 2, 'transient compiler-list failures should retry');
        assert.strictEqual(execution.compiler, 'cpython-3.14.0', 'newest stable runtime should be selected');
        assert.strictEqual(maxActiveCompiles, 1, 'test cases must run sequentially');
        assert(execution.results.every(result => result.passed), 'successful outputs should pass');

        const warningResult = service.mapExecutionResult({
            status: '0',
            program_output: '42\n',
            compiler_message: 'warning: example warning'
        }, { input: '', expected_output: '42' });
        assert.strictEqual(warningResult.status, 'passed', 'compiler warnings must not become compile errors');

        const compileError = service.mapExecutionResult({
            status: '1',
            compiler_error: 'syntax error'
        }, { input: '', expected_output: '' });
        assert.strictEqual(compileError.status, 'compile_error');

        const noOutput = service.mapExecutionResult({
            status: '0',
            program_output: ''
        }, { input: '()', expected_output: 'true' });
        assert.strictEqual(noOutput.status, 'no_output', 'successful execution without stdout is not a sandbox failure');

        const wrongAnswer = service.mapExecutionResult({
            status: '0',
            program_output: 'false\n'
        }, { input: '()', expected_output: 'true' });
        assert.strictEqual(wrongAnswer.status, 'wrong_answer', 'mismatched stdout should be reported as a wrong answer');

        assert.strictEqual(service.normalizeOutput('value  \r\n\r\n'), 'value');
        assert(!/public\s+class/.test(service.prepareSourceCode('public class Main {}', 'java')));

        console.log('Compiler service tests passed.');
    } finally {
        global.fetch = originalFetch;
        if (originalRetries === undefined) delete process.env.WANDBOX_MAX_RETRIES;
        else process.env.WANDBOX_MAX_RETRIES = originalRetries;
        if (originalTimeout === undefined) delete process.env.WANDBOX_TIMEOUT_MS;
        else process.env.WANDBOX_TIMEOUT_MS = originalTimeout;
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
