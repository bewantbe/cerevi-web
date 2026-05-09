<template>
  <div class="home-page">
    <!-- Hero Section -->
    <section class="hero-section">
      <div class="hero-content">
        <div class="hero-text">
          <h1 class="hero-title">
            <span class="highlight">VISoR</span> Platform
          </h1>
          <h2 class="hero-subtitle">
            Volumetric Imaging with Synchronized on-the-fly-scan and Readout
          </h2>
          <p class="hero-description">
            Explore high-throughput, high-quality brain mapping from mouse brain to monkey brain 
            and human brain at micro-meter resolution. Interactive visualization of multi-channel 
            fluorescence imaging with precise brain region analysis.
          </p>
          <div class="hero-actions">
            <el-button type="primary" size="large" @click="scrollToSpecimens">
              <el-icon><View /></el-icon>
              Explore Specimens
            </el-button>
            <el-button size="large" @click="learnMore">
              <el-icon><InfoFilled /></el-icon>
              Learn More
            </el-button>
          </div>
        </div>
        <div class="hero-visual">
          <div class="brain-visualization">
            <el-icon class="brain-icon" size="200">
              <View />
            </el-icon>
            <div class="visual-stats">
              <div class="stat-item">
                <span class="stat-number">{{ totalSpecimens }}</span>
                <span class="stat-label">Specimens</span>
              </div>
              <div class="stat-item">
                <span class="stat-number">241</span>
                <span class="stat-label">Brain Regions</span>
              </div>
              <div class="stat-item">
                <span class="stat-number">8</span>
                <span class="stat-label">Resolution Levels</span>
              </div>
              <div class="stat-item">
                <span class="stat-number">4</span>
                <span class="stat-label">Channels</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features-section">
      <div class="section-content">
        <h2 class="section-title">Advanced Imaging Technology</h2>
        <div class="features-grid">
          <div class="feature-card">
            <el-icon class="feature-icon" size="48">
              <Camera />
            </el-icon>
            <h3>High-Resolution Imaging</h3>
            <p>Micrometer-scale resolution with volumetric scanning capabilities for detailed brain structure analysis.</p>
          </div>
          <div class="feature-card">
            <el-icon class="feature-icon" size="48">
              <PictureRounded />
            </el-icon>
            <h3>Multi-Channel Fluorescence</h3>
            <p>4-channel imaging (405nm, 488nm, 561nm, 640nm) for comprehensive visualization of neural structures.</p>
          </div>
          <div class="feature-card">
            <el-icon class="feature-icon" size="48">
              <DataAnalysis />
            </el-icon>
            <h3>3D Reconstruction</h3>
            <p>Real-time 3D visualization and navigation through complex brain structures and regions.</p>
          </div>
          <div class="feature-card">
            <el-icon class="feature-icon" size="48">
              <Connection />
            </el-icon>
            <h3>Interactive Analysis</h3>
            <p>Click-to-explore region identification with synchronized multi-view navigation.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Specimens Section -->
    <section class="specimens-section" ref="specimensSection">
      <div class="section-content">
        <h2 class="section-title">Available Specimens</h2>
        <p class="section-description">
          Explore our collection of high-resolution brain imaging datasets from different species
        </p>
        
        <div class="specimens-grid">
          <SpecimenCard
            v-for="specimen in visorStore.specimens"
            :key="specimen.id"
            :specimen="specimen"
            @click="openSpecimen(specimen.id)"
          />
          
          <!-- Placeholder cards for future specimens -->
          <div class="specimen-placeholder">
            <el-icon class="placeholder-icon" size="48">
              <Plus />
            </el-icon>
            <h3>Mouse Brain</h3>
            <p>Coming soon</p>
          </div>
          
          <div class="specimen-placeholder">
            <el-icon class="placeholder-icon" size="48">
              <Plus />
            </el-icon>
            <h3>Human Brain</h3>
            <p>Coming soon</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Technology Section -->
    <section class="technology-section">
      <div class="section-content">
        <h2 class="section-title">VISoR Technology Overview</h2>
        <div class="technology-content">
          <div class="tech-description">
            <h3>Synchronized Scanning & Readout</h3>
            <p>
              VISoR employs synchronized on-the-fly scanning and readout technology to achieve 
              high-throughput volumetric imaging. This approach enables rapid acquisition of 
              large-scale datasets while maintaining exceptional spatial resolution.
            </p>
            
            <h3>Multi-Scale Analysis</h3>
            <p>
              From cellular structures to whole-brain connectivity, VISoR supports multi-scale 
              analysis through its hierarchical resolution pyramid system. Navigate seamlessly 
              from overview to detailed inspection.
            </p>
            
            <h3>Real-Time Visualization</h3>
            <p>
              Interactive exploration of massive datasets through optimized tile-based rendering 
              and progressive loading. Experience smooth navigation through gigabyte-scale brain images.
            </p>
          </div>
          
          <div class="tech-specs">
            <h3>Technical Specifications</h3>
            <ul class="specs-list">
              <li><strong>Resolution:</strong> 10μm pixel size</li>
              <li><strong>Channels:</strong> 4 fluorescence channels</li>
              <li><strong>Data Size:</strong> Up to 275GB per specimen</li>
              <li><strong>Pyramid Levels:</strong> 8 resolution levels</li>
              <li><strong>3D Reconstruction:</strong> Real-time rendering</li>
              <li><strong>Region Analysis:</strong> 241 anatomical regions</li>
              <li><strong>Coordinate System:</strong> Right-handed 3D</li>
              <li><strong>File Format:</strong> HDF5 (.ims)</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
  <Footer />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVISoRStore } from '@/stores/visor'
import SpecimenCard from '@/components/home/SpecimenCard.vue'
import Footer from '@/components/layout/Footer.vue'
import {
  View,
  InfoFilled,
  Camera,
  PictureRounded,
  DataAnalysis,
  Connection,
  Plus
} from '@element-plus/icons-vue'

const router = useRouter()
const visorStore = useVISoRStore()

// Refs
const specimensSection = ref<HTMLElement>()

// Computed
const totalSpecimens = computed(() => visorStore.specimens.length)

// Methods
function scrollToSpecimens() {
  if (specimensSection.value) {
    specimensSection.value.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    })
  }
}

function learnMore() {
  router.push('/about')
}

function openSpecimen(specimenId: string) {
  router.push(`/viewer/${specimenId}`)
}

// Lifecycle
onMounted(() => {
  // Ensure specimens are loaded
  if (visorStore.specimens.length === 0) {
    visorStore.loadSpecimens()
  }
})
</script>

<style scoped>
.home-page {
  min-height: 100%;
  background: var(--c-bg);
  color: var(--c-text);
  overflow-y: auto;
}

/* Hero Section */
.hero-section {
  position: relative;
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  color: var(--c-text);
  padding: 96px 0 80px;
  min-height: 60vh;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.hero-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 80% at 80% 20%, var(--c-accent-soft), transparent 70%),
    radial-gradient(50% 60% at 10% 90%, var(--c-accent-soft), transparent 70%);
  pointer-events: none;
}

.hero-content {
  position: relative;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 64px;
  align-items: center;
}

.hero-title {
  font-size: 3rem;
  font-weight: 700;
  margin: 0 0 18px 0;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--c-text-strong);
}

.highlight {
  color: var(--c-accent);
}

.hero-subtitle {
  font-size: 1.25rem;
  font-weight: 400;
  margin: 0 0 20px 0;
  color: var(--c-text);
  line-height: 1.35;
}

.hero-description {
  font-size: 1rem;
  line-height: 1.65;
  margin: 0 0 32px 0;
  color: var(--c-text-muted);
  max-width: 56ch;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-visual {
  display: flex;
  justify-content: center;
}

.brain-visualization {
  text-align: center;
  width: 100%;
  max-width: 360px;
  padding: 32px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-xl);
  background: var(--c-bg-elev);
}

.brain-icon {
  color: var(--c-accent);
  opacity: 0.85;
  margin-bottom: 24px;
}

.visual-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px 8px;
  border: 1px solid var(--c-divider);
  border-radius: var(--radius-md);
  background: var(--c-bg-soft);
}

.stat-number {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--c-accent);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--c-text-muted);
  letter-spacing: 0.02em;
}

/* Sections */
.features-section,
.specimens-section,
.technology-section {
  padding: 80px 0;
}

.features-section,
.technology-section {
  background: var(--c-bg-soft);
  border-bottom: 1px solid var(--c-border);
}

.specimens-section {
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
}

.section-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.section-title {
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  margin: 0 0 16px 0;
  color: var(--c-text-strong);
  letter-spacing: -0.01em;
}

.section-description {
  text-align: center;
  font-size: 1rem;
  color: var(--c-text-muted);
  margin: 0 auto 48px;
  max-width: 600px;
}

/* Features Grid */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.feature-card {
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border);
  padding: 28px 24px;
  border-radius: var(--radius-lg);
  text-align: left;
  transition: border-color 0.2s, transform 0.2s;
}

.feature-card:hover {
  border-color: var(--c-border-strong);
  transform: translateY(-2px);
}

.feature-icon {
  color: var(--c-accent);
  margin-bottom: 16px;
}

.feature-card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--c-text-strong);
}

.feature-card p {
  color: var(--c-text-muted);
  line-height: 1.55;
  font-size: 0.92rem;
  margin: 0;
}

/* Specimens Grid */
.specimens-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
}

.specimen-placeholder {
  background: transparent;
  border: 1px dashed var(--c-border-strong);
  border-radius: var(--radius-lg);
  padding: 40px 20px;
  text-align: center;
  transition: border-color 0.2s, background 0.2s;
}

.specimen-placeholder:hover {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
}

.placeholder-icon {
  color: var(--c-text-faint);
  margin-bottom: 12px;
}

.specimen-placeholder h3 {
  color: var(--c-text-muted);
  margin: 0 0 6px 0;
  font-size: 1rem;
  font-weight: 600;
}

.specimen-placeholder p {
  color: var(--c-text-faint);
  margin: 0;
  font-size: 0.85rem;
}

/* Technology Section */
.technology-content {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 48px;
  align-items: start;
}

.tech-description h3 {
  color: var(--c-text-strong);
  margin: 24px 0 10px 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.tech-description h3:first-child {
  margin-top: 0;
}

.tech-description p {
  color: var(--c-text-muted);
  line-height: 1.65;
  margin: 0 0 16px 0;
  font-size: 0.95rem;
}

.tech-specs {
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border);
  padding: 24px;
  border-radius: var(--radius-lg);
}

.tech-specs h3 {
  color: var(--c-text-strong);
  margin: 0 0 14px 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.specs-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.specs-list li {
  padding: 8px 0;
  border-bottom: 1px solid var(--c-divider);
  color: var(--c-text-muted);
  font-size: 0.9rem;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.specs-list li:last-child {
  border-bottom: none;
}

.specs-list strong {
  color: var(--c-text-strong);
  font-weight: 600;
}

/* Loading and Error States */
.loading-container,
.error-container {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .hero-content {
    grid-template-columns: 1fr;
    gap: 40px;
    text-align: center;
  }
  .hero-description { margin-left: auto; margin-right: auto; }
  .hero-actions { justify-content: center; }
  .technology-content {
    grid-template-columns: 1fr;
    gap: 32px;
  }
}

@media (max-width: 768px) {
  .hero-section { padding: 64px 0 56px; }
  .hero-title { font-size: 2.25rem; }
  .hero-subtitle { font-size: 1.1rem; }
  .section-title { font-size: 1.65rem; }
  .features-grid,
  .specimens-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .hero-title { font-size: 1.8rem; }
  .section-content { padding: 0 16px; }
  .features-section,
  .specimens-section,
  .technology-section { padding: 56px 0; }
}
</style>
