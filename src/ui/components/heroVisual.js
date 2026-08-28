import { el } from './dom.js';
import { TAR_STAGE_IMAGES, DRAGON_DRAIN_IMAGE } from '../../data/assets.js';

// 필드에 배치된 개체(instance)의 상태에 따라 이미지가 달라지는 영웅 전용 처리.
// 그 외에는 heroDef.image(고정 초상화)를 그대로 사용한다.
export function resolveHeroImage(heroDef, instance) {
  if (instance) {
    if (heroDef.id === 'm_tar') return TAR_STAGE_IMAGES[instance.tarStage ?? 1];
    if (heroDef.id === 'm_dragon' && instance.immortalEligible) return DRAGON_DRAIN_IMAGE;
  }
  return heroDef.image;
}

export function heroImage(heroDef, { className = '', instance = null, src = null } = {}) {
  return el('img', {
    class: `hero-image ${className}`.trim(),
    src: src ?? resolveHeroImage(heroDef, instance),
    alt: heroDef.name,
  });
}
