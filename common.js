// ============================================================================
// 소화기 점검 관리 시스템 - 공용 헬퍼
// ============================================================================

// 점검 항목 (모바일 점검창에 표시). result: 'ok' | 'bad' | 'na'
export const INSPECTION_ITEMS = [
  { key: 'body', label: '본체(외관) 손상·부식·변형 없음' },
  { key: 'gauge', label: '압력게이지 지침 정상(녹색) 범위' },
  { key: 'pin_seal', label: '안전핀·봉인 정상' },
  { key: 'hose_nozzle', label: '호스·노즐 손상 없음' },
  { key: 'sign', label: '설치위치 적정·식별표지 부착' },
  { key: 'used', label: '사용흔적(방출) 없음' },
  { key: 'obstacle', label: '주변 통행 장애물 없음' },
  { key: 'label', label: '관리번호·점검표 부착 상태' },
];

export const RESULT_LABELS = { ok: '정상', bad: '이상', na: '해당없음' };

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmt(v) {
  return v == null ? '' : String(v);
}

// 로컬(Asia/Seoul 기준) YYYY-MM
export function localMonthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

export function currentMonthKey() {
  return localMonthKey(new Date());
}

// 'YYYY-MM-DDTHH:mm:ss' → 'YYYY-MM-DD HH:mm'
export function formatDateTime(iso) {
  const s = fmt(iso);
  if (!s) return '-';
  return s.replace('T', ' ').slice(0, 16);
}

export function formatDate(d) {
  const s = fmt(d);
  if (!s) return '-';
  return s.slice(0, 10);
}

// 고유 id 생성 (소화기/점검기록)
export function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
