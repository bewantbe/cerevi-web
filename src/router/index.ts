import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import Explorer from '../views/Explorer.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage
    },
    {
      path: '/explorer/:specimenId',
      name: 'explorer',
      component: Explorer,
      props: true
    }
  ]
})

export default router
