/**
 * api.js — fetch 래퍼
 */

const API_BASE = '';

export async function runBacktest(config) {
    const res = await fetch(`${API_BASE}/k-dexter/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.details || err.error || 'Backtest failed');
    }
    return res.json();
}

export async function runParameterSweep(config) {
    const res = await fetch(`${API_BASE}/k-dexter/backtest/parameter-sweep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.details || err.error || 'Sweep failed');
    }
    return res.json();
}

export async function listResults() {
    const res = await fetch(`${API_BASE}/k-dexter/backtest/results`);
    return res.json();
}

export async function getResult(id) {
    const res = await fetch(`${API_BASE}/k-dexter/backtest/results/${id}`);
    if (!res.ok) return null;
    return res.json();
}
