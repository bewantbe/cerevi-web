<template>
  <footer class="app-footer">
    <div class="footer-inner">
      <div>
        <p class="footer-kicker">Contact</p>
        <h2>VISoR collaboration and data access</h2>
      </div>
      <div class="footer-contact">
        <p>For dataset access, atlas integration, or research collaboration, contact the VISoR project maintainers through the repository or your institutional collaboration channel.</p>
        <p class="copyright">© {{ currentYear }} VISoR. All rights reserved.</p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear()
</script>

<style scoped>
.app-footer {
  background: var(--app-bg);
  border-top: 1px solid var(--galavi-border);
  color: var(--galavi-text);
}

.footer-inner {
  max-width: 1220px;
  margin: 0 auto;
  padding: 44px clamp(18px, 3vw, 48px) 52px;
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(280px, 1fr);
  gap: 36px;
  align-items: end;
}

.footer-kicker {
  margin: 0 0 8px;
  color: var(--galavi-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.app-footer h2 {
  margin: 0;
  color: var(--galavi-text);
  font-size: clamp(1.4rem, 2.2vw, 2rem);
  line-height: 1.15;
  letter-spacing: 0;
}

.footer-contact p {
  margin: 0;
  color: var(--galavi-text-dim);
  font-size: 0.96rem;
  line-height: 1.7;
}

.footer-contact .copyright {
  margin-top: 12px;
  color: var(--galavi-text-dim);
  font-size: 0.84rem;
}

@media (max-width: 760px) {
  .footer-inner {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
</style>