import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import BooksView from '../views/BooksView.vue';
import MyLendsView from '../views/MyLendsView.vue';
import { getToken } from '../api/token.js';

const routes = [
  { path: '/', redirect: '/books' },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/books', name: 'books', component: BooksView, meta: { title: '图书浏览' } },
  { path: '/my-lends', name: 'my-lends', component: MyLendsView, meta: { title: '我的借阅' } },
  { path: '/:pathMatch(.*)*', redirect: '/books' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 路由守卫：未登录只能看图书列表（公开接口），
 * 需要身份的页面跳回登录页并带上 redirect。
 */
router.beforeEach((to) => {
  const loggedIn = Boolean(getToken());
  if (to.meta.public) {
    if (loggedIn && to.name === 'login') return { name: 'books' };
    return true;
  }
  if (to.name === 'my-lends' && !loggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
