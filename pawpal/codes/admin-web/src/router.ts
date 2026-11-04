import type { AdminPage } from '@pawpal/shared';
import { createRouter, createWebHistory } from 'vue-router';
import { currentAdmin } from './api/admin';
import { whenLoggedOut } from './api/payments';
import { routeDecision } from './session';
import Dashboard from './views/Dashboard.vue';
import Login from './views/Login.vue';
import NoAccess from './views/NoAccess.vue';
import Payments from './views/Payments.vue';
import CaregiverReview from './views/CaregiverReview.vue';
import CaregiverReviewDetail from './views/CaregiverReviewDetail.vue';
import CaregiverChangeDetail from './views/CaregiverChangeDetail.vue';
import PetCheck from './views/PetCheck.vue';
import PetCheckDetail from './views/PetCheckDetail.vue';
import Promos from './views/Promos.vue';
import Rules from './views/Rules.vue';
import TestTools from './views/TestTools.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** The permission this page needs (E2-4). */
    page?: AdminPage;
    /** Shown without login and without the side menu. */
    public?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login, meta: { public: true } },
    { path: '/no-access', name: 'no-access', component: NoAccess },
    { path: '/', name: 'dashboard', component: Dashboard, meta: { page: 'dashboard' } },
    { path: '/caregivers', name: 'caregivers', component: CaregiverReview, meta: { page: 'caregivers' } },
    { path: '/caregivers/:id/change', name: 'caregiver-change', component: CaregiverChangeDetail, meta: { page: 'caregivers' } },
    { path: '/caregivers/:id', name: 'caregiver', component: CaregiverReviewDetail, meta: { page: 'caregivers' } },
    { path: '/pets', name: 'pets', component: PetCheck, meta: { page: 'pets' } },
    { path: '/pets/:id', name: 'pet', component: PetCheckDetail, meta: { page: 'pets' } },
    { path: '/rules', name: 'rules', component: Rules, meta: { page: 'rules' } },
    { path: '/promos', name: 'promos', component: Promos, meta: { page: 'promos' } },
    { path: '/payments', name: 'payments', component: Payments, meta: { page: 'payments' } },
    { path: '/test-tools', name: 'test-tools', component: TestTools, meta: { page: 'test-tools' } },
  ],
});

// Every page needs an admin login and that page's permission (the server checks again on each call).
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const decision = routeDecision(await currentAdmin(), to.meta.page);
  if (decision === 'login') return { path: '/login', query: { redirect: to.fullPath } };
  if (decision === 'no-access') return { path: '/no-access', query: { page: to.meta.page } };
  return true;
});

whenLoggedOut(() => {
  const here = router.currentRoute.value;
  if (!here.meta.public) void router.push({ path: '/login', query: { redirect: here.fullPath } });
});
