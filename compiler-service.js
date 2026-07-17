const DEFAULT_API_URL = 'https://wandbox.org/api';
const COMPILER_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 45000;
const DEFAULT_MAX_RETRIES = 2;

let compilerCache = { expiresAt: 0, items: [] };

function getApiUrl() {
    return String(process.env.WANDBOX_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
}

function getPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function getRequestTimeoutMs() {
    return getPositiveInteger(process.env.WANDBOX_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS);
}

function getMaxRetries() {
    return Math.min(5, getPositiveInteger(process.env.WANDBOX_MAX_RETRIES, DEFAULT_MAX_RETRIES));
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function compilerServiceError(message, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.code = 'COMPILER_SERVICE_UNAVAILABLE';
    return error;
}

async function requestJson(path, options = {}) {
    const maxRetries = getMaxRetries();
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs());
        let retryAfterMs = 0;

        try {
            const response = await fetch(`${getApiUrl()}${path}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Notezilla/2.0 Wandbox Client',
                    ...options.headers
                }
            });
            const raw = await response.text();
            let data;
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch (_) {
                const invalidResponse = compilerServiceError(`Compiler service returned an invalid response (${response.status})`);
                invalidResponse.retryable = response.status === 200 || response.status >= 500;
                throw invalidResponse;
            }

            if (!response.ok) {
                const serviceMessage = String(data.message || `Compiler service request failed (${response.status})`).slice(0, 300);
                const requestError = compilerServiceError(serviceMessage);
                requestError.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
                const retryAfterSeconds = Number.parseInt(response.headers.get('retry-after'), 10);
                retryAfterMs = Number.isInteger(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0;
                throw requestError;
            }

            return data;
        } catch (error) {
            const isTimeout = error.name === 'AbortError';
            const isServiceError = error.code === 'COMPILER_SERVICE_UNAVAILABLE';
            const retryable = isTimeout || !isServiceError || error.retryable;
            lastError = isServiceError
                ? error
                : compilerServiceError(isTimeout ? 'Compiler service timed out' : 'Compiler service connection failed', error);

            if (!retryable || attempt >= maxRetries) break;
            clearTimeout(timeout);
            const delay = Math.max(retryAfterMs, 500 * (2 ** attempt));
            await wait(Math.min(delay, 5000));
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError || compilerServiceError('Compiler service is unavailable');
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
    if (environmentOverride) {
        const exists = compilers.some(item => item.name === environmentOverride && item.language);
        if (!exists) throw compilerServiceError(`Configured ${language} compiler "${environmentOverride}" is not available`);
        return environmentOverride;
    }

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
    const versionParts = item => String(item.version || item.name || '')
        .match(/\d+/g)?.map(Number) || [];
    const newestFirst = (left, right) => {
        const leftParts = versionParts(left);
        const rightParts = versionParts(right);
        const length = Math.max(leftParts.length, rightParts.length);
        for (let index = 0; index < length; index += 1) {
            const difference = (rightParts[index] || 0) - (leftParts[index] || 0);
            if (difference) return difference;
        }
        return String(right.name).localeCompare(String(left.name));
    };
    const compiler = compilers.filter(stableMatchers[language]).sort(newestFirst)[0]
        || compilers.filter(fallbackMatchers[language]).sort(newestFirst)[0];
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
    return String(value || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .trim();
}

function mapExecutionResult(data, testCase) {
    const stdout = String(data.program_output || '');
    const compilerError = String(data.compiler_error || '').trim();
    const compilerMessage = String(data.compiler_message || '').trim();
    const runtimeError = String(data.program_error || '').trim();
    const hasNonZeroStatus = data.status !== undefined
        && data.status !== null
        && String(data.status).trim() !== ''
        && String(data.status).trim() !== '0';
    const context = {
        input: String(testCase.input || ''),
        expectedOutput: String(testCase.expected_output || '')
    };

    if (compilerError || (hasNonZeroStatus && compilerMessage && !runtimeError)) {
        return { ...context, passed: false, status: 'compile_error', stdout, stderr: compilerError || compilerMessage };
    }
    if (runtimeError || hasNonZeroStatus) {
        return {
            ...context,
            passed: false,
            status: 'runtime_error',
            stdout,
            stderr: runtimeError || 'Program exited with a non-zero status'
        };
    }

    const passed = normalizeOutput(stdout) === normalizeOutput(testCase.expected_output);
    return {
        ...context,
        passed,
        status: passed ? 'passed' : (normalizeOutput(stdout) ? 'wrong_answer' : 'no_output'),
        stdout,
        stderr: ''
    };
}

async function executeCode(code, language, testCases) {
    if (!['python', 'c', 'cpp', 'java'].includes(language)) {
        throw compilerServiceError(`Unsupported compiler language: ${language}`);
    }

    const compilers = await getCompilers();
    const compiler = chooseCompiler(compilers, language);
    const preparedCode = prepareSourceCode(String(code), language);

    if (!Array.isArray(testCases) || testCases.length === 0 || testCases.length > 10) {
        throw compilerServiceError('A lesson must provide between 1 and 10 compiler test cases');
    }

    // Wandbox is a shared public service. Run cases sequentially to avoid
    // connection resets and rate limiting caused by parallel submissions.
    const results = [];
    for (const testCase of testCases) {
        const data = await requestJson('/compile.json', {
            method: 'POST',
            body: JSON.stringify({
                compiler,
                code: preparedCode,
                stdin: String(testCase.input || ''),
                options: ''
            })
        });
        results.push(mapExecutionResult(data, testCase));
    }

    return { compiler, results };
}

module.exports = {
    executeCode,
    normalizeOutput,
    prepareSourceCode,
    chooseCompiler,
    mapExecutionResult
};
