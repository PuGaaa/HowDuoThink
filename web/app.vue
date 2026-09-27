<template>
  <div class="shell">
    <header class="topbar">
      <NuxtLink to="/" class="topbar__brand">排错推理训练场 · 社区</NuxtLink>
      <nav class="topbar__nav">
        <NuxtLink to="/solutions" class="topbar__link">解决逻辑</NuxtLink>
        <NuxtLink to="/submit" class="topbar__link">投稿</NuxtLink>
        <NuxtLink to="/me" class="topbar__link">我的</NuxtLink>
      </nav>
    </header>
    <main class="main"><NuxtPage /></main>
    <footer class="footer">给 agent 时代程序员的排错推理训练场 · Web 社区（投稿与解决逻辑展示，闯关在 App）</footer>
  </div>
</template>
