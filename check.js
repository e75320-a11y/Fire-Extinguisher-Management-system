// ============================================================================
// 소화기 점검 관리 시스템 - 모바일 점검 페이지
// - QR 인식(check.html?id=소화기ID)으로 열립니다.
// - 점검 기록은 폰(localStorage)에 임시 보관 후 '모두 업로드'로 일괄 전송합니다.
// ============================================================================
import { loadCheckData, verifyInspections, postData } from './sheets.js';
import { INSPECTION_ITEMS, fmt, escapeHtml, uid } from './common.js';

const QUEUE_KEY = 'fe_inspection_queue';
const INSPECTOR_KEY = 'fe_inspector_name';

const $ = (id) => document.getElementById(id);

let currentExtId = null;
let currentExt = null;

// ---------- 유틸 ----------
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch (e) { return []; }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function nowIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- 초기화 ----------
document.addEventListener('DOMContentLoaded', init);

async function init() {
  currentExtId = new URLSearchParams(location.search).get('id') || '';
  $('inspector').value = localStorage.getItem(INSPECTOR_KEY) || '';
  renderItems();
  bindEvents();
  renderQueue();
  await resolveExtinguisher();
}

async function resolveExtinguisher() {
  if (!currentExtId) {
    $('extInfo').innerHTML = '<span class="mgmt">QR에 소화기 정보가 없습니다</span><br>관리 화면에서 QR을 다시 생성하세요.';
    return;
  }
  try {
    const res = await loadCheckData();
    const exts = res.extinguishers || [];
    currentExt = exts.find((x) => x.id === currentExtId) || null;
  } catch (err) {
    currentExt = null;
    console.warn('소화기 정보 로드 실패(오프라인):', err);
  }
  renderExtInfo();
}

function renderExtInfo() {
  if (currentExt) {
    $('extInfo').innerHTML =
      `<span class="mgmt">${escapeHtml(currentExt.mgmt_no || '-')}</span><br>` +
      `${escapeHtml(currentExt.location || '-')} · ${escapeHtml(currentExt.type || '-')}`;
  } else {
    $('extInfo').innerHTML =
      `<span class="mgmt">소화기 정보를 불러오지 못했습니다</span><br>` +
      `관리ID: ${escapeHtml(currentExtId || '-')} (점검 저장은 가능합니다)`;
  }
}

// ---------- 점검 항목 폼 ----------
function renderItems() {
  $('itemList').innerHTML = INSPECTION_ITEMS.map((it) => `
    <div class="item" data-key="${it.key}">
      <div class="item-label">${escapeHtml(it.label)}</div>
      <div class="item-opts">
        <label class="ok"><input type="radio" name="it_${it.key}" value="ok" checked /> 정상</label>
        <label class="bad"><input type="radio" name="it_${it.key}" value="bad" /> 이상</label>
        <label class="na"><input type="radio" name="it_${it.key}" value="na" /> 해당없음</label>
      </div>
      <input class="item-detail" type="text" placeholder="이상 내용 입력" />
    </div>`).join('');

  document.querySelectorAll('.item').forEach((itemEl) => {
    const key = itemEl.dataset.key;
    const detailEl = itemEl.querySelector('.item-detail');
    itemEl.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const isBad = radio.value === 'bad' && radio.checked;
        detailEl.classList.toggle('show', isBad);
        itemEl.classList.toggle('has-bad', isBad);
        if (isBad) detailEl.focus();
      });
    });
  });
}

function bindEvents() {
  $('checkForm').addEventListener('submit', onSave);
  $('uploadBtn').addEventListener('click', uploadAll);
}

function onSave(e) {
  e.preventDefault();

  const inspector = $('inspector').value.trim();
  if (!inspector) { toast('점검자 이름을 입력하세요.', true); $('inspector').focus(); return; }
  localStorage.setItem(INSPECTOR_KEY, inspector);

  const items = INSPECTION_ITEMS.map((it) => {
    const radio = document.querySelector(`input[name="it_${it.key}"]:checked`);
    const result = radio ? radio.value : 'ok';
    const detail = result === 'bad'
      ? document.querySelector(`.item[data-key="${it.key}"] .item-detail`).value.trim()
      : '';
    return { key: it.key, label: it.label, result, detail };
  });

  const record = {
    id: uid('in'),
    extinguisher_id: currentExtId,
    location: currentExt ? currentExt.location : '',
    type: currentExt ? currentExt.type : '',
    mgmt_no: currentExt ? currentExt.mgmt_no : '',
    inspected_by: inspector,
    inspected_at: nowIso(),
    items,
    note: $('note').value.trim(),
  };

  const queue = readQueue();
  queue.push(record);
  writeQueue(queue);

  resetForm();
  renderQueue();
  toast('점검기록을 임시 보관했습니다.');
}

function resetForm() {
  document.querySelectorAll('.item').forEach((itemEl) => {
    const okRadio = itemEl.querySelector('input[value="ok"]');
    if (okRadio) okRadio.checked = true;
    const detailEl = itemEl.querySelector('.item-detail');
    detailEl.classList.remove('show');
    detailEl.value = '';
    itemEl.classList.remove('has-bad');
  });
  $('note').value = '';
}

// ---------- 대기 큐 ----------
function renderQueue() {
  const queue = readQueue();
  $('queueCount').textContent = `${queue.length}건`;

  const listEl = $('queueList');
  if (!queue.length) {
    listEl.innerHTML = '<div class="queue-empty">대기 중인 기록이 없습니다.</div>';
  } else {
    listEl.innerHTML = queue.slice(-5).reverse().map((r) => `
      <div class="queue-item">
        <span class="q-mgmt">${escapeHtml(r.mgmt_no || r.extinguisher_id || '-')}</span>
        <span class="q-time">${escapeHtml(r.inspected_at ? r.inspected_at.replace('T', ' ').slice(5, 16) : '')}</span>
      </div>`).join('') + (queue.length > 5 ? `<div class="queue-empty">외 ${queue.length - 5}건…</div>` : '');
  }
}

// ---------- 일괄 업로드 ----------
async function uploadAll() {
  const queue = readQueue();
  if (!queue.length) { toast('업로드할 기록이 없습니다.'); return; }

  const btn = $('uploadBtn');
  const statusEl = $('uploadStatus');
  btn.disabled = true;
  statusEl.textContent = '업로드 중…';

  try {
    // 1) 한 번에 전송 (no-cors, 응답 확인 불가)
    await postData('save_inspections', { inspections: queue });

    // 2) 서버에 실제 반영됐는지 검증
    const ids = queue.map((r) => r.id);
    const res = await verifyInspections(ids);
    const found = new Set(res.found || []);
    const remaining = queue.filter((r) => !found.has(r.id));
    writeQueue(remaining);

    if (!remaining.length) {
      statusEl.textContent = `✅ ${queue.length}건 업로드 완료`;
      toast(`✅ ${queue.length}건 업로드 완료`);
    } else {
      statusEl.textContent = `⚠️ ${queue.length - remaining.length}건 완료, ${remaining.length}건 남음`;
      toast(`⚠️ 일부 기록이 남았습니다. 다시 시도하세요.`, true);
    }
    renderQueue();
  } catch (err) {
    statusEl.textContent = '업로드 실패: 네트워크 연결을 확인하세요.';
    toast('업로드 실패: 네트워크 연결을 확인하세요.', true);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}
