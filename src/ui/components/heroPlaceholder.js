import { el } from './dom.js';

// 이미지 자산 처리는 이번 리팩토링 범위에서 제외 - 등급별 단색 블록 + 이름 텍스트로 임시 대체한다.
// 실제 이미지 매핑 데이터(src/data/heroes.js의 image 필드, src/data/assets.js)는 그대로 유지되어 있으며,
// 구조 정리가 끝난 뒤 이 컴포넌트만 다시 이미지 기반으로 교체하면 된다.
export function heroPlaceholder(heroDef, { className = '', showName = true, label } = {}) {
  return el('div', { class: `hero-placeholder tier-${heroDef.tier} ${className}`.trim() }, [
    showName ? el('span', { class: 'hero-placeholder-name', text: label ?? heroDef.name }) : null,
  ]);
}

// 영웅이 아닌 일반 이미지 자리(보스, 배경 등)를 위한 단색 블록.
export function placeholderBlock(label, { className = '' } = {}) {
  return el('div', { class: `placeholder-block ${className}`.trim() }, [
    label ? el('span', { class: 'placeholder-block-label', text: label }) : null,
  ]);
}
