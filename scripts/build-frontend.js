const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'public');
const outputDir = path.join(projectRoot, '.dist');
const runtimeConfigPath = path.join(outputDir, 'runtime-config.js');
const placeholder = '__NOTEZILLA_RAILWAY_BACKEND_URL__';
const backendUrl = String(process.env.RAILWAY_BACKEND_URL || '').trim().replace(/\/+$/, '');

if (process.env.VERCEL && !backendUrl) {
    throw new Error('RAILWAY_BACKEND_URL must be set in the Vercel project environment variables.');
}

if (backendUrl
    && !/^https:\/\//i.test(backendUrl)
    && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(backendUrl)) {
    throw new Error('RAILWAY_BACKEND_URL must be a public HTTPS URL (or localhost for testing).');
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.cpSync(sourceDir, outputDir, { recursive: true });

const runtimeSource = fs.readFileSync(runtimeConfigPath, 'utf8');
fs.writeFileSync(
    runtimeConfigPath,
    runtimeSource.replace(placeholder, backendUrl || placeholder)
);

const webFiles = [];
const collectWebFiles = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) collectWebFiles(fullPath);
        else if (/\.(?:html|css)$/i.test(entry.name)) webFiles.push(fullPath);
    }
};

const referencePatterns = [
    /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi
];
const localExtensions = /\.(?:avif|css|gif|html?|ico|jpe?g|js|mjs|mp3|ogg|png|svg|wav|webp)(?:[?#].*)?$/i;
const missingReferences = [];

const existsWithExactCase = (targetPath) => {
    const relativePath = path.relative(outputDir, targetPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return false;

    let currentPath = outputDir;
    for (const segment of relativePath.split(path.sep).filter(Boolean)) {
        const entries = fs.readdirSync(currentPath);
        if (!entries.includes(segment)) return false;
        currentPath = path.join(currentPath, segment);
    }

    return fs.existsSync(currentPath);
};

collectWebFiles(outputDir);

for (const filePath of webFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const pattern of referencePatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(source)) !== null) {
            const rawReference = match[1].trim();
            if (!localExtensions.test(rawReference)
                || /^(?:[a-z]+:|\/\/|#|data:)/i.test(rawReference)) {
                continue;
            }

            const cleanReference = decodeURIComponent(rawReference.split(/[?#]/, 1)[0]);
            const resolvedPath = cleanReference.startsWith('/')
                ? path.join(outputDir, cleanReference.slice(1))
                : path.resolve(path.dirname(filePath), cleanReference);

            if (!existsWithExactCase(resolvedPath)) {
                missingReferences.push(
                    `${path.relative(outputDir, filePath)} -> ${rawReference}`
                );
            }
        }
    }
}

if (missingReferences.length > 0) {
    throw new Error(`Broken static asset paths:\n${missingReferences.join('\n')}`);
}

console.log(`Static frontend built in .dist (${webFiles.length} HTML/CSS files validated).`);
console.log(backendUrl ? `Railway backend: ${backendUrl}` : 'Railway backend: same-origin local fallback');
