// 초경량 DOM 생성 헬퍼 (프레임워크 없이 상태-뷰 분리 구조를 유지하기 위한 유틸)
//
// `disabled: true`는 네이티브 disabled 속성으로 넘기지 않는다 - 사용자가 실기기로
// 확인한 버그: 브라우저가 disabled 폼 컨트롤(버튼 등)을 상호작용 파이프라인에서
// 아예 제외하는데, 이때 CSS `touch-action: manipulation`도 같이 적용이 안 되는
// 경우가 있어서 "활성 버튼은 멀쩡한데 비활성 버튼을 탭하면 더블탭 확대로 오인된다"
// 현상이 발생했다(활성 버튼만 실제로 touch-action의 보호를 받고, disabled 버튼은
// 그 보호 밖으로 밀려나 브라우저 기본 제스처 처리로 넘어가는 것으로 추정). 대신
// `is-disabled` 클래스로 시각적 비활성 표시만 하고, 클릭 핸들러 쪽에서 그 클래스가
// 있으면 무시하도록 막는다 - 버튼 자체는 끝까지 정상적인 상호작용 요소로 남아있어
// touch-action이 그대로 적용된다.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  const disabled = Boolean(props?.disabled);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'disabled') {
      if (value) {
        node.classList.add('is-disabled');
        node.setAttribute('aria-disabled', 'true'); // 접근성 - 네이티브 disabled를 안 쓰는 대신 의미만 표시
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), (e) => {
        if (disabled) return;
        value(e);
      });
    } else if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
