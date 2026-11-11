// ============================================================================
// 소화기 점검 관리 시스템 - 관리자(메인) 화면
// ============================================================================
import { loadAllData, postData } from './sheets.js';
import {
  escapeHtml, fmt, formatDateTime, localMonthKey, currentMonthKey, uid, INSPECTION_ITEMS,
} from './common.js';

// ---------- 상태 ----------
let data = { extinguishers: [], inspections: [], settings: {} };
let editingExtId = null;
let monthlyFilter = 'all';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

function isActive(ext) {
  const a = ext.active;
  if (a === false || a === 'false' || a === 'FALSE' || a === 0 || a === '0') return false;
  return true;
}

function monthOf(insp) {
  // month 값이 "2026-11" 또는 날짜변환된 "2026-11-01" 등 어떤 형태여도 YYYY-MM으로 정규화
  const raw = fmt(insp.month) || fmt(insp.inspected_at);
  return raw.slice(0, 7);
}

function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

// ---------- 초기화 ----------
document.addEventListener('DOMContentLoaded', init);

function init() {
  bindTabs();
  bindExtForm();
  bindQrControls();
  bindMonthly();
  bindAbnormal();
  bindSettings();
  bindModal();
  $('reloadBtn').addEventListener('click', () => loadAndRender());
  loadAndRender();
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
}

async function loadAndRender() {
  $('syncStatus').textContent = '데이터 로드 중…';
  try {
    const res = await loadAllData();
    data = {
      extinguishers: res.extinguishers || [],
      inspections: res.inspections || [],
      settings: res.settings || {},
    };
    $('syncStatus').textContent =
      `소화기 ${data.extinguishers.length}대 · 점검기록 ${data.inspections.length}건`;
    renderAll();
  } catch (err) {
    $('syncStatus').textContent = '연결 실패';
    toast('데이터를 불러오지 못했습니다. sheets-config.js의 APPS_SCRIPT_URL을 확인하세요.', true);
    console.error(err);
  }
}

function renderAll() {
  $('siteTitle').textContent = fmt(data.settings.site_name) || '소화기 점검 관리 시스템';
  document.title = fmt(data.settings.site_name) || '소화기 점검 관리 시스템';
  renderExtTable();
  renderQrList();
  renderMonthly();
  renderAbnormal();
  renderSettings();
}

// ============================================================================
// 소화기 관리
// ============================================================================
const EXT_TYPE_OPTIONS = ['ABC분말', 'BC분말', 'CO2', '청정소화약제', '포소화기', '물소화기'];

function getTypeValue() {
  const sel = $('extType').value;
  if (sel === '__custom__') return $('extTypeCustom').value.trim();
  return sel;
}

function setTypeField(type) {
  type = type || '';
  if (EXT_TYPE_OPTIONS.includes(type)) {
    $('extType').value = type;
    $('extTypeCustom').value = '';
    $('extTypeCustom').style.display = 'none';
  } else if (type) {
    $('extType').value = '__custom__';
    $('extTypeCustom').value = type;
    $('extTypeCustom').style.display = 'block';
  } else {
    $('extType').value = '';
    $('extTypeCustom').value = '';
    $('extTypeCustom').style.display = 'none';
  }
}

function bindExtForm() {
  $('extForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const wasEdit = !!$('extId').value;
    const id = $('extId').value || uid('ex');
    const rec = {
      id,
      location: $('extLocation').value.trim(),
      type: getTypeValue(),
      capacity: $('extCapacity').value.trim(),
      mgmt_no: $('extMgmtNo').value.trim(),
      installed_date: $('extInstalled').value,
      expiry_date: $('extExpiry').value,
      note: $('extNote').value.trim(),
      active: $('extActive').checked,
    };

    if (!rec.location || !rec.type || !rec.mgmt_no) {
      toast('위치, 형식, 관리번호를 모두 입력하세요.', true);
      return;
    }

    const list = data.extinguishers.slice();
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) list.push(rec);
    else list[idx] = rec;

    try {
      await postData('save_extinguishers', { extinguishers: list });
      toast('소화기 정보를 저장했습니다.');
      resetExtForm();
      await loadAndRender();
      if (wasEdit) switchTab('ext');
    } catch (err) {
      toast('저장에 실패했습니다.', true);
      console.error(err);
    }
  });

  $('extType').addEventListener('change', () => {
    const custom = $('extType').value === '__custom__';
    $('extTypeCustom').style.display = custom ? 'block' : 'none';
    if (custom) $('extTypeCustom').focus();
  });

  $('extResetBtn').addEventListener('click', resetExtForm);
}

function resetExtForm() {
  editingExtId = null;
  $('extId').value = '';
  $('extForm').reset();
  $('extActive').checked = true;
  $('extTypeCustom').style.display = 'none';
  $('extForm').querySelector('button[type="submit"]').textContent = '저장';
}

function renderExtTable() {
  const tbody = $('extTbody');
  const list = data.extinguishers.slice().sort((a, b) =>
    fmt(a.mgmt_no).localeCompare(fmt(b.mgmt_no), 'ko', { numeric: true }));

  tbody.innerHTML = list.map((ext) => {
    const active = isActive(ext);
    return `<tr>
      <td><b>${escapeHtml(ext.mgmt_no)}</b></td>
      <td>${escapeHtml(ext.location)}</td>
      <td>${escapeHtml(ext.type)}</td>
      <td>${escapeHtml(ext.capacity || '-')}</td>
      <td>${escapeHtml(ext.installed_date || '-')}</td>
      <td>${escapeHtml(ext.expiry_date || '-')}</td>
      <td>${escapeHtml(ext.note)}</td>
      <td>${active
        ? '<span class="badge badge-ok">사용 중</span>'
        : '<span class="badge badge-inactive">미사용</span>'}</td>
      <td>
        <button class="btn" data-action="edit" data-id="${escapeHtml(ext.id)}">수정</button>
        <button class="btn btn-danger" data-action="del" data-id="${escapeHtml(ext.id)}">삭제</button>
      </td>
    </tr>`;
  }).join('');

  $('extCount').textContent = `총 ${list.length}대 (사용 중 ${list.filter(isActive).length}대)`;

  tbody.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const ext = data.extinguishers.find((x) => x.id === id);
      if (!ext) return;
      if (btn.dataset.action === 'edit') {
        fillExtForm(ext);
      } else if (btn.dataset.action === 'del') {
        if (!confirm(`'${ext.mgmt_no}' 소화기를 삭제할까요?`)) return;
        const list = data.extinguishers.filter((x) => x.id !== id);
        await postData('save_extinguishers', { extinguishers: list });
        toast('삭제했습니다.');
        await loadAndRender();
      }
    });
  });
}

function fillExtForm(ext) {
  editingExtId = ext.id;
  $('extId').value = ext.id;
  $('extLocation').value = ext.location || '';
  setTypeField(ext.type);
  $('extCapacity').value = ext.capacity || '';
  $('extMgmtNo').value = ext.mgmt_no || '';
  $('extInstalled').value = ext.installed_date || '';
  $('extExpiry').value = ext.expiry_date || '';
  $('extNote').value = ext.note || '';
  $('extActive').checked = isActive(ext);
  $('extForm').querySelector('button[type="submit"]').textContent = '수정 저장';
  switchTab('register');
  $('extLocation').focus();
}

// ============================================================================
// QR 생성
// ============================================================================
function bindQrControls() {
  $('qrSelectAll').addEventListener('click', () => setQrCheckboxes(true));
  $('qrSelectNone').addEventListener('click', () => setQrCheckboxes(false));
  $('qrGenerateSelected').addEventListener('click', () => generateQr(getSelectedExtIds()));
  $('qrGenerateAll').addEventListener('click', () => generateQr(data.extinguishers.filter(isActive).map((x) => x.id)));
  $('qrDownloadAll').addEventListener('click', downloadAllQrImages);
  $('qrPrint').addEventListener('click', () => {
    if (!$('qrGrid').children.length) { toast('먼저 QR을 생성하세요.', true); return; }
    printQr();
  });
}

function setQrCheckboxes(checked) {
  document.querySelectorAll('#qrExtList input[type="checkbox"]').forEach((c) => { c.checked = checked; });
}

function getSelectedExtIds() {
  return Array.from(document.querySelectorAll('#qrExtList input[type="checkbox"]:checked'))
    .map((c) => c.dataset.id);
}

function renderQrList() {
  const list = data.extinguishers.filter(isActive).slice().sort((a, b) =>
    fmt(a.mgmt_no).localeCompare(fmt(b.mgmt_no), 'ko', { numeric: true }));

  $('qrExtList').innerHTML = list.map((ext) => `
    <label class="ext-select-item">
      <input type="checkbox" data-id="${escapeHtml(ext.id)}" />
      <span class="no">${escapeHtml(ext.mgmt_no)}</span>
      <span class="meta">${escapeHtml(ext.location)} · ${escapeHtml(ext.type)}</span>
    </label>`).join('') || '<p class="muted">등록된(사용 중) 소화기가 없습니다.</p>';

  const base = fmt(data.settings.check_url_base);
  $('qrUrlHint').textContent = base
    ? `QR에는 "${base.replace(/\/$/, '')}/check.html?id=관리ID" 주소가 기록됩니다.`
    : '설정 탭에서 "점검 페이지 URL(check_url_base)"을 먼저 입력하세요.';
}

function generateQr(ids) {
  const base = fmt(data.settings.check_url_base).trim().replace(/\/$/, '');
  if (!base) {
    toast('설정 탭에서 점검 페이지 URL(check_url_base)을 먼저 입력하세요.', true);
    return;
  }
  if (!ids.length) { toast('QR을 생성할 소화기를 선택하세요.', true); return; }

  const grid = $('qrGrid');
  grid.innerHTML = '';
  const exts = data.extinguishers.filter((x) => ids.includes(x.id)).sort((a, b) =>
    fmt(a.mgmt_no).localeCompare(fmt(b.mgmt_no), 'ko', { numeric: true }));

  exts.forEach((ext) => {
    const card = document.createElement('div');
    card.className = 'qr-card';

    const imgBox = document.createElement('div');
    imgBox.className = 'qr-img';
    card.appendChild(imgBox);

    const info = document.createElement('div');
    info.className = 'qr-info';
    info.innerHTML =
      `<div class="qr-no">${escapeHtml(ext.mgmt_no)}</div>` +
      `<div class="qr-loc">${escapeHtml(ext.location)}</div>` +
      `<div class="qr-type">${escapeHtml(ext.type)}</div>`;
    card.appendChild(info);

    grid.appendChild(card);

    const url = `${base}/check.html?id=${encodeURIComponent(ext.id)}`;
    card.dataset.url = url;
    new QRCode(imgBox, {
      text: url,
      width: 180,
      height: 180,
      colorDark: '#1f2933',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });

    card.dataset.mgmt = ext.mgmt_no || ext.id;
    card.dataset.loc = ext.location || '';
    card.dataset.type = ext.type || '';

    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn qr-dl-btn';
    dlBtn.type = 'button';
    dlBtn.textContent = '⬇ 이미지 다운로드';
    dlBtn.addEventListener('click', () => downloadQrCardImage(card));
    card.appendChild(dlBtn);
  });

  toast(`${exts.length}개의 QR을 생성했습니다.`);
}

// ---------- QR 이미지 다운로드 ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function safeFilename(name) {
  return String(name || 'qr').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'qr';
}

async function buildQrCardCanvas(ext, qrDataUrl) {
  const W = 640, H = 760;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 흰 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 라운드 테두리
  ctx.strokeStyle = '#d9dde3';
  ctx.lineWidth = 4;
  roundRectPath(ctx, 16, 16, W - 32, H - 32, 28);
  ctx.stroke();

  // QR 이미지
  const qrImg = await loadImage(qrDataUrl);
  const qrSize = 440;
  const qrX = (W - qrSize) / 2;
  const qrY = 70;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // 텍스트 (관리번호 / 위치 / 형식)
  ctx.textAlign = 'center';
  let y = qrY + qrSize + 64;
  ctx.fillStyle = '#c62828';
  ctx.font = 'bold 44px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  ctx.fillText(ext.mgmt_no || '', W / 2, y);
  y += 52;
  ctx.fillStyle = '#1f2933';
  ctx.font = '32px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  ctx.fillText(ext.location || '', W / 2, y);
  y += 42;
  ctx.fillStyle = '#7a8290';
  ctx.font = '24px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
  ctx.fillText(ext.type || '', W / 2, y);

  return canvas;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function downloadQrCardImage(card) {
  const img = card.querySelector('.qr-img img');
  if (!img || !img.src) { toast('QR 이미지를 찾을 수 없습니다.', true); return; }
  try {
    const canvas = await buildQrCardCanvas(
      { mgmt_no: card.dataset.mgmt, location: card.dataset.loc, type: card.dataset.type },
      img.src,
    );
    const blob = await canvasToPngBlob(canvas);
    downloadBlob(blob, `${safeFilename(card.dataset.mgmt)}.png`);
  } catch (err) {
    toast('이미지 생성에 실패했습니다.', true);
    console.error(err);
  }
}

async function downloadAllQrImages() {
  const cards = Array.from(document.querySelectorAll('#qrGrid .qr-card'));
  if (!cards.length) { toast('먼저 QR을 생성하세요.', true); return; }
  if (typeof JSZip === 'undefined') { toast('ZIP 라이브러리를 불러오지 못했습니다.', true); return; }

  const zip = new JSZip();
  let count = 0;
  for (const card of cards) {
    const img = card.querySelector('.qr-img img');
    if (!img || !img.src) continue;
    const canvas = await buildQrCardCanvas(
      { mgmt_no: card.dataset.mgmt, location: card.dataset.loc, type: card.dataset.type },
      img.src,
    );
    const blob = await canvasToPngBlob(canvas);
    zip.file(`${safeFilename(card.dataset.mgmt)}.png`, blob);
    count++;
  }

  if (!count) { toast('다운로드할 QR이 없습니다.', true); return; }

  const blob = await zip.generateAsync({ type: 'blob' });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  downloadBlob(blob, `소화기QR_${stamp}.zip`);
  toast(`${count}개의 QR 이미지를 ZIP으로 다운로드했습니다.`);
}

// 인쇄용 QR HTML: 다운로드 버튼 없이 카드 한 장씩 고정 비율(640×760) 이미지로 구성
const QR_PER_PAGE_COLUMNS = [
  0, 1, 2, 2, 2, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 6, 6,
];

function qrColumnsFor(perPage) {
  return QR_PER_PAGE_COLUMNS[perPage] || 6;
}

// 고해상도 QR 이미지(data URL)를 생성합니다.
function qrDataUrl(text, size) {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;';
  document.body.appendChild(holder);
  let src = '';
  try {
    new QRCode(holder, {
      text,
      width: size,
      height: size,
      colorDark: '#1f2933',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    const img = holder.querySelector('img');
    const canvas = holder.querySelector('canvas');
    src = (img && img.src) ? img.src : (canvas ? canvas.toDataURL('image/png') : '');
  } catch (e) {
    src = '';
  }
  holder.remove();
  return src;
}

async function buildQrPrintHtml(perPage) {
  const cards = Array.from(document.querySelectorAll('#qrGrid .qr-card'));
  const pages = [];

  for (let i = 0; i < cards.length; i += perPage) {
    const imgs = [];
    for (const card of cards.slice(i, i + perPage)) {
      const screenImg = card.querySelector('.qr-img img');
      let qrSrc = (screenImg && screenImg.src) || '';
      if (card.dataset.url) {
        const hi = qrDataUrl(card.dataset.url, 440);
        if (hi) qrSrc = hi;
      }
      const canvas = await buildQrCardCanvas(
        { mgmt_no: card.dataset.mgmt, location: card.dataset.loc, type: card.dataset.type },
        qrSrc,
      );
      imgs.push(`<div class="qr-card"><img src="${canvas.toDataURL('image/png')}" alt="QR" /></div>`);
    }
    pages.push(`<div class="qr-page"><div class="qr-grid">${imgs.join('')}</div></div>`);
  }

  return pages.join('');
}

async function printQr() {
  const raw = parseInt($('qrPerPage').value, 10);
  const perPage = Math.min(32, Math.max(1, Number.isFinite(raw) ? raw : 8));
  $('qrPerPage').value = perPage;
  try {
    const bodyHtml = await buildQrPrintHtml(perPage);
    printHtml('소화기 점검 QR 코드', qrPrintCss(qrColumnsFor(perPage)), bodyHtml);
  } catch (e) {
    toast('인쇄용 QR 이미지 생성에 실패했습니다.', true);
    console.error(e);
  }
}

// ============================================================================
// 월별 점검현황
// ============================================================================
function bindMonthly() {
  $('monthInput').value = currentMonthKey();
  $('monthInput').addEventListener('change', renderMonthly);
  $('monthlyPrintBtn').addEventListener('click', printMonthly);

  // 목록 행 더블클릭 → 점검기록 수동 등록/수정 모달
  $('monthlyTbody').addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr[data-ext-id]');
    if (!tr) return;
    const extId = tr.dataset.extId;
    const ext = data.extinguishers.find((x) => x.id === extId);
    if (!ext) return;
    const insp = data.inspections.find((x) => x.id === tr.dataset.inspId) || null;
    openInspectModal(ext, insp);
  });
}

function monthlyRowsData(month) {
  const activeExts = data.extinguishers.filter(isActive)
    .slice().sort((a, b) => fmt(a.mgmt_no).localeCompare(fmt(b.mgmt_no), 'ko', { numeric: true }));

  const inspOfMonth = data.inspections.filter((i) => monthOf(i) === month);
  const latestByExt = {};
  inspOfMonth.forEach((i) => {
    const prev = latestByExt[i.extinguisher_id];
    if (!prev || fmt(i.inspected_at) > fmt(prev.inspected_at)) latestByExt[i.extinguisher_id] = i;
  });

  const rowsData = activeExts.map((ext) => {
    const insp = latestByExt[ext.id] || null;
    return { ext, insp, done: !!insp, bad: !!insp && Number(insp.abnormal_count) > 0 };
  });

  return {
    activeExts,
    rowsData,
    doneCount: rowsData.filter((r) => r.done).length,
    badCount: rowsData.filter((r) => r.bad).length,
    missCount: rowsData.filter((r) => !r.done).length,
  };
}

function renderMonthly() {
  const month = $('monthInput').value || currentMonthKey();
  const m = monthlyRowsData(month);

  const visible = m.rowsData.filter((r) => {
    if (monthlyFilter === 'done') return r.done;
    if (monthlyFilter === 'miss') return !r.done;
    if (monthlyFilter === 'bad') return r.bad;
    return true;
  });

  $('monthlyTbody').innerHTML = visible.map(({ ext, insp, done }) => {
    let statusHtml, resultHtml = '-', dateHtml = '-', byHtml = '-', badHtml = '-';
    if (done) {
      if (Number(insp.abnormal_count) > 0) resultHtml = '<span class="badge badge-bad">이상</span>';
      else resultHtml = '<span class="badge badge-ok">정상</span>';
      statusHtml = '<span class="badge badge-done">점검완료</span>';
      dateHtml = escapeHtml(formatDateTime(insp.inspected_at));
      byHtml = escapeHtml(insp.inspected_by);
      badHtml = badItemsHtml(insp);
    } else {
      statusHtml = '<span class="badge badge-miss">미점검</span>';
    }
    return `<tr data-ext-id="${escapeHtml(ext.id)}" data-insp-id="${escapeHtml(insp ? insp.id : '')}">
      <td><b>${escapeHtml(ext.mgmt_no)}</b></td>
      <td>${escapeHtml(ext.location)}</td>
      <td>${escapeHtml(ext.type)}</td>
      <td>${statusHtml}</td>
      <td>${dateHtml}</td>
      <td>${byHtml}</td>
      <td>${resultHtml}</td>
      <td>${badHtml}</td>
    </tr>`;
  }).join('');

  if (!m.activeExts.length) {
    $('monthlyEmpty').textContent = '등록된(사용 중) 소화기가 없습니다.';
  } else if (!visible.length) {
    $('monthlyEmpty').textContent = '선택한 조건에 해당하는 소화기가 없습니다.';
  } else if (monthlyFilter !== 'all') {
    $('monthlyEmpty').textContent = `${visible.length}대 표시 중 (전체 ${m.activeExts.length}대)`;
  } else {
    $('monthlyEmpty').textContent = '';
  }

  $('monthlySummary').innerHTML = summaryCards(m.activeExts.length, m.doneCount, m.missCount, m.badCount, monthlyFilter);

  document.querySelectorAll('#monthlySummary .summary-card').forEach((card) => {
    card.addEventListener('click', () => {
      monthlyFilter = card.dataset.filter;
      renderMonthly();
    });
  });
}

function summaryCards(total, done, miss, bad, activeFilter) {
  const card = (filter, num, label, tone) => `
    <div class="summary-card selectable ${tone || ''} ${activeFilter === filter ? 'active' : ''}" data-filter="${filter}">
      <div class="num">${num}</div><div class="label">${label}</div>
    </div>`;
  return card('all', total, '전체 소화기') +
         card('done', done, '점검완료', 'tone-ok') +
         card('miss', miss, '미점검', 'tone-miss') +
         card('bad', bad, '이상 발견', 'tone-bad');
}

function badItemsHtml(insp) {
  const items = Array.isArray(insp.items) ? insp.items : [];
  const bads = items.filter((x) => x && String(x.result) === 'bad');
  if (!bads.length) return '-';
  return `<span class="badge badge-bad">${bads.map((x) => escapeHtml(x.label)).join(', ')}</span>`;
}

function printMonthly() {
  buildMonthlyPrint();
  printHtml('소화기 월별 점검 결과', MONTHLY_PRINT_CSS, $('monthlyPrintArea').innerHTML);
}

function buildMonthlyPrint() {
  const month = $('monthInput').value || currentMonthKey();
  const m = monthlyRowsData(month);
  const siteName = fmt(data.settings.site_name) || '소화기 점검 관리 시스템';

  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;

  const rows = m.rowsData.map(({ ext, insp, done, bad }, idx) => {
    let status = '미점검', result = '-', date = '-', by = '-', badTxt = '-';
    if (done) {
      status = '점검완료';
      result = bad ? '이상' : '정상';
      date = formatDateTime(insp.inspected_at);
      by = insp.inspected_by || '-';
      badTxt = badItemLabels(insp) || '-';
    }
    return `<tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(ext.mgmt_no)}</td>
      <td>${escapeHtml(ext.location)}</td>
      <td>${escapeHtml(ext.type)}</td>
      <td>${status}</td>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(by)}</td>
      <td>${result}</td>
      <td>${escapeHtml(badTxt)}</td>
    </tr>`;
  }).join('');

  $('monthlyPrintArea').innerHTML = `
    <div class="print-header">
      <h1>${escapeHtml(siteName)} — 소화기 월별 점검 결과</h1>
      <p class="print-meta">점검 대상 월: ${escapeHtml(month)} &nbsp;·&nbsp; 출력일: ${escapeHtml(today)}</p>
    </div>
    <p class="print-summary">전체 ${m.activeExts.length}대 · 점검완료 ${m.doneCount}대 · 미점검 ${m.missCount}대 · 이상발견 ${m.badCount}대</p>
    <div class="print-items">
      <div class="print-items-title">■ 점검 항목</div>
      <ol class="print-items-list">
        ${INSPECTION_ITEMS.map((it) => `<li>${escapeHtml(it.label)}</li>`).join('')}
      </ol>
      <p class="print-legend">※ 각 항목을 정상 / 이상 / 해당없음으로 점검</p>
    </div>
    <table class="print-table">
      <thead>
        <tr><th>No</th><th>관리번호</th><th>위치</th><th>형식</th><th>점검상태</th><th>최근점검일</th><th>점검자</th><th>결과</th><th>이상항목</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="print-sign">
      <span>점검자: ____________________</span>
      <span>확인자: ____________________</span>
      <span>날짜: ______년 ____월 ____일</span>
    </div>`;
}

function badItemLabels(insp) {
  const items = Array.isArray(insp.items) ? insp.items : [];
  return items.filter((x) => x && String(x.result) === 'bad').map((x) => x.label).join(', ');
}

const PRINT_BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif; color:#1f2933; margin:0; padding:24px; }
`;

function qrPrintCss(cols) {
  return PRINT_BASE_CSS + `
    @page { size: A4 portrait; margin: 12mm; }
    body { padding: 0; }
    .qr-page { page-break-after: always; break-after: page; }
    .qr-page:last-child { page-break-after: auto; break-after: auto; }
    .qr-grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4mm; width: 180mm; margin: 0 auto; }
    .qr-card { display: block; }
    .qr-card img { display: block; width: 100%; height: auto; }
  `;
}

const MONTHLY_PRINT_CSS = PRINT_BASE_CSS + `
  h1 { font-size:20px; margin:0 0 6px; }
  .print-meta { font-size:12px; margin:0 0 12px; }
  .print-summary { font-size:13px; margin:0 0 10px; }
  .print-items { margin:0 0 12px; }
  .print-items-title { font-size:13px; font-weight:700; margin-bottom:6px; }
  .print-items-list { margin:0; padding-left:20px; font-size:12px; line-height:1.7; display:grid; grid-template-columns:repeat(2,1fr); column-gap:24px; }
  .print-legend { font-size:11px; color:#555; margin:6px 0 0; }
  .print-table { width:100%; border-collapse:collapse; font-size:12px; }
  .print-table th, .print-table td { border:1px solid #333; padding:6px 8px; text-align:left; }
  .print-table th { background:#f0f0f0; }
  .print-sign { margin-top:28px; font-size:13px; display:flex; gap:32px; flex-wrap:wrap; }
`;

// 인쇄: 새 창(또는 숨김 iframe)을 열어 내용을 출력합니다.
// 일부 웹뷰/내장 브라우저에서는 window.print()가 동작하지 않아
// 독립 문서를 새 창에 열고 그 창에서 인쇄를 호출합니다.
function printHtml(title, css, bodyHtml) {
  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
    '<title>' + title + '</title><style>' + css + '</style></head><body>' +
    bodyHtml + '</body></html>';

  const triggerPrint = (win) => {
    try {
      const imgs = Array.from(win.document.images || []);
      if (imgs.length && typeof imgs[0].decode === 'function') {
        Promise.all(imgs.map((img) => img.decode().catch(() => {}))).then(() => {
          win.focus();
          try { win.print(); } catch (e) { /* 무시 */ }
        });
        return;
      }
    } catch (e) { /* 아래에서 기본 타이머로 진행 */ }
    win.focus();
    setTimeout(() => { try { win.print(); } catch (e) { /* 무시 */ } }, 350);
  };

  let w = null;
  try { w = window.open('', '_blank'); } catch (e) { w = null; }

  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    triggerPrint(w);
    return;
  }

  // 팝업이 차단된 경우: 숨김 iframe에서 인쇄 시도
  try {
    const old = document.getElementById('printFrame');
    if (old) old.remove();
    const ifr = document.createElement('iframe');
    ifr.id = 'printFrame';
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(ifr);
    const doc = ifr.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    triggerPrint(ifr.contentWindow);
  } catch (e) {
    toast('인쇄 창을 열 수 없습니다. 팝업 차단을 해제하거나 Ctrl+P를 사용하세요.', true);
  }
}

// ============================================================================
// 이상현황
// ============================================================================
function bindAbnormal() {
  $('abnormalMonth').addEventListener('change', renderAbnormal);
}

function renderAbnormal() {
  const sel = $('abnormalMonth');
  const current = sel.value;

  const months = Array.from(new Set(data.inspections.map(monthOf).filter(Boolean)))
    .sort().reverse();

  sel.innerHTML = '<option value="">전체 기간</option>' +
    months.map((m) => `<option value="${m}" ${m === current ? 'selected' : ''}>${m}</option>`).join('');

  const chosen = sel.value;
  const list = data.inspections
    .filter((i) => Number(i.abnormal_count) > 0)
    .filter((i) => !chosen || monthOf(i) === chosen)
    .sort((a, b) => fmt(b.inspected_at).localeCompare(fmt(a.inspected_at)));

  $('abnormalTbody').innerHTML = list.map((i) => `
    <tr>
      <td>${escapeHtml(formatDateTime(i.inspected_at))}</td>
      <td><b>${escapeHtml(i.mgmt_no)}</b></td>
      <td>${escapeHtml(i.location)}</td>
      <td>${escapeHtml(i.type)}</td>
      <td>${escapeHtml(i.inspected_by)}</td>
      <td>${badItemsDetailHtml(i)}</td>
      <td>${escapeHtml(i.note)}</td>
    </tr>`).join('');

  $('abnormalEmpty').textContent = list.length ? '' : '이상 항목이 있는 점검기록이 없습니다.';
}

function badItemsDetailHtml(insp) {
  const items = Array.isArray(insp.items) ? insp.items : [];
  const bads = items.filter((x) => x && String(x.result) === 'bad');
  if (!bads.length) return '-';
  return bads.map((x) =>
    `<span class="badge badge-bad">${escapeHtml(x.label)}</span>` +
    (x.detail ? `<div class="muted">${escapeHtml(x.detail)}</div>` : '')).join('');
}

// ============================================================================
// 설정
// ============================================================================
function bindSettings() {
  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const settings = {
      ...data.settings,
      site_name: $('setSiteName').value.trim(),
      check_url_base: $('setCheckUrl').value.trim(),
    };
    try {
      await postData('save_settings', { settings });
      toast('설정을 저장했습니다.');
      await loadAndRender();
    } catch (err) {
      toast('설정 저장에 실패했습니다.', true);
      console.error(err);
    }
  });
}

function renderSettings() {
  $('setSiteName').value = fmt(data.settings.site_name);
  $('setCheckUrl').value = fmt(data.settings.check_url_base);
}

// ============================================================================
// 점검기록 수동 등록/수정 모달
// ============================================================================
function bindModal() {
  $('modalCancelBtn').addEventListener('click', closeInspectModal);
  $('modalSaveBtn').addEventListener('click', saveInspectModal);
  $('inspectModal').addEventListener('click', (e) => {
    if (e.target === $('inspectModal')) closeInspectModal();
  });
}

function nowLocalDatetime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function openInspectModal(ext, insp) {
  $('modalExtInfo').textContent = `${fmt(ext.mgmt_no)} · ${fmt(ext.location)} · ${fmt(ext.type)}`;
  $('modalInspId').value = insp ? insp.id : '';
  $('modalExtId').value = ext.id;
  $('modalInspector').value = insp ? fmt(insp.inspected_by) : '';
  $('modalDatetime').value = insp ? fmt(insp.inspected_at).slice(0, 16) : nowLocalDatetime();
  $('modalNote').value = insp ? fmt(insp.note) : '';
  $('modalItems').innerHTML = renderModalItems(insp ? insp.items : null);

  $('modalItems').querySelectorAll('.modal-item').forEach((itemEl) => {
    const detailEl = itemEl.querySelector('.modal-item-detail');
    itemEl.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const isBad = radio.checked && radio.value === 'bad';
        detailEl.style.display = isBad ? 'block' : 'none';
        if (isBad) detailEl.focus();
      });
    });
  });

  $('inspectModal').hidden = false;
}

function closeInspectModal() {
  $('inspectModal').hidden = true;
}

function renderModalItems(items) {
  const byKey = {};
  (Array.isArray(items) ? items : []).forEach((x) => { byKey[x.key] = x; });
  return INSPECTION_ITEMS.map((it) => {
    const cur = byKey[it.key];
    const result = cur ? cur.result : 'ok';
    const detail = cur ? cur.detail : '';
    return `<div class="modal-item" data-key="${it.key}">
      <div class="modal-item-label">${escapeHtml(it.label)}</div>
      <div class="modal-item-opts">
        <label class="ok"><input type="radio" name="mi_${it.key}" value="ok" ${result === 'ok' ? 'checked' : ''} /> 정상</label>
        <label class="bad"><input type="radio" name="mi_${it.key}" value="bad" ${result === 'bad' ? 'checked' : ''} /> 이상</label>
        <label class="na"><input type="radio" name="mi_${it.key}" value="na" ${result === 'na' ? 'checked' : ''} /> 해당없음</label>
      </div>
      <input class="modal-item-detail" type="text" placeholder="이상 내용 입력" value="${escapeHtml(detail)}" ${result === 'bad' ? '' : 'style="display:none"'} />
    </div>`;
  }).join('');
}

async function saveInspectModal() {
  const inspector = $('modalInspector').value.trim();
  if (!inspector) { toast('점검자를 입력하세요.', true); $('modalInspector').focus(); return; }

  const inspectedAt = $('modalDatetime').value;
  if (!inspectedAt) { toast('점검일시를 입력하세요.', true); $('modalDatetime').focus(); return; }

  const items = INSPECTION_ITEMS.map((it) => {
    const radio = document.querySelector(`input[name="mi_${it.key}"]:checked`);
    const result = radio ? radio.value : 'ok';
    const detailEl = document.querySelector(`.modal-item[data-key="${it.key}"] .modal-item-detail`);
    const detail = result === 'bad' ? detailEl.value.trim() : '';
    return { key: it.key, label: it.label, result, detail };
  });

  const record = {
    id: $('modalInspId').value || uid('in'),
    extinguisher_id: $('modalExtId').value,
    inspected_by: inspector,
    inspected_at: inspectedAt.length === 16 ? inspectedAt + ':00' : inspectedAt,
    items,
    note: $('modalNote').value.trim(),
  };

  try {
    await postData('save_inspections', { inspections: [record] });
    toast('점검기록을 저장했습니다.');
    closeInspectModal();
    await loadAndRender();
  } catch (err) {
    toast('저장에 실패했습니다.', true);
    console.error(err);
  }
}
