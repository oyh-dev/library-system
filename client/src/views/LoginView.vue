<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useLibraryStore } from '../stores/library.js';

const auth = useAuthStore();
const library = useLibraryStore();
const route = useRoute();
const router = useRouter();

const username = ref('zhangsan');
const password = ref('123456');

onMounted(() => {
  library.loadOverview();
});

async function submit() {
  if (auth.loading) return;
  const ok = await auth.login(username.value.trim(), password.value);
  if (ok) {
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/books';
    router.push(target);
  }
}

function useDemo(name) {
  username.value = name;
  password.value = '123456';
}
</script>

<template>
  <div class="login-wrap">
    <div class="card login-card">
      <h1>图书管理系统</h1>
      <p class="muted small" style="margin-top: 0">登录后可以借书、还书、查看借阅记录</p>

      <form @submit.prevent="submit">
        <div class="field">
          <label for="username">用户名</label>
          <input id="username" v-model="username" autocomplete="username" placeholder="请输入用户名" />
        </div>
        <div class="field">
          <label for="password">密码</label>
          <input id="password" v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" />
        </div>

        <div v-if="auth.error" class="alert error" style="margin-bottom: 12px">{{ auth.error }}</div>

        <button class="primary" style="width: 100%" type="submit" :disabled="auth.loading">
          {{ auth.loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <div class="hint" style="margin-top: 14px">
        <div><b>演示账号</b>（密码都是 123456）</div>
        <div class="row wrap" style="margin-top: 6px">
          <button class="ghost" type="button" @click="useDemo('zhangsan')">张三</button>
          <button class="ghost" type="button" @click="useDemo('lisi')">李四</button>
          <button class="ghost" type="button" @click="useDemo('wangwu')">王五</button>
        </div>
      </div>

      <p class="center small" style="margin-bottom: 0">
        <RouterLink :to="{ name: 'books' }">先随便看看图书 →</RouterLink>
      </p>
    </div>
  </div>
</template>
