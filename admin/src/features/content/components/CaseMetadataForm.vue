<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NInput, NInputNumber, NSelect } from 'naive-ui'
const meta = defineModel<{part:string;chapterId:string;order:number;typeTags:string}>({required:true})
defineProps<{readOnly:boolean}>()
const emit = defineEmits<{apply:[]}>()
const chapters = [
  ['error-reading','读懂报错','apprentice'],['access','接入层之夜','apprentice'],['build','构建与依赖','apprentice'],['integration','联调之夜','apprentice'],
  ['contract','接口契约','engineer'],['data','数据','engineer'],['config-boot','配置与启动','engineer'],['runtime','运行时','engineer'],
  ['concurrency','并发','master'],['observability','可观测性','master'],['security','安全','master'],['evolution','演进','master'],['messaging','消息','master'],['deployment','部署','master'],['network','网络','master'],['testing','测试','master'],
]
const options = computed(() => chapters.filter(item => item[2] === meta.value.part).map(item => ({label:item[1],value:item[0]})))
</script>
<template>
  <section class="panel glass-panel">
    <h2>篇章信息</h2>
    <div class="grid">
      <label>篇<NSelect v-model:value="meta.part" :disabled="readOnly" :options="[{label:'侦探学徒篇',value:'apprentice'},{label:'一线工兵篇',value:'engineer'},{label:'资深值班篇',value:'master'}]" /></label>
      <label>章<NSelect v-model:value="meta.chapterId" :disabled="readOnly" :options="options" /></label>
      <label>排序<NInputNumber v-model:value="meta.order" :disabled="readOnly" :min="0" :max="999" /></label>
    </div>
    <label>机理标签（逗号分隔）<NInput v-model:value="meta.typeTags" :readonly="readOnly" /></label>
    <NButton v-if="!readOnly" size="small" @click="emit('apply')">应用篇章信息到待发布正文</NButton>
    <p>篇章调整与正文一起保存或发布；已发布内容不会因在这里编辑而立即改变。</p>
  </section>
</template>
<style scoped>
h2 { font-size:16px; margin:0 0 16px; } .grid { display:grid; grid-template-columns:1fr 1.4fr .7fr; gap:14px; }
label { display:grid; gap:8px; margin-bottom:14px; font-size:13px; } p { color:var(--ink3); font-size:12px; line-height:1.6; }
@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style>
