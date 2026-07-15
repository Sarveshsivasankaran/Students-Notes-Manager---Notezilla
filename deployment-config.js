const normalizeOrigin = (value) => String(value || '').trim().replace(/\/$/, '');

const configuredOrigins = [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || '').split(',')
]
    .map(normalizeOrigin)
    .filter(Boolean);

const allowedOrigins = [...new Set(configuredOrigins)];

const isAllowedOrigin = (origin) => {
    // CLI tools, health checks, and same-origin requests do not send Origin.
    if (!origin) return true;

    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.length === 0) {
        return process.env.NODE_ENV !== 'production';
    }

    return allowedOrigins.includes(normalized);
};

const corsOrigin = (origin, callback) => {
    if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
    }

    callback(new Error(`Origin ${origin} is not allowed by Notezilla CORS`));
};

module.exports = {
    allowedOrigins,
    corsOrigin,
    isAllowedOrigin
};
