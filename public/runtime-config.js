(function configureNotezillaRuntime(window) {
    'use strict';

    const configuredBackendUrl = '__NOTEZILLA_RAILWAY_BACKEND_URL__';
    const hasConfiguredBackend = configuredBackendUrl
        && !configuredBackendUrl.startsWith('__NOTEZILLA_');
    const backendUrl = hasConfiguredBackend
        ? configuredBackendUrl.replace(/\/+$/, '')
        : '';
    const apiBaseUrl = backendUrl ? `${backendUrl}/api` : '/api';

    const apiUrl = (path = '') => {
        const normalizedPath = String(path).replace(/^\/+/, '');
        return normalizedPath ? `${apiBaseUrl}/${normalizedPath}` : apiBaseUrl;
    };

    window.NotezillaRuntime = Object.freeze({
        backendUrl,
        apiBaseUrl,
        apiUrl,
        socketUrl: backendUrl || window.location.origin
    });

    // Existing screens use root-relative /api URLs. Keep those calls working
    // locally while routing them to Railway in the Vercel static build.
    if (backendUrl && typeof window.fetch === 'function') {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (resource, options) => {
            if (typeof resource === 'string' && /^\/api(?:\/|$)/.test(resource)) {
                return nativeFetch(`${backendUrl}${resource}`, options);
            }

            if (resource instanceof Request) {
                const requestUrl = new URL(resource.url, window.location.origin);
                if (requestUrl.origin === window.location.origin && /^\/api(?:\/|$)/.test(requestUrl.pathname)) {
                    const rewrittenUrl = `${backendUrl}${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
                    return nativeFetch(new Request(rewrittenUrl, resource), options);
                }
            }

            return nativeFetch(resource, options);
        };
    }
}(window));
