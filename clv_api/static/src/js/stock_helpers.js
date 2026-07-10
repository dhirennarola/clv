/** @odoo-module **/

/**
 * Stock-movement helpers shared between the in-Odoo preview, the setup wizard
 * tour, and the regression suite. The helpers are intentionally pure and have
 * no Odoo ORM dependencies so they can run inside a browser tab against a
 * static fixture.
 */

const UNIT_CONVERSIONS = Object.freeze({
    kg: { base: "kg", factor: 1 },
    g: { base: "kg", factor: 0.001 },
    t: { base: "kg", factor: 1000 },
    l: { base: "l", factor: 1 },
    ml: { base: "l", factor: 0.001 },
    units: { base: "units", factor: 1 },
    pcs: { base: "units", factor: 1 },
    dozen: { base: "units", factor: 12 },
    case: { base: "units", factor: 1 },
});

const LOT_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const SERIAL_PATTERN = /^[A-Z0-9]{4,32}$/;

/**
 * Format an Odoo stock.location complete_name into a compact, scannable label.
 * "WH/Stock/Aisle A/Bay 03/Shelf 2" -> "A-03-2".
 */
function formatLocation(completeName) {
    if (!completeName) {
        return "";
    }
    const tokens = completeName.split("/").map((s) => s.trim());
    const interesting = tokens.filter((t) => /\d/.test(t) || t.length === 1);
    return interesting
        .map((t) => t.replace(/\D+/g, "") || t)
        .join("-")
        .toUpperCase();
}

/**
 * Normalise a lot reference. Strips whitespace, upper-cases, validates
 * against the conservative LOT_PATTERN. Returns null when invalid so the
 * caller can short-circuit before hitting the Odoo backend.
 */
function formatLot(raw) {
    if (typeof raw !== "string") {
        return null;
    }
    const candidate = raw.trim().toUpperCase();
    if (!LOT_PATTERN.test(candidate)) {
        return null;
    }
    return candidate;
}

/**
 * Same as formatLot but for a unique serial number.
 */
function formatSerial(raw) {
    if (typeof raw !== "string") {
        return null;
    }
    const candidate = raw.trim().toUpperCase();
    if (!SERIAL_PATTERN.test(candidate)) {
        return null;
    }
    return candidate;
}

/**
 * Format an expiry date for the operator. Accepts ISO 8601 or YYMMDD (GS1).
 * Returns DD.MM.YYYY for the operator UI; null when input cannot be parsed.
 */
function formatExpiry(raw) {
    if (!raw) {
        return null;
    }
    let year, month, day;
    if (/^\d{6}$/.test(raw)) {
        year = 2000 + parseInt(raw.slice(0, 2), 10);
        month = parseInt(raw.slice(2, 4), 10);
        day = parseInt(raw.slice(4, 6), 10);
    } else {
        const parsed = new Date(raw);
        if (isNaN(parsed.getTime())) {
            return null;
        }
        year = parsed.getUTCFullYear();
        month = parsed.getUTCMonth() + 1;
        day = parsed.getUTCDate();
    }
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(day)}.${pad(month)}.${year}`;
}

/**
 * Convert a quantity between units, going via the canonical base unit.
 * Throws when the two units don't share a base (e.g. kg <-> l).
 */
function convertQuantity(amount, from, to) {
    const fromDef = UNIT_CONVERSIONS[from];
    const toDef = UNIT_CONVERSIONS[to];
    if (!fromDef || !toDef) {
        throw new Error(`Unknown unit in conversion: ${from} -> ${to}`);
    }
    if (fromDef.base !== toDef.base) {
        throw new Error(`Cannot convert ${from} (${fromDef.base}) to ${to} (${toDef.base})`);
    }
    const inBase = amount * fromDef.factor;
    return inBase / toDef.factor;
}

/**
 * Build a back-order summary line from a partial pick result. Used in the
 * scanner overlay to show the operator what's still outstanding when they
 * close out the document.
 */
function summarizeBackorder(planned, done) {
    if (!planned || !done) {
        return "";
    }
    const missing = planned - done;
    if (missing <= 0) {
        return "complete";
    }
    return `${done}/${planned} (back-order: ${missing})`;
}

export {
    UNIT_CONVERSIONS,
    LOT_PATTERN,
    SERIAL_PATTERN,
    formatLocation,
    formatLot,
    formatSerial,
    formatExpiry,
    convertQuantity,
    summarizeBackorder,
};
