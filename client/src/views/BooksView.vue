<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useLibraryStore } from '../stores/library.js';
import BookCard from '../components/BookCard.vue';
import StatsBar from '../components/StatsBar.vue';

const auth = useAuthStore();
const library = useLibraryStore();

const keyword = ref('');
const borrowingId = ref(null);

onMounted(async () => {
  await Promise.all([library.loadCategories(), library.loadOverview()]);
  await library.loadBooks();
});

/** 输入停止 350ms 后再查，避免每敲一个字就打一次接口 */
let timer = null;
watch(keyword, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => library.setKeyword(value.trim()), 350);
});

const canBorrow = computed(() => !auth.isLoggedIn || auth.canBorrowMore);
const summaryText = computed(() => {
  const { keyword: kw, categoryId, total } = library;
  if (kw) return `搜索「${kw}」共 ${total} 条结果`;
  if (categoryId) return `该分类共 ${total} 本`;
  return `共 ${total} 本图书`;
});

async function onBorrow(book) {
  if (!auth.isLoggedIn) return;
  borrowingId.value = book.id;
  const result = await library.borrow(book.id);
  if (result.ok) {
    auth.bumpActiveLends(1);
    await Promise.all([library.loadBooks(), library.loadOverview()]);
  }
  borrowingId.value = null;
}
</script>

<template>
  <div class="row" style="margin-bottom: 14px">
    <StatsBar :stats="library.overview" />
  </div>

  <div class="card">
    <div class="row wrap">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索书名 / 作者 / ISBN"
        style="flex: 1; min-width: 200px"
      />
      <select :value="library.categoryId" @change="library.setCategory($event.target.value)">
        <option value="">全部分类</option>
        <option v-for="c in library.categories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
      </select>
      <span class="muted small">{{ summaryText }}</span>
    </div>
  </div>

  <div v-if="library.error" class="alert error" style="margin-top: 14px">{{ library.error }}</div>

  <div v-if="!auth.isLoggedIn" class="alert info" style="margin-top: 14px">
    当前是游客模式，<RouterLink :to="{ name: 'login' }">登录</RouterLink> 后即可借阅图书。
  </div>

  <div v-if="library.loading" class="book-grid" style="margin-top: 14px">
    <div v-for="i in 4" :key="i" class="skeleton"></div>
  </div>

  <div v-else-if="library.hasBooks" class="book-grid" style="margin-top: 14px">
    <BookCard
      v-for="book in library.books"
      :key="book.id"
      :book="book"
      :can-borrow="canBorrow"
      :busy="borrowingId === book.id"
      @borrow="onBorrow"
    />
  </div>

  <div v-else class="card center muted" style="margin-top: 14px">
    没有匹配的图书，换个关键词试试
  </div>

  <div v-if="library.totalPages > 1" class="row center" style="margin-top: 16px; justify-content: center">
    <button :disabled="library.page <= 1" @click="library.goPage(library.page - 1)">上一页</button>
    <span class="muted small">第 {{ library.page }} / {{ library.totalPages }} 页</span>
    <button :disabled="library.page >= library.totalPages" @click="library.goPage(library.page + 1)">下一页</button>
  </div>
</template>
