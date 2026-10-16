<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useLibraryStore } from '../stores/library.js';
import { formatDate, lendStatus, quotaText } from '../utils/format.js';

const auth = useAuthStore();
const library = useLibraryStore();
const returningId = ref(null);

onMounted(async () => {
  await library.loadMyLends();
  library.loadOverview();
});

const stats = computed(() => library.myStats);
const hasLends = computed(() => library.myLends.length > 0);

async function onReturn(lend) {
  returningId.value = lend.id;
  const result = await library.giveBack(lend.id);
  if (result.ok) {
    auth.bumpActiveLends(-1);
    await Promise.all([library.loadMyLends(), library.loadOverview(), library.loadBooks()]);
  }
  returningId.value = null;
}
</script>

<template>
  <div class="card">
    <div class="row spread wrap">
      <div>
        <div style="font-weight: 600">{{ auth.displayName }} 的借阅记录</div>
        <div class="muted small">
          当前在借 {{ stats.active }} 本，已归还 {{ stats.returned }} 本，共 {{ stats.total }} 条记录
        </div>
      </div>
      <div class="row">
        <span class="muted small">借阅额度</span>
        <span class="badge" :class="auth.canBorrowMore ? 'ok' : 'warn'">
          {{ quotaText(stats.active, stats.maxBorrow) }}
        </span>
      </div>
    </div>
  </div>

  <div v-if="!hasLends" class="card center muted" style="margin-top: 14px">
    还没有借阅记录，去
    <RouterLink :to="{ name: 'books' }">图书浏览</RouterLink>
    借一本吧
  </div>

  <div v-else class="card" style="margin-top: 14px; padding: 0; overflow: hidden">
    <table>
      <thead>
        <tr>
          <th style="width: 34%">书名</th>
          <th>借出日期</th>
          <th>应还日期</th>
          <th>状态</th>
          <th style="width: 90px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="lend in library.myLends" :key="lend.id">
          <td>
            <div>{{ lend.title }}</div>
            <div class="muted small">{{ lend.author }}</div>
          </td>
          <td>{{ formatDate(lend.lendAt) }}</td>
          <td>{{ formatDate(lend.dueAt) }}</td>
          <td>
            <span class="badge" :class="{
              ok: lendStatus(lend).code === 'returned',
              warn: lendStatus(lend).code === 'due-soon',
              danger: lendStatus(lend).code === 'overdue',
              muted: lendStatus(lend).code === 'normal',
            }">{{ lendStatus(lend).label }}</span>
          </td>
          <td>
            <button
              v-if="lend.status === 'borrowed'"
              class="danger"
              :disabled="returningId === lend.id"
              @click="onReturn(lend)"
            >{{ returningId === lend.id ? '归还中…' : '归还' }}</button>
            <span v-else class="muted small">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
