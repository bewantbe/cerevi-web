import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import SpecimenViewer from '../views/SpecimenViewer.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage
    },
    {
      path: '/specimen/:specimenId',
      redirect: (to) => `/specimen/${to.params.specimenId}/explorer`
    },
    {
      path: '/specimen/:specimenId/:mode',
      name: 'specimen',
      component: SpecimenViewer,
      props: true
    }
  ]
})

export default router
