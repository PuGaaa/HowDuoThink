<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NInput } from "naive-ui";
import { api } from "@/api/client";
import { useAuth } from "@/composables/useAuth";
import authBg from "@/assets/auth_bg.png";
import ShaderBackground from "@/components/ShaderBackground.vue";

const { login } = useAuth();
const route = useRoute();
const router = useRouter();

// default = 初始账号还在用默认密码 → 登录页给出提示（改过密即消失）
const defaultHint = ref(false);

const loginName = ref("");
const password = ref("");
const err = ref("");
const busy = ref(false);

onMounted(async () => {
  try {
    const r = await api.get("/api/auth/default-account");
    if (r.default) defaultHint.value = true;
  } catch {
    // 探测失败不提示
  }
});

async function submit() {
  err.value = "";
  busy.value = true;
  try {
    await login(loginName.value.trim(), password.value);
    const target =
      typeof route.query.redirect === "string" ? route.query.redirect : "/";
    router.push(target);
  } catch (e: any) {
    err.value = e?.message || "登录失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login">
    <!-- 左侧品牌大图（≤1024px 隐藏，让位给单列登录） -->
    <section class="hero">
      <img :src="authBg" alt="" />
    </section>

    <!-- 右侧登录区：噪波光晕集中在这里；移动端单列时铺满全屏 -->
    <section class="aside">
      <ShaderBackground contained />
      <div class="card">
        <h1 class="title">好多星 · 管理端</h1>
        <p class="hint-line">多想，多星。 · 内容与运营控制台</p>

        <div v-if="defaultHint" class="default-tip">
          初始账号：<b>admin / HaoDuo@2026</b>（仅首次引导，登录后请修改密码）
        </div>

        <div class="field">
          <label>账号</label>
          <NInput
            v-model:value="loginName"
            placeholder="账号"
            @keyup.enter="submit"
          />
        </div>
        <div class="field">
          <label>密码</label>
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            @keyup.enter="submit"
          />
        </div>
        <p v-if="err" class="err">{{ err }}</p>
        <NButton
          type="primary"
          block
          size="large"
          :loading="busy"
          @click="submit"
          >登录</NButton
        >
      </div>
    </section>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  min-height: 100dvh; /* 移动端浏览器地址栏收缩时不跳动 */
  display: flex;
}

/* —— 左侧品牌大图：铺满裁切，任何窗口比例不变形 —— */
.hero {
  flex: 1 1 52%;
  min-width: 0;
  position: relative;
  border-right: 1px solid var(--glass-border);
  overflow: hidden;
}

.hero img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* —— 右侧登录区 —— */
.aside {
  flex: 1 1 48%;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 32px;
}

.card {
  position: relative;
  z-index: 1;
  width: min(380px, 100%);
  background: var(--glass-bg);
  border-radius: 20px;
  padding: 36px 34px;
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
}

.title {
  font-size: 19px;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 4px;
  text-align: center;
}

.hint-line {
  text-align: center;
  color: var(--ink3);
  font-size: 12px;
  margin: 0 0 20px;
}

.default-tip {
  background: var(--lemon-soft);
  color: var(--lemon-deep);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  margin-bottom: 18px;
  text-align: center;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink2);
  margin-bottom: 6px;
}

.err {
  color: var(--red-deep);
  font-size: 13px;
  margin: 0 0 10px;
}

/* —— 平板/手机：单列，大图让位，噪波铺满全屏 —— */
@media (max-width: 1024px) {
  .hero {
    display: none;
  }

  .aside {
    flex: 1 1 auto;
    padding: 32px 20px;
  }
}
</style>
