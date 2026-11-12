<script setup lang="ts">
/** 弹窗外壳：遮罩 + 居中卡片 + 内容 slot（沿用原 .lmask/.lmodal 视觉，样式随组件走）。
 * 遮罩与卡片是兄弟节点：点遮罩 emit('close')，卡片内点击不受影响。
 * 可见性由父级 v-if 控制（整组件挂载/卸载）。 */
defineProps<{ title?: string }>()
defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="lmask" @click="$emit('close')"></div>
  <div class="lmodal" role="dialog" aria-modal="true">
    <h2 v-if="title" class="lmodal__title">{{ title }}</h2>
    <slot />
  </div>
</template>

<style scoped>
.lmask { position: fixed; inset: 0; background: rgba(42, 39, 51, 0.45); backdrop-filter: blur(3px); z-index: 98; }
.lmodal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: calc(100% - 40px); max-width: 440px; margin: 0;
  background: var(--bg); border-radius: 18px; padding: 26px 28px;
  max-height: 86vh; overflow-y: auto;
  box-shadow: 0 24px 64px rgba(42, 39, 51, 0.28);
  z-index: 99;
}
.lmodal__title { font-size: 19px; margin: 0 0 20px; text-align: center; font-weight: 800; }
/* 弹窗通用的返回/取消类小按钮：slot 内容在 .lmodal 之下，用 :deep 覆盖到各弹窗 */
.lmodal :deep(.lmodal__back) { display: block; margin: 14px auto 0; background: none; border: 0; color: var(--ink3); font-size: 13px; cursor: pointer; text-decoration: none; }
.lmodal :deep(.lmodal__back--accent) { color: var(--coral); font-weight: 700; }
</style>
