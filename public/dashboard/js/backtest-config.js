/**
 * backtest-config.js — 설정 폼 로직
 */
import { runBacktest, runParameterSweep } from './api.js';

// ── 슬라이더 라벨 동기화 ──────────────────────────────────────────────
function bindSlider(sliderId, labelId) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (!slider || !label) return;
    const update = () => { label.textContent = slider.value; };
    slider.addEventListener('input', update);
    update();
}

bindSlider('holding-period', 'holding-period-val');
bindSlider('w-tech', 'w-tech-val');
bindSlider('w-rr', 'w-rr-val');
bindSlider('w-vp', 'w-vp-val');
bindSlider('w-ma60', 'w-ma60-val');
bindSlider('t-a', 't-a-val');
bindSlider('t-b', 't-b-val');
bindSlider('t-c', 't-c-val');

// ── 설정 수집 ──────────────────────────────────────────────────────────
function getConfig() {
    const symbolsRaw = document.getElementById('symbols').value;
    const symbols = symbolsRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

    const gradeFilter = ['A', 'B', 'C', 'D'].filter(g =>
        document.getElementById(`grade-${g}`)?.checked
    );

    return {
        universe: symbols,
        gradeFilter: gradeFilter.length > 0 ? gradeFilter : ['A'],
        holdingPeriod: parseInt(document.getElementById('holding-period').value),
        weights: {
            technicalScoreMax: parseInt(document.getElementById('w-tech').value),
            rrScoreMax: parseInt(document.getElementById('w-rr').value),
            volumeProfileMax: parseInt(document.getElementById('w-vp').value),
            ma60Max: parseInt(document.getElementById('w-ma60').value),
        },
        thresholds: {
            A: parseInt(document.getElementById('t-a').value),
            B: parseInt(document.getElementById('t-b').value),
            C: parseInt(document.getElementById('t-c').value),
        },
    };
}

// ── 진행 상태 UI ─────────────────────────────────────────────────────
function setStatus(msg, pct = null) {
    const statusEl = document.getElementById('run-status');
    const fillEl = document.getElementById('progress-fill');
    const barEl = document.getElementById('progress-bar');
    if (statusEl) statusEl.textContent = msg;
    if (pct !== null && fillEl && barEl) {
        barEl.classList.remove('hidden');
        fillEl.style.width = `${pct}%`;
    }
    if (pct === null && barEl) barEl.classList.add('hidden');
}

function setRunning(isRunning) {
    const btn = document.getElementById('btn-run');
    const sweepBtn = document.getElementById('btn-sweep');
    if (btn) btn.disabled = isRunning;
    if (sweepBtn) sweepBtn.disabled = isRunning;
}

// ── 백테스트 실행 ────────────────────────────────────────────────────
document.getElementById('btn-run')?.addEventListener('click', async () => {
    const config = getConfig();
    if (config.universe.length === 0) {
        setStatus('종목코드를 입력해주세요.');
        return;
    }

    setRunning(true);
    setStatus(`⏳ 백테스트 실행 중... (${config.universe.length}종목)`, 10);

    try {
        const result = await runBacktest(config);
        setStatus(`✅ 완료! ${result.summary.totalTrades}건 | 승률 ${result.summary.winRate.toFixed(1)}% | 평균 ${result.summary.avgReturn >= 0 ? '+' : ''}${result.summary.avgReturn.toFixed(2)}%`, 100);

        // 결과 페이지로 이동 (결과 ID 전달)
        setTimeout(() => {
            window.location.href = `results.html?id=${result.id}`;
        }, 1000);
    } catch (err) {
        setStatus(`❌ 오류: ${err.message}`);
        setRunning(false);
    }
});

// ── Parameter Sweep 실행 ─────────────────────────────────────────────
document.getElementById('btn-sweep')?.addEventListener('click', async () => {
    const config = getConfig();
    if (config.universe.length === 0) {
        setStatus('종목코드를 입력해주세요.');
        return;
    }

    setRunning(true);
    setStatus(`⏳ Parameter Sweep 실행 중... (최대 324 조합 × ${config.universe.length}종목)`, 5);

    try {
        const result = await runParameterSweep(config);
        const best = result.bestByWinRate;
        setStatus(
            `✅ Sweep 완료! ${result.combinations.length}조합 | 최고 승률: ${best.winRate.toFixed(1)}% (threshold=${best.gradeThreshold})`,
            100
        );
        setRunning(false);
    } catch (err) {
        setStatus(`❌ 오류: ${err.message}`);
        setRunning(false);
    }
});
