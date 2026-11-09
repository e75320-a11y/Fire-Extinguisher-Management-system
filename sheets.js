// ============================================================================
// 소화기 점검 관리 시스템 - Google Apps Script 연동 헬퍼
// - 읽기: JSONP (Apps Script는 CORS 헤더를 주지 않아 script 태그로 우회)
// - 쓰기: no-cors POST (수신 확인 불가 → verifyInspections 로 검증)
// ============================================================================
import { APPS_SCRIPT_URL } from './sheets-config.js';

let jsonpSeq = 0;

function jsonp(params) {
  return new Promise((resolve, reject) => {
    const cbName = '__fe_cb_' + (++jsonpSeq) + '_' + Date.now();
    const script = document.createElement('script');
    script.id = cbName;

    const timer = setTimeout(() => {
      delete window[cbName];
      script.remove();
      reject(new Error('Apps Script 응답 시간 초과'));
    }, 25000);

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

// 관리자 화면용: 소화기 + 점검기록 + 설정 전체 로드
export function loadAllData() {
  return jsonp({ t: Date.now() });
}

// 모바일 점검 페이지용: 소화기 목록 + 설정만 로드 (가벼운 응답)
export function loadCheckData() {
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
