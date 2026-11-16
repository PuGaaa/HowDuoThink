<script setup lang="ts">
import LoginModal from "~/components/account/LoginModal.vue";
import ProfileModal from "~/components/account/ProfileModal.vue";
import SetPasswordModal from "~/components/account/SetPasswordModal.vue";
import ChangePasswordModal from "~/components/account/ChangePasswordModal.vue";
import UserMenu from "~/components/account/UserMenu.vue";
import LiquidBackdrop from "~/components/layout/LiquidBackdrop.vue";

/** 应用外壳：顶栏（UserMenu）+ 路由出口 + 页脚 + 账号弹窗挂载。
 * 登录态走 useCurrentUser（ensure 拉权威资料）；登录弹窗开关由 useLoginPrompt 全局承载、
 * LoginModal 自接线；个人信息 → 设置/修改密码的跳转经 openPassword 在外壳层编排。
 * 弹窗组件显式导入：components/<dir>/ 下的自动注册名带目录前缀，裸名解析不到。 */
const { ensure } = useCurrentUser();
const profileOpen = ref(false);
const pwMode = ref<"set" | "change" | null>(null);
const topbarInner = ref<HTMLElement | null>(null);

onMounted(() => {
  void ensure();
});

/** AI 页进出过渡：导航栏内容滑落归位（topbar__inner 静止态 margin:0 auto 居中，
 * auto 不可插值，故以等效 transform+opacity 位移动画呈现归位过程）。
 * WAAPI 直接驱动：播完自动回落静止态，快速连续切换天然无残留。
 * prefers-reduced-motion 用户跳过（与全站 reduced-motion 习惯一致）。 */
const route = useRoute();
watch(
  () => route.path,
  (path, prev) => {
    const touchesAi = path.startsWith("/ai") || !!prev?.startsWith("/ai");
    if (!touchesAi || !topbarInner.value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    topbarInner.value.animate(
      [
        { transform: "translateY(-14px)", opacity: 0.2 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  },
);

function openPassword(mode: "set" | "change") {
  pwMode.value = mode;
  profileOpen.value = false; // 与原行为一致：进密码弹窗时收起个人信息
}
function closePassword() {
  pwMode.value = null;
}
function backToProfile() {
  pwMode.value = null;
  profileOpen.value = true;
}
</script>

<template>
  <div>
    <!-- 底层漂移色团：玻璃材质的透底，最优先挂载（z-index: -1，压在内容之下） -->
    <!-- <LiquidBackdrop /> -->
    <!-- 通栏吸顶顶栏：玻璃材质（.topbar--full 样式在 main.css，引用 glass.css 变量） -->
    <header class="topbar topbar--full">
      <div ref="topbarInner" class="topbar__inner">
        <NuxtLink to="/" class="topbar__brand">
          <span class="topbar__brand-full">好多星 HowDuoThink · 社区</span>
          <span class="topbar__brand-short">好多星 · 社区</span>
        </NuxtLink>
        <nav class="topbar__nav">
          <NuxtLink to="/ai" class="topbar__link topbar__link--ai"
            >AI 排错</NuxtLink
          >
          <NuxtLink to="/solutions" class="topbar__link">解决逻辑</NuxtLink>
          <NuxtLink to="/submit" class="topbar__link">投稿</NuxtLink>
          <UserMenu
            @open-profile="profileOpen = true"
            @open-password="openPassword"
          />
        </nav>
      </div>
    </header>
    <div class="shell">
      <main class="main"><NuxtPage /></main>
      <footer class="footer">
        好多星 HowDuoThink · 多想，多星。—— Web 社区（投稿与解决逻辑展示，闯关在
        App）· <NuxtLink to="/privacy" class="footer__link">隐私政策</NuxtLink>
      </footer>
    </div>

    <!-- 账号弹窗群：登录（useLoginPrompt 自接线）/ 个人信息 → 设置·修改密码 -->
    <LoginModal />
    <ProfileModal
      v-if="profileOpen"
      @close="profileOpen = false"
      @open-password="openPassword"
    />
    <SetPasswordModal
      v-if="pwMode === 'set'"
      @close="closePassword"
      @back="backToProfile"
    />
    <ChangePasswordModal
      v-if="pwMode === 'change'"
      @close="closePassword"
      @back="backToProfile"
    />
  </div>
</template>
