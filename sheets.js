// ============================================================================
// 소화기 점검 관리 시스템 - Google Apps Script 연동 헬퍼
// - 읽기: fetch(CORS) 우선, 실패 시 JSONP(재시도)로 폴백
// - 쓰기: no-cors POST (수신 확인 불가 → verifyInspections 로 검증)
// ============================================================================
import { APPS_SCRIPT_URL } from './sheets-config.js';

let jsonpSeq = 0;

function jsonpOnce(params) {
  return new Promise((resolve, reject) => {
    const cbName = '__fe_cb_' + (++jsonpSeq) + '_' + Date.now();
    const script = document.createElement('script');
    script.id = cbName;

    const timer = setTimeout(() => {
      delete window[cbName];
      script.remove();
      reject(new Error('Apps Script 응답 시간 초과'));
    }, 20000);

    const cleanup = () => {
      clearTimeout(timer);
      delete window[cbName];
      script.remove();
    };

    window[cbName] = (data) => {
      cleanup();
      if (data && data.ok) resolve(data);
      else reject(new Error((data && data.error) || 'Apps Script 오류'));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Apps Script를 불러오지 못했습니다.'));
    };

    const qs = ['callback=' + encodeURIComponent(cbName)];
    Object.keys(params || {}).forEach((k) => {
      qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    });
    script.src = `${APPS_SCRIPT_URL}?${qs.join('&')}`;
    document.head.appendChild(script);
  });
}

// 실패 시 재시도(기본 2회) → 네트워크가 불안정해도 일시적인 실패를 자동 복구
function jsonp(params, retries = 2) {
  return jsonpOnce(params).catch((err) => {
    if (retries <= 0) throw err;
    return jsonp({ ...(params || {}), t: Date.now() }, retries - 1);
  });
}

// Apps Script가 CORS 헤더(access-control-allow-origin:*)를 제공하므로
// fetch로 직접 읽는 경로도 사용할 수 있습니다. JSONP로 감싼 응답은 풀어서 파싱합니다.
async function fetchJson(url) {
  const resp = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const text = String(await resp.text() || '').trim();
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start === -1 || end === -1 || end < start) {
    return JSON.parse(text);
  }
  return JSON.parse(text.slice(start + 1, end));
}

// 관리자 화면용: 소화기 + 점검기록 + 설정 전체 로드
export function loadAllData() {
  return jsonp({ t: Date.now() });
}

// 모바일 점검 페이지용: 소화기 목록 + 설정만 로드 (가벼운 응답)
// fetch(CORS)를 우선 시도하고, 실패하면 JSONP(재시도)로 폴백합니다.
export async function loadCheckData() {
  try {
    const data = await fetchJson(`${APPS_SCRIPT_URL}?action=check&t=${Date.now()}`);
    if (data && data.ok) return data;
    throw new Error((data && data.error) || 'Apps Script 오류');
  } catch (err) {
    console.warn('CORS fetch 실패 → JSONP 재시도:', err);
  }
  return jsonp({ action: 'check', t: Date.now() });
}

// 업로드 검증: 요청한 점검기록 id 중 서버에 존재하는 id 목록 반환
export function verifyInspections(ids) {
  return jsonp({ action: 'verify', ids: (ids || []).join(','), t: Date.now() });
}

// no-cors POST: 응답을 읽을 수 없으므로 성공 여부는 verifyInspections 로 확인합니다.
export function postData(action, payload = {}) {
  return fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });
}
