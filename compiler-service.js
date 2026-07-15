const DEFAULT_API_URL = 'https://wandbox.org/api';
const COMPILER_CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30000;

let compilerCache = { expiresAt: 0, items: [] };

function getApiUrl() {
    return String(process.env.WANDBOX_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
}

function compilerServiceError(message, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.code = 'COMPILER_SERVICE_UNAVAILABLE';
    return error;
}

async function requestJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${getApiUrl()}${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        const raw = await response.text();
        let data;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch (_) {
            throw compilerServiceError(`Compiler service returned an invalid response (${response.status})`);
        }
        if (!response.ok) {
            throw compilerServiceError(data.message || `Compiler service request failed (${response.status})`);
        }
        return data;
    } catch (error) {
        if (error.code === 'COMPILER_SERVICE_UNAVAILABLE') throw error;
        if (error.name === 'AbortError') throw compilerServiceError('Compiler service timed out', error);
        throw compilerServiceError('Compiler service is unavailable', error);
    } finally {
        clearTimeout(timeout);
    }
}

async function getCompilers() {
    if (compilerCache.expiresAt > Date.now() && compilerCache.items.length) return compilerCache.items;
    const items = await requestJson('/list.json', { method: 'GET' });
    if (!Array.isArray(items) || !items.length) throw compilerServiceError('Compiler service reported no runtimes');
    compilerCache = { items, expiresAt: Date.now() + COMPILER_CACHE_TTL_MS };
    return items;
}

function chooseCompiler(compilers, language) {
    const environmentOverride = process.env[`WANDBOX_COMPILER_${language.toUpperCase()}`];
    if (environmentOverride) return environmentOverride;

    const stableMatchers = {
        python: item => item.language === 'Python' && /^cpython-3\.\d+\.\d+$/.test(item.name),
        c: item => item.language === 'C' && /^gcc-\d+(?:\.\d+)*-c$/.test(item.name),
        cpp: item => item.language === 'C++' && /^gcc-\d+(?:\.\d+)*$/.test(item.name),
        java: item => item.language === 'Java' && /^openjdk-jdk-\d+\+\d+$/.test(item.name)
    };
    const fallbackMatchers = {
        python: item => item.language === 'Python' && item.name.startsWith('cpython-'),
        c: item => item.language === 'C' && /(?:gcc|clang)/.test(item.name),
        cpp: item => item.language === 'C++' && /(?:gcc|clang)/.test(item.name),
        java: item => item.language === 'Java'
    };
    const compiler = compilers.find(stableMatchers[language]) || compilers.find(fallbackMatchers[language]);
    if (!compiler) throw compilerServiceError(`No ${language} compiler is currently available`);
    return compiler.name;
}

function prepareSourceCode(code, language) {
    if (language !== 'java') return code;
    // Wandbox compiles Java as prog.java. Removing the public modifier lets
    // lessons use any sensible class name while preserving program behavior.
    return code.replace(/\bpublic\s+(?=(?:abstract\s+|final\s+)?class\s+[A-Za-z_$][\w$]*)/, '');
}

function normalizeOutput(value) {
    return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function mapExecutionResult(data, testCase) {
    const stdout = String(data.program_output || '');
    const compilerError = String(data.compiler_error || data.compiler_message || '').trim();
    const runtimeError = String(data.program_error || '').trim();
    const context = {
        input: String(testCase.input || ''),
        expectedOutput: String(testCase.expected_output || '')
    };

    if (compilerError) {
        return { ...context, passed: false, status: 'compile_error', stdout, stderr: compilerError };
    }
    if (runtimeError || String(data.status) !== '0') {
        return {
            ...context,
            passed: false,
            status: 'runtime_error',
            stdout,
            stderr: runtimeError || 'Program exited with a non-zero status'
        };
    }

    const passed = normalizeOutput(stdout) === normalizeOutput(testCase.expected_output);
    return { ...context, passed, status: passed ? 'passed' : 'failed', stdout, stderr: '' };
}

async function executeCode(code, language, testCases) {
    if (!['python', 'c', 'cpp', 'java'].includes(language)) {
        throw compilerServiceError(`Unsupported compiler language: ${language}`);
    }

    const compilers = await getCompilers();
    const compiler = chooseCompiler(compilers, language);
    const preparedCode = prepareSourceCode(String(code), language);

    const results = await Promise.all(testCases.map(async testCase => {
        const data = await requestJson('/compile.json', {
            method: 'POST',
            body: JSON.stringify({
                compiler,
                code: preparedCode,
                stdin: String(testCase.input || ''),
                options: ''
            })
        });
        return mapExecutionResult(data, testCase);
    }));

    return { compiler, results };
}

module.exports = {
    executeCode,
    normalizeOutput,
    prepareSourceCode,
    chooseCompiler,
    mapExecutionResult
};
