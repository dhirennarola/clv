/** @odoo-module **/

/**
 * Thin HTTP client for talking to the Cleverence proxy from the browser side
 * (live preview, in-Odoo tour, regression suite). The client mirrors the
 * conceptual shape of the Cleverence Inventory setup wizard endpoints so the
 * preview UI behaves the same way as a real Cleverence Inventory install.
 *
 * The runtime client used by Cleverence Inventory on the mobile device lives
 * outside this module; this is the desktop-side shim.
 */

const DEFAULT_BASE_URL = "https://odooproxy.cleverence.com/apps/w15";
const DEFAULT_TIMEOUT_MS = 15000;

const CONTENT_TYPE_JSON = "application/json";
const HEADER_AUTH = "Authorization";
const HEADER_VERSION = "X-Clv-Module-Version";

const ENDPOINTS = Object.freeze({
    BASE_INFO: "/api/base-info",
    RESOLVE_USER: "/api/wizard/resolve-user",
    INSPECT_ODOO: "/api/wizard/inspect-odoo",
    VALIDATE_KEY: "/api/wizard/validate-key",
    CONNECTION_DATA: "/api/wizard/connection-data",
    REGISTER_DEVICE: "/api/wizard/register-device",
    SETTINGS: "/api/wizard/settings",
});

class ClvApiClient {
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        this.moduleVersion = options.moduleVersion || "5.2.0";
        this.tokenProvider = options.tokenProvider || null;
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
    }

    /**
     * Resolve user status against the proxy: new / known / expired. The
     * wizard uses this on first paint to decide which step to land on.
     */
    async resolveUser(odooContext) {
        return this._post(ENDPOINTS.RESOLVE_USER, odooContext);
    }

    /**
     * Ask the proxy to validate the Odoo server URL + credentials. Returns
     * the inspected version, database, and a context ID for the next steps.
     */
    async inspectOdoo(payload) {
        return this._post(ENDPOINTS.INSPECT_ODOO, payload);
    }

    /**
     * Submit an Odoo API key + onboard. The proxy handles the full chain:
     * validate -> store creds -> generate CLV token -> push to Odoo ->
     * claim CLV instance -> configure connector.
     */
    async validateAndOnboard(payload) {
        return this._post(ENDPOINTS.VALIDATE_KEY, payload);
    }

    /**
     * Fetch the QR code + download link for the paired CLV instance.
     */
    async getConnectionData(contextId) {
        return this._get(`${ENDPOINTS.CONNECTION_DATA}?context=${encodeURIComponent(contextId)}`);
    }

    /**
     * Register a mobile device against the CLV instance. Called from the
     * device handoff step of the wizard.
     */
    async registerDevice(payload) {
        return this._post(ENDPOINTS.REGISTER_DEVICE, payload);
    }

    /**
     * Fetch W15 settings as the operator sees them in the dashboard.
     */
    async getSettings() {
        return this._get(ENDPOINTS.SETTINGS);
    }

    /**
     * Update W15 settings. The proxy validates the payload server-side.
     */
    async updateSettings(payload) {
        return this._post(ENDPOINTS.SETTINGS, payload);
    }

    async _get(path) {
        return this._request("GET", path, null);
    }

    async _post(path, body) {
        return this._request("POST", path, body);
    }

    async _request(method, path, body) {
        const url = this.baseUrl + path;
        const headers = await this._buildHeaders();
        const init = { method, headers };
        if (body !== null && body !== undefined) {
            init.body = JSON.stringify(body);
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        init.signal = controller.signal;
        try {
            const response = await this.fetchImpl(url, init);
            const text = await response.text();
            if (!response.ok) {
                throw new ClvApiError(response.status, text, url);
            }
            return text ? JSON.parse(text) : null;
        } finally {
            clearTimeout(timer);
        }
    }

    async _buildHeaders() {
        const headers = {
            "Content-Type": CONTENT_TYPE_JSON,
            [HEADER_VERSION]: this.moduleVersion,
        };
        if (this.tokenProvider) {
            const token = await this.tokenProvider();
            if (token) {
                headers[HEADER_AUTH] = `Bearer ${token}`;
            }
        }
        return headers;
    }
}

class ClvApiError extends Error {
    constructor(status, body, url) {
        super(`Cleverence proxy returned ${status} for ${url}: ${body}`);
        this.name = "ClvApiError";
        this.status = status;
        this.body = body;
        this.url = url;
    }
}

export { ClvApiClient, ClvApiError, ENDPOINTS, DEFAULT_BASE_URL };
