<template>
  <footer class="app-footer">
    <div class="footer-content">
      <div class="footer-info">
        <div class="footer-section">
          <h4>VISoR Platform</h4>
          <p>Volumetric Imaging with Synchronized on-the-fly-scan and Readout</p>
          <p class="version">Version {{ version }}</p>
        </div>
        
        <div class="footer-section">
          <h4>Technology</h4>
          <ul class="tech-list">
            <li>High-resolution brain imaging</li>
            <li>Multi-channel fluorescence</li>
            <li>3D reconstruction</li>
            <li>Real-time visualization</li>
          </ul>
        </div>
        
        <div class="footer-section">
          <h4>Data</h4>
          <ul class="data-list">
            <li>{{ totalSpecimens }} specimen{{ totalSpecimens !== 1 ? 's' : '' }}</li>
            <li>{{ totalRegions }} brain regions</li>
            <li>Multi-resolution pyramids</li>
            <li>Interactive 3D models</li>
          </ul>
        </div>
      </div>
      
      <div class="footer-bottom">
        <div class="copyright">
          <p>&copy; {{ currentYear }} VISoR Platform. All rights reserved.</p>
        </div>
        
        <div class="footer-links">
          <router-link to="/about" class="footer-link">About</router-link>
          <a href="#" class="footer-link" @click.prevent="showHelp">Help</a>
          <a href="#" class="footer-link" @click.prevent="showContact">Contact</a>
        </div>
        
        <div class="footer-status">
          <div class="status-indicator" :class="{ online: isOnline, offline: !isOnline }">
            <el-icon class="status-icon">
              <CircleCheckFilled v-if="isOnline" />
              <CircleCloseFilled v-else />
            </el-icon>
            <span class="status-text">{{ isOnline ? 'Online' : 'Offline' }}</span>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useVISoRStore } from '@/stores/visor'
import VISoRAPI from '@/services/api'
import { CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const visorStore = useVISoRStore()

// Local state
const isOnline = ref(true)
const version = ref('1.0.0')
const healthCheckInterval = ref<number | null>(null)

// Computed
const currentYear = computed(() => new Date().getFullYear())

const totalSpecimens = computed(() => visorStore.specimens.length)

const totalRegions = computed(() => {
  const regions = (visorStore as { regions?: unknown[] }).regions
  return regions?.length ?? 241
})

// Methods
async function checkHealth() {
  try {
    await VISoRAPI.healthCheck()
    isOnline.value = true
  } catch (error) {
    isOnline.value = false
    console.warn('Health check failed:', error)
  }
}

function showHelp() {
  ElMessage.info('Help documentation coming soon!')
}

function showContact() {
  ElMessage.info('Contact information coming soon!')
}

function startHealthCheck() {
  // Clear any existing interval to prevent leaks on HMR re-mount
  stopHealthCheck()
  
  // Initial check
  checkHealth()
  
  // Periodic checks every 60 seconds
  healthCheckInterval.value = window.setInterval(checkHealth, 60000)
}

function stopHealthCheck() {
  if (healthCheckInterval.value) {
    clearInterval(healthCheckInterval.value)
    healthCheckInterval.value = null
  }
}

// Lifecycle
onMounted(() => {
  startHealthCheck()
})

onUnmounted(() => {
  stopHealthCheck()
})
</script>

<style scoped>
.app-footer {
  background: var(--c-bg);
  color: var(--c-text-muted);
  border-top: 1px solid var(--c-border);
  margin-top: auto;
}

.footer-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 40px 24px 20px;
}

.footer-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 32px;
  margin-bottom: 28px;
}

.footer-section h4 {
  color: var(--c-text-strong);
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.footer-section p {
  margin: 0 0 6px 0;
  line-height: 1.55;
  color: var(--c-text-muted);
  font-size: 14px;
}

.version {
  font-size: 12px;
  color: var(--c-text-faint);
}

.tech-list,
.data-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tech-list li,
.data-list li {
  margin-bottom: 6px;
  color: var(--c-text-muted);
  font-size: 14px;
}

.footer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 18px;
  border-top: 1px solid var(--c-divider);
  flex-wrap: wrap;
  gap: 12px;
}

.copyright p {
  margin: 0;
  font-size: 13px;
  color: var(--c-text-faint);
}

.footer-links {
  display: flex;
  gap: 18px;
}

.footer-link {
  color: var(--c-text-muted);
  text-decoration: none;
  font-size: 13px;
  transition: color 0.15s;
}

.footer-link:hover {
  color: var(--c-text-strong);
}

.footer-status {
  display: flex;
  align-items: center;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--c-border);
  background: var(--c-bg-elev);
}

.status-indicator.online {
  color: var(--c-success);
}

.status-indicator.offline {
  color: var(--c-danger);
}

.status-icon {
  font-size: 12px;
}

.status-text {
  font-weight: 500;
}

/* Responsive design */
@media (max-width: 768px) {
  .footer-content {
    padding: 28px 16px 16px;
  }

  .footer-info {
    grid-template-columns: 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }

  .footer-bottom {
    flex-direction: column;
    text-align: center;
    gap: 12px;
  }

  .footer-links {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .footer-section {
    text-align: center;
  }

  .footer-links {
    flex-direction: column;
    gap: 10px;
  }
}
</style>
