<script setup>
import { computed, onMounted } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useLibraryStore } from './stores/library.js';

const auth = useAuthStore();
const library = useLibraryStore();
const router = useRouter();

const toast = computed(() => library.toast);

onMounted(() => {
  // 刷新页面后如果本地有令牌，补一次 /me 恢复额度信息
  if (auth.isLoggedIn) auth.loadMe();
});

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <div class="topbar-inner">
        <span class="brand">📚 图书管理系统</span>
        <nav class="nav">
          <RouterLink :to="{ name: 'books' }">图书浏览</RouterLink>
          <RouterLink :to="{ name: 'my-lends' }">我的借阅</RouterLink>
        </nav>
        <div class="userbox">
          <template v-if="auth.isLoggedIn">
            <span>{{ auth.displayName }}</span>
            <span class="badge muted">在借 {{ auth.activeLends }}/{{ auth.maxBorrow }}</span>
            <button class="ghost" @click="logout">退出</button>
          </template>
          <RouterLink v-else :to="{ name: 'login' }">登录</RouterLink>
        </div>
      </div>
    </header>

    <main class="page">
      <RouterView />
    </main>

    <Transition name="fade">
      <div v-if="toast" class="toast" @click="library.clearToast()">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
