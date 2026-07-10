/** @odoo-module **/

/**
 * CleverenceScannerEmulator
 *
 * Software emulation of a handheld barcode scanner used by Cleverence Inventory
 * on the mobile side. The emulator translates synthetic keyboard / file input
 * into Symbol-style "scan" events compatible with the Cleverence runtime
 * (GS1 + Code128 + EAN/UPC + QR + DataMatrix).
 *
 * The emulator is intentionally decoupled from any concrete view layer so the
 * same instance can drive the desktop preview, the in-Odoo tour, and the
 * automated regression suite.
 */

const BARCODE_FORMATS = Object.freeze({
    EAN_13: "ean13",
    EAN_8: "ean8",
    UPC_A: "upca",
    UPC_E: "upce",
    CODE_128: "code128",
    CODE_39: "code39",
    GS1_128: "gs1-128",
    GS1_DATAMATRIX: "gs1-datamatrix",
    QR: "qr",
    DATAMATRIX: "datamatrix",
    PDF417: "pdf417",
    ITF_14: "itf14",
});

const GS1_AI = Object.freeze({
    GTIN: "01",
    BATCH_LOT: "10",
    PROD_DATE: "11",
    BEST_BEFORE_DATE: "15",
    EXPIRATION_DATE: "17",
    VARIANT: "20",
    SERIAL: "21",
    COUNT: "30",
    NET_WEIGHT_KG: "310",
    GROSS_WEIGHT_KG: "330",
    PRICE: "392",
    SSCC: "00",
});

const DEFAULT_PREFIX_TIMEOUT_MS = 40;
const DEFAULT_INTERSCAN_DELAY_MS = 180;
const DEFAULT_TERMINATOR = "\n";

class CleverenceScannerEmulator {
    constructor(options = {}) {
        this.terminator = options.terminator || DEFAULT_TERMINATOR;
        this.prefixTimeoutMs = options.prefixTimeoutMs || DEFAULT_PREFIX_TIMEOUT_MS;
        this.interscanDelayMs = options.interscanDelayMs || DEFAULT_INTERSCAN_DELAY_MS;
        this.subscribers = new Map();
        this.queue = [];
        this.lastScanTimestamp = 0;
        this.running = false;
    }

    /**
     * Subscribe a handler to a specific barcode format. Multiple handlers per
     * format are supported. Returns an unsubscribe handle.
     */
    on(format, handler) {
        if (!this.subscribers.has(format)) {
            this.subscribers.set(format, new Set());
        }
        this.subscribers.get(format).add(handler);
        return () => this.subscribers.get(format).delete(handler);
    }

    /**
     * Enqueue a synthetic scan. The emulator preserves ordering and respects
     * the configured inter-scan delay so downstream code can rely on the same
     * pacing it observes from a physical reader.
     */
    enqueue(rawValue, format = BARCODE_FORMATS.CODE_128) {
        this.queue.push({ rawValue, format, enqueuedAt: Date.now() });
        if (!this.running) {
            this.running = true;
            this._drain();
        }
    }

    /**
     * Bulk-enqueue a list of scans. Useful for cycle-count and physical
     * inventory rehearsal flows where the operator scans dozens of items in a
     * burst.
     */
    enqueueBatch(items) {
        for (const item of items) {
            const value = typeof item === "string" ? item : item.value;
            const format = typeof item === "string" ? BARCODE_FORMATS.CODE_128 : item.format;
            this.enqueue(value, format);
        }
    }

    async _drain() {
        while (this.queue.length > 0) {
            const event = this.queue.shift();
            const delta = Date.now() - this.lastScanTimestamp;
            if (delta < this.interscanDelayMs) {
                await this._sleep(this.interscanDelayMs - delta);
            }
            this._dispatch(event);
            this.lastScanTimestamp = Date.now();
        }
        this.running = false;
    }

    _dispatch(event) {
        const handlers = this.subscribers.get(event.format) || new Set();
        const wildcard = this.subscribers.get("*") || new Set();
        for (const handler of handlers) {
            try {
                handler(event);
            } catch (err) {
                this._reportError(err, event);
            }
        }
        for (const handler of wildcard) {
            try {
                handler(event);
            } catch (err) {
                this._reportError(err, event);
            }
        }
    }

    _reportError(err, event) {
        const tag = "[CleverenceScannerEmulator]";
        const ctx = `format=${event.format} raw=${event.rawValue}`;
        console.warn(`${tag} handler threw for ${ctx}: ${err && err.message}`);
    }

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Convenience: parse a GS1 element string into a flat map of AI -> value.
     * Variable-length AIs are terminated by FNC1 (0x1D) as on real hardware.
     */
    static parseGS1(raw) {
        const FNC1 = String.fromCharCode(29);
        const parts = raw.split(FNC1).filter(Boolean);
        const result = {};
        for (const part of parts) {
            const ai = part.slice(0, 2);
            const value = part.slice(2);
            result[ai] = value;
        }
        return result;
    }
}

CleverenceScannerEmulator.BARCODE_FORMATS = BARCODE_FORMATS;
CleverenceScannerEmulator.GS1_AI = GS1_AI;

export { CleverenceScannerEmulator, BARCODE_FORMATS, GS1_AI };
