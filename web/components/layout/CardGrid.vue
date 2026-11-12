<script setup lang="ts">
/** 宽幅卡片网格（任务 12）：≥900px 3 栏、600–900px 2 栏、≤600px 单栏，
 * 断点只取 600/900 两个，与 shell 的移动断点一致。
 * 网格内 .card 的默认 margin-bottom 归零，间距统一由 gap 控制；
 * 卡片作为网格子项默认拉伸，同行等高。 */
</script>

<template>
  <div class="card-grid"><slot /></div>
</template>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 18px;
}
.card-grid :deep(.card) {
  margin-bottom: 0;
}
@media (max-width: 900px) {
  .card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
