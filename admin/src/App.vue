<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider, zhCN, dateZhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

// 品牌主题：珊瑚主色 + 各语义色与 web 站令牌一一对应
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#FF8A5C',
    primaryColorHover: '#FF9B76',
    primaryColorPressed: '#E06B38',
    primaryColorSuppl: '#E06B38',
    infoColor: '#6FB8E8',
    infoColorHover: '#8BC6ED',
    infoColorPressed: '#4A7FB5',
    infoColorSuppl: '#4A7FB5',
    successColor: '#5FC9A5',
    successColorHover: '#79D2B1',
    successColorPressed: '#2E7D5B',
    successColorSuppl: '#2E7D5B',
    warningColor: '#F0A937',
    warningColorHover: '#F3B855',
    warningColorPressed: '#D18E1F',
    warningColorSuppl: '#D18E1F',
    errorColor: '#E86A6A',
    errorColorHover: '#ED8282',
    errorColorPressed: '#C05050',
    errorColorSuppl: '#C05050',
    borderRadius: '12px',
  },
  Button: {
    // 多邻国式胶囊按钮
    borderRadiusMedium: '999px',
    borderRadiusSmall: '999px',
    borderRadiusTiny: '999px',
    fontWeight: '700',
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
