/**
 * utils.js — 숫자 포매팅 등
 */

export function pct(val, decimals = 1) {
    if (val == null) return '-';
    return `${val >= 0 ? '+' : ''}${Number(val).toFixed(decimals)}%`;
}

export function num(val, decimals = 2) {
    if (val == null) return '-';
    return Number(val).toFixed(decimals);
}

export function formatDate(d) {
    if (!d) return '-';
    // YYYYMMDD → YYYY-MM-DD
    if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    return d.slice(0, 10);
}

export function gradeColor(grade) {
    const map = { A: '#111827', B: '#4b5563', C: '#9ca3af', D: '#d1d5db' };
    return map[grade] || '#888';
}

export function returnColor(val) {
    return val >= 0 ? '#111827' : '#9ca3af';
}
