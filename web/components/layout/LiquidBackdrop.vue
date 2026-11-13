<script setup lang="ts">
/** 页面底层漂移色团（任务 11）：给玻璃材质「可透的东西」。
 * - fixed 全屏容器 z-index: -1：位于 body 背景（#FAFAFA，随画布绘制）之上、一切内容之下
 *   （顶栏 z-40、菜单 z-50、弹窗 z-98/99 都在其上）。
 * - 三个低饱和色团（珊瑚/薄荷/天蓝，品牌色的低 alpha 版），静态 filter: blur(120px)。
 * - 漂移只动画 transform（GPU 合成），不动画 filter 本身；prefers-reduced-motion
 *   下的停帧由 glass.css 统一接管。
 * - pointer-events: none + aria-hidden：纯装饰，不拦截交互、不进无障碍树。 */
</script>

<template>
  <div class="liquid-backdrop" aria-hidden="true">
    <div class="liquid-backdrop__blob liquid-backdrop__blob--coral"></div>
    <div class="liquid-backdrop__blob liquid-backdrop__blob--mint"></div>
    <div class="liquid-backdrop__blob liquid-backdrop__blob--sky"></div>
  </div>
</template>

<style scoped>
.liquid-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden; /* 色团允许探出视口，容器裁剪 → 不产生横向滚动 */
  pointer-events: none;
}
.liquid-backdrop__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  will-change: transform;
}
.liquid-backdrop__blob--coral {
  width: clamp(360px, 52vw, 720px);
  height: clamp(360px, 52vw, 720px);
  top: -6%;
  left: -4%;
  background: rgba(255, 138, 92, 0.34);
  animation: liquid-drift-a 46s ease-in-out infinite alternate;
}
.liquid-backdrop__blob--mint {
  width: clamp(320px, 46vw, 640px);
  height: clamp(320px, 46vw, 640px);
  bottom: -8%;
  right: -5%;
  background: rgba(95, 201, 165, 0.30);
  animation: liquid-drift-b 58s ease-in-out infinite alternate;
}
.liquid-backdrop__blob--sky {
  width: clamp(300px, 42vw, 560px);
  height: clamp(300px, 42vw, 560px);
  top: 36%;
  left: 46%;
  background: rgba(111, 184, 232, 0.28);
  animation: liquid-drift-c 64s ease-in-out infinite alternate;
}
/* 漂移路径刻意互相错开（分别向右下/左上/左下），避免三团同向「平移感」 */
@keyframes liquid-drift-a {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(9vw, 7vh, 0) scale(1.12); }
}
@keyframes liquid-drift-b {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-8vw, -9vh, 0) scale(1.08); }
}
@keyframes liquid-drift-c {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-10vw, 8vh, 0) scale(1.15); }
}
</style>
