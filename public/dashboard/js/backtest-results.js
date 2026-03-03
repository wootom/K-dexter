/**
 * backtest-results.js — 결과 렌더링
 */
import { getResult } from './api.js';
import { pct, num, formatDate, gradeColor } from './utils.js';

const params = new URLSearchParams(location.search);
const resultId = params.get('id');

if (!resultId) {
    document.getElementById('error-msg').textContent = '결과 ID가 없습니다. 설정 페이지에서 백테스트를 실행해주세요.';
    document.getElementById('error-msg').classList.remove('hidden');
} else {
    loadAndRender(resultId);
}

async function loadAndRender(id) {
    try {
        const result = await getResult(id);
        if (!result) throw new Error('결과를 찾을 수 없습니다');
        renderAll(result);
    } catch (err) {
        document.getElementById('error-msg').textContent = `오류: ${err.message}`;
        document.getElementById('error-msg').classList.remove('hidden');
    }
}

function renderAll(r) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');

    renderSummaryCards(r.summary);
    renderEquityCurve(r.equityCurve);
    renderGradeBreakdown(r.gradeBreakdown);
    renderFactorCorrelation(r.factorCorrelation);
    renderTradesTable(r.trades);

    // Heatmap: check URL param or localStorage for sweep result
    const sweepId = params.get('sweepId');
    if (sweepId) {
        import('./api.js').then(({ getResult }) => {
            getResult(sweepId).then(sweepResult => {
                if (sweepResult && sweepResult.combinations) {
                    renderHeatmap(sweepResult);
                }
            }).catch(() => { });
        });
    }
}

// ── Summary Cards ──────────────────────────────────────────────────────
function renderSummaryCards(s) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('s-total', s.totalTrades);
    set('s-winrate', `${num(s.winRate, 1)}%`);
    set('s-avgret', pct(s.avgReturn, 2));
    set('s-mdd', pct(s.maxDrawdown, 1));
    set('s-sharpe', num(s.sharpeRatio, 2));
    set('s-target', `${num(s.targetHitRate, 1)}%`);
    set('s-stoploss', `${num(s.stopLossHitRate, 1)}%`);
    set('s-pf', num(s.profitFactor, 2));

    // 색상 적용
    const retEl = document.getElementById('s-avgret');
    if (retEl) retEl.className = `card-value ${s.avgReturn >= 0 ? 'text-green' : 'text-red'}`;
    const mddEl = document.getElementById('s-mdd');
    if (mddEl) mddEl.className = 'card-value text-red';
}

// ── Equity Curve ───────────────────────────────────────────────────────
function renderEquityCurve(equityCurve) {
    const ctx = document.getElementById('chart-equity')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    const labels = equityCurve.map(p => formatDate(p.date));
    const data = equityCurve.map(p => p.cumulativeReturn);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '누적 수익률 (%)',
                data,
                borderColor: '#111827',
                backgroundColor: 'rgba(17,24,39,.05)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxTicksLimit: 8, color: '#6b7280' }, grid: { color: '#f3f4f6' } },
                y: { ticks: { color: '#6b7280', callback: v => `${v.toFixed(1)}%` }, grid: { color: '#f3f4f6' } },
            },
        },
    });
}

// ── Grade Breakdown ────────────────────────────────────────────────────
function renderGradeBreakdown(breakdown) {
    const tbody = document.getElementById('grade-tbody');
    if (!tbody) return;
    tbody.innerHTML = breakdown.map(g => `
        <tr>
            <td><span class="badge badge-${g.grade}">${g.grade}</span></td>
            <td>${g.tradeCount}</td>
            <td>${num(g.winRate, 1)}%</td>
            <td class="${g.avgReturn >= 0 ? 'text-green' : 'text-red'}">${pct(g.avgReturn, 2)}</td>
            <td>${num(g.targetHitRate, 1)}%</td>
        </tr>
    `).join('');

    // Bar chart
    const ctx = document.getElementById('chart-grade')?.getContext('2d');
    if (!ctx || !window.Chart) return;
    const grades = breakdown.filter(g => g.tradeCount > 0);
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: grades.map(g => g.grade),
            datasets: [
                {
                    label: '승률',
                    data: grades.map(g => g.winRate),
                    backgroundColor: grades.map(g => gradeColor(g.grade) + '99'),
                    borderColor: grades.map(g => gradeColor(g.grade)),
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { max: 100, ticks: { color: '#6b7280', callback: v => `${v}%` }, grid: { color: '#f3f4f6' } },
                x: { ticks: { color: '#6b7280' } },
            },
        },
    });
}

// ── Factor Correlation ─────────────────────────────────────────────────
function renderFactorCorrelation(factors) {
    const container = document.getElementById('factor-bars');
    if (!container) return;

    const labels = {
        technicalScore: 'Technical Score',
        rrScore: 'R/R Score',
        volumeProfileScore: 'Volume Profile',
        ma60Score: 'MA60 Position',
    };

    container.innerHTML = factors.map(f => {
        const pctWidth = Math.abs(f.correlationWithReturn) * 100;
        const color = f.correlationWithReturn >= 0 ? '#4b5563' : '#d1d5db';
        return `
            <div style="margin-bottom:.75rem">
                <div class="flex justify-between" style="margin-bottom:.25rem">
                    <span style="font-size:.8rem">${labels[f.factor] || f.factor}</span>
                    <span style="font-size:.8rem;color:${color}">${f.correlationWithReturn >= 0 ? '+' : ''}${f.correlationWithReturn.toFixed(3)}</span>
                </div>
                <div style="background:#f3f4f6;border-radius:3px;height:6px">
                    <div style="width:${pctWidth}%;height:100%;background:${color};border-radius:3px;transition:width .3s"></div>
                </div>
                <div style="font-size:.7rem;color:#6b7280;margin-top:.2rem">
                    High: ${pct(f.avgReturnWhenHigh, 2)} &nbsp; Low: ${pct(f.avgReturnWhenLow, 2)}
                </div>
            </div>
        `;
    }).join('');
}

// ── Trades Table ───────────────────────────────────────────────────────
function renderTradesTable(trades) {
    const tbody = document.getElementById('trades-tbody');
    if (!tbody) return;

    // 최신 거래 먼저
    const sorted = [...trades].sort((a, b) => b.entryDate.localeCompare(a.entryDate));

    tbody.innerHTML = sorted.slice(0, 100).map(t => `
        <tr>
            <td>${t.symbol}</td>
            <td>${formatDate(t.entryDate)}</td>
            <td>${t.entryPrice.toLocaleString()}</td>
            <td>${t.exitPrice.toLocaleString()}</td>
            <td class="${t.returnPct >= 0 ? 'text-green' : 'text-red'}">${pct(t.returnPct, 2)}</td>
            <td><span class="badge badge-${t.swingGrade}">${t.swingGrade}</span></td>
            <td>${t.gradeScore}</td>
            <td><span class="badge badge-${t.returnPct > 0 ? 'WIN' : 'LOSS'}">${t.returnPct > 0 ? 'WIN' : 'LOSS'}</span></td>
            <td>${t.targetAchieved ? '✓' : '-'}</td>
            <td>${t.stopLossHit ? '✓' : '-'}</td>
        </tr>
    `).join('');

    if (trades.length > 100) {
        document.getElementById('trades-count').textContent = `(총 ${trades.length}건, 최근 100건 표시)`;
    } else {
        document.getElementById('trades-count').textContent = `(총 ${trades.length}건)`;
    }

    // CSV 다운로드 버튼 연결
    const btnCsv = document.getElementById('btn-csv');
    if (btnCsv) {
        btnCsv.addEventListener('click', () => downloadCSV(sorted));
    }
}

// ── Heatmap ────────────────────────────────────────────────────────────
/**
 * Parameter Sweep 결과로부터 gradeThreshold(행) x technicalScoreMax(열) 히트맵 렌더링
 * 셀 값: 해당 조합의 winRate (%)
 */
function renderHeatmap(sweepResult) {
    const section = document.getElementById('heatmap-section');
    const container = document.getElementById('heatmap-container');
    if (!section || !container) return;

    const combinations = sweepResult.combinations;
    if (!combinations || combinations.length === 0) return;

    // gradeThreshold 및 technicalScoreMax 고유 값 추출 (오름차순)
    const thresholds = [...new Set(combinations.map(c => c.gradeThreshold))].sort((a, b) => a - b);
    const techScores = [...new Set(combinations.map(c => c.weights && c.weights.tech !== undefined ? c.weights.tech : c.weights?.technicalScoreMax))].sort((a, b) => a - b);

    // 최대/최소 winRate (색상 스케일용)
    const winRates = combinations.map(c => c.winRate);
    const minWr = Math.min(...winRates);
    const maxWr = Math.max(...winRates);
    const range = maxWr - minWr || 1;

    // 조합 맵 구성: key = `${threshold}-${techScore}`
    const comboMap = new Map();
    for (const c of combinations) {
        const techKey = c.weights?.tech !== undefined ? c.weights.tech : c.weights?.technicalScoreMax;
        comboMap.set(`${c.gradeThreshold}-${techKey}`, c.winRate);
    }

    // 색상 계산 (낮음: 밝은 회색, 높음: 어두운 회색)
    function cellColor(wr) {
        if (wr === undefined) return '#f9fafb';
        const t = (wr - minWr) / range; // 0~1
        const grey = Math.round(240 - t * 180);
        return `rgb(${grey},${grey},${grey})`;
    }

    // 테이블 구성
    let html = '<table style="border-collapse:collapse;font-size:.75rem;width:100%">';

    // 헤더 행: technicalScoreMax 값
    html += '<thead><tr>';
    html += '<th style="padding:.35rem .5rem;text-align:left;color:#94a3b8;white-space:nowrap">Threshold \\ TechMax</th>';
    for (const ts of techScores) {
        html += `<th style="padding:.35rem .5rem;text-align:center;color:#94a3b8">${ts}</th>`;
    }
    html += '</tr></thead>';

    // 데이터 행: gradeThreshold 값
    html += '<tbody>';
    for (const thr of thresholds) {
        html += '<tr>';
        html += `<td style="padding:.35rem .5rem;color:#94a3b8;font-weight:600">${thr}</td>`;
        for (const ts of techScores) {
            const wr = comboMap.get(`${thr}-${ts}`);
            const bg = cellColor(wr);
            const textColor = wr !== undefined && (wr - minWr) / range > 0.5 ? '#f9fafb' : '#111827';
            html += `<td style="padding:.35rem .5rem;text-align:center;background:${bg};color:${textColor};border-radius:3px">`;
            html += wr !== undefined ? `${wr.toFixed(1)}%` : '-';
            html += '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    container.innerHTML = html;
    section.classList.remove('hidden');
}

// ── CSV Download ────────────────────────────────────────────────────────
/**
 * 거래 배열을 CSV로 변환하여 다운로드
 */
function downloadCSV(trades) {
    const headers = [
        '종목코드', '진입일', '진입가', '청산일', '청산가', '수익률(%)',
        'Grade', '점수', '기술점수', 'RR점수', 'VP점수', 'MA60점수',
        '목표가', '손절가', '기대RR', '목표도달', '손절도달',
        'MFE(%)', 'MAE(%)',
    ];

    const rows = trades.map(t => [
        t.symbol,
        t.entryDate,
        t.entryPrice,
        t.exitDate,
        t.exitPrice,
        t.returnPct,
        t.swingGrade,
        t.gradeScore,
        t.technicalScore,
        t.rrScore,
        t.volumeProfileScore,
        t.ma60Score,
        t.targetPrice,
        t.stopLossPrice,
        t.expectedRR,
        t.targetAchieved ? 'Y' : 'N',
        t.stopLossHit ? 'Y' : 'N',
        t.maxFavorableExcursion,
        t.maxAdverseExcursion,
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(v => {
            const str = String(v ?? '');
            // 쉼표나 따옴표가 포함된 경우 따옴표로 감싸기
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(','))
        .join('\n');

    const bom = '\uFEFF'; // UTF-8 BOM (Excel 한글 지원)
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
