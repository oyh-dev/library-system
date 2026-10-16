<script setup>
import { availabilityText } from '../utils/format.js';

const props = defineProps({
  book: { type: Object, required: true },
  canBorrow: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['borrow']);

const availability = () => availabilityText(props.book.available, props.book.total);
</script>

<template>
  <article class="book">
    <div class="row spread">
      <span class="tag">{{ book.categoryName || '未分类' }}</span>
      <span class="badge" :class="availability().tone">{{ availability().text }}</span>
    </div>

    <h3>{{ book.title }}</h3>
    <div class="meta">作者：{{ book.author || '—' }}</div>
    <div class="meta">ISBN：{{ book.isbn || '—' }}</div>

    <div class="book-actions">
      <button
        v-if="book.borrowedByMe"
        class="ghost"
        disabled
      >已借阅</button>
      <button
        v-else
        class="primary"
        :disabled="!canBorrow || book.available <= 0 || busy"
        @click="emit('borrow', book)"
      >
        {{ book.available <= 0 ? '无可借副本' : (canBorrow ? '借阅' : '已达上限') }}
      </button>
    </div>
  </article>
</template>
