<script setup>
defineProps({
  stats: { type: Object, default: null },
});
</script>

<template>
  <div v-if="stats" class="stats">
    <div class="stat">
      <div class="num">{{ stats.totalBooks }}</div>
      <div class="label">图书种类</div>
    </div>
    <div class="stat">
      <div class="num">{{ stats.availableCopies }}</div>
      <div class="label">可借副本</div>
    </div>
    <div class="stat">
      <div class="num">{{ stats.activeLends }}</div>
      <div class="label">在借中</div>
    </div>
    <div class="stat">
      <div class="num">{{ stats.utilization }}%</div>
      <div class="label">在借率</div>
    </div>
  </div>
</template>
