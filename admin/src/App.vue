<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider, zhCN, dateZhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

// 品牌主题：冷调极简 + 珊瑚点缀；语义色与管理端令牌一一对应（styles/main.css）
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#FF8A5C',
    primaryColorHover: '#FF9B76',
    primaryColorPressed: '#E06B38',
    primaryColorSuppl: '#E06B38',
    infoColor: '#4E8FD9',
    infoColorHover: '#6BA3E0',
    infoColorPressed: '#3A6FAF',
    infoColorSuppl: '#3A6FAF',
    successColor: '#3BA97F',
    successColorHover: '#55B890',
    successColorPressed: '#2E7D5B',
    successColorSuppl: '#2E7D5B',
    warningColor: '#E9A23B',
    warningColorHover: '#EDB258',
    warningColorPressed: '#C98A25',
    warningColorSuppl: '#C98A25',
    errorColor: '#D95C5C',
    errorColorHover: '#E07676',
    errorColorPressed: '#B04A4A',
    errorColorSuppl: '#B04A4A',
    borderRadius: '10px',
    inputColor: 'rgba(255, 255, 255, 0.72)',
  },
  Button: {
    borderRadiusMedium: '10px',
    borderRadiusSmall: '10px',
    borderRadiusTiny: '8px',
    fontWeight: '600',
  },
  Card: {
    borderRadius: '16px',
  },
  Tag: {
    borderRadius: '999px',
  },
}
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NMessageProvider>
      <NDialogProvider>
        <RouterView />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
