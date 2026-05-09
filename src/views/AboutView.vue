<template>
  <div class="about-page">
    <div class="about-content">
      <!-- Hero Section -->
      <section class="hero-section">
        <div class="hero-container">
          <h1 class="page-title">About VISoR Platform</h1>
          <p class="page-subtitle">
            Advancing neuroscience through high-resolution volumetric brain imaging
          </p>
        </div>
      </section>

      <!-- Technology Overview -->
      <section class="technology-section">
        <div class="section-container">
          <h2 class="section-title">What is VISoR?</h2>
          <div class="content-grid">
            <div class="text-content">
              <p>
                <strong>VISoR (Volumetric Imaging with Synchronized on-the-fly-scan and Readout)</strong> 
                is a cutting-edge imaging technology designed for high-throughput, high-quality brain mapping. 
                This innovative approach enables researchers to capture detailed three-dimensional images of 
                brain tissue at unprecedented scale and resolution.
              </p>
              
              <h3>Key Advantages</h3>
              <ul class="advantage-list">
                <li><strong>High Throughput:</strong> Rapid acquisition of large-scale datasets</li>
                <li><strong>Exceptional Quality:</strong> Micrometer-scale resolution for detailed analysis</li>
                <li><strong>Multi-Scale Mapping:</strong> From cellular to whole-brain connectivity</li>
                <li><strong>Multi-Species Support:</strong> Mouse, monkey, and human brain imaging</li>
              </ul>
            </div>
            
            <div class="stats-panel">
              <h3>Technical Specifications</h3>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-number">10μm</span>
                  <span class="stat-label">Pixel Resolution</span>
                </div>
                <div class="stat-item">
                  <span class="stat-number">275GB</span>
                  <span class="stat-label">Max Dataset Size</span>
                </div>
                <div class="stat-item">
                  <span class="stat-number">8</span>
                  <span class="stat-label">Resolution Levels</span>
                </div>
                <div class="stat-item">
                  <span class="stat-number">4</span>
                  <span class="stat-label">Fluorescence Channels</span>
                </div>
                <div class="stat-item">
                  <span class="stat-number">241</span>
                  <span class="stat-label">Brain Regions</span>
                </div>
                <div class="stat-item">
                  <span class="stat-number">3D</span>
                  <span class="stat-label">Reconstruction</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Platform Features -->
      <section class="features-section">
        <div class="section-container">
          <h2 class="section-title">Platform Features</h2>
          <div class="features-grid">
            <div class="feature-item">
              <el-icon class="feature-icon" size="40">
                <View />
              </el-icon>
              <h4>Interactive Visualization</h4>
              <p>
                Multi-view brain exploration with synchronized sagittal, coronal, and horizontal views. 
                Real-time navigation through massive datasets with smooth zooming and panning.
              </p>
            </div>
            
            <div class="feature-item">
              <el-icon class="feature-icon" size="40">
                <PictureRounded />
              </el-icon>
              <h4>Multi-Channel Imaging</h4>
              <p>
                Support for 4 fluorescence channels (405nm, 488nm, 561nm, 640nm) enabling 
                comprehensive visualization of different neural structures and markers.
              </p>
            </div>
            
            <div class="feature-item">
              <el-icon class="feature-icon" size="40">
                <DataAnalysis />
              </el-icon>
              <h4>Brain Region Analysis</h4>
              <p>
                Hierarchical brain region browser with 241 anatomical regions. Click-to-identify 
                functionality for rapid region exploration and analysis.
              </p>
            </div>
            
            <div class="feature-item">
              <el-icon class="feature-icon" size="40">
                <Connection />
              </el-icon>
              <h4>3D Reconstruction</h4>
              <p>
                Real-time 3D brain shell visualization with coordinate mapping between 
                2D views and 3D models for comprehensive spatial understanding.
              </p>
            </div>
            
            <div class="feature-item">
              <el-icon class="feature-icon" size="40">
                <ZoomIn />
              </el-icon>
              <h4>Multi-Resolution Pyramid</h4>
              <p>
                Efficient tile-based rendering with 8 resolution levels enables smooth 
                navigation from overview to detailed cellular inspection.
              </p>
            </div>
            
            <div class="feature-item">
              <el-icon class="feature-icon" size="40">
                <Monitor />
              </el-icon>
              <h4>Web-Based Access</h4>
              <p>
                No software installation required. Access powerful brain imaging tools 
                directly through your web browser with responsive design.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Technology Stack -->
      <section class="tech-stack-section">
        <div class="section-container">
          <h2 class="section-title">Technology Stack</h2>
          <div class="tech-grid">
            <div class="tech-category">
              <h3>Frontend</h3>
              <ul class="tech-list">
                <li>Vue.js 3 + TypeScript</li>
                <li>Galavi (3D Image Viewer)</li>
                <li>Element Plus (UI Components)</li>
                <li>Pinia (State Management)</li>
              </ul>
            </div>
            
            <div class="tech-category">
              <h3>Backend</h3>
              <ul class="tech-list">
                <li>Python FastAPI</li>
                <li>HDF5 (.ims) File Processing</li>
                <li>Redis Caching</li>
                <li>Tile-based Image Serving</li>
                <li>REST API Architecture</li>
              </ul>
            </div>
            
            <div class="tech-category">
              <h3>Infrastructure</h3>
              <ul class="tech-list">
                <li>Docker Containerization</li>
                <li>Nginx Reverse Proxy</li>
                <li>Multi-container Orchestration</li>
                <li>Health Monitoring</li>
                <li>Performance Optimization</li>
              </ul>
            </div>
            
            <div class="tech-category">
              <h3>Data Formats</h3>
              <ul class="tech-list">
                <li>Imaris (.ims) HDF5 Images</li>
                <li>OBJ 3D Models</li>
                <li>JSON Region Hierarchies</li>
                <li>Multi-resolution Pyramids</li>
                <li>Lossless Atlas Masks</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Research Applications -->
      <section class="applications-section">
        <div class="section-container">
          <h2 class="section-title">Research Applications</h2>
          <div class="applications-grid">
            <div class="application-card">
              <h4>Connectome Mapping</h4>
              <p>
                Trace neural connections across brain regions to understand 
                connectivity patterns and network organization.
              </p>
            </div>
            
            <div class="application-card">
              <h4>Disease Research</h4>
              <p>
                Compare healthy and diseased brain tissue to identify 
                pathological changes and potential therapeutic targets.
              </p>
            </div>
            
            <div class="application-card">
              <h4>Developmental Biology</h4>
              <p>
                Study brain development across different stages and species 
                to understand evolutionary and developmental processes.
              </p>
            </div>
            
            <div class="application-card">
              <h4>Comparative Neuroscience</h4>
              <p>
                Cross-species comparisons to understand brain evolution 
                and species-specific neural adaptations.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Contact Section -->
      <section class="contact-section">
        <div class="section-container">
          <h2 class="section-title">Get Involved</h2>
          <div class="contact-content">
            <div class="contact-info">
              <h3>Collaborate with Us</h3>
              <p>
                The VISoR Platform is an ongoing research initiative. We welcome 
                collaborations with researchers, institutions, and technology partners 
                interested in advancing brain imaging and analysis capabilities.
              </p>
              
              <div class="contact-methods">
                <div class="contact-item">
                  <el-icon><Message /></el-icon>
                  <span>Contact us for research collaborations</span>
                </div>
                <div class="contact-item">
                  <el-icon><Document /></el-icon>
                  <span>Access technical documentation</span>
                </div>
                <div class="contact-item">
                  <el-icon><Share /></el-icon>
                  <span>Share your research datasets</span>
                </div>
              </div>
            </div>
            
            <div class="version-info">
              <h3>Platform Version</h3>
              <div class="version-details">
                <div class="version-item">
                  <span class="version-label">Current Version:</span>
                  <span class="version-value">1.0.0</span>
                </div>
                <div class="version-item">
                  <span class="version-label">Last Updated:</span>
                  <span class="version-value">{{ currentDate }}</span>
                </div>
                <div class="version-item">
                  <span class="version-label">License:</span>
                  <span class="version-value">Research Use</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  View,
  PictureRounded,
  DataAnalysis,
  Connection,
  ZoomIn,
  Monitor,
  Message,
  Document,
  Share
} from '@element-plus/icons-vue'

// Computed
const currentDate = computed(() => {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})
</script>

<style scoped>
.about-page {
  min-height: 100%;
  background: var(--c-bg);
  color: var(--c-text);
  overflow-y: auto;
}

.about-content {
  width: 100%;
}

/* Hero Section */
.hero-section {
  position: relative;
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  color: var(--c-text-strong);
  padding: 80px 0 64px;
  text-align: center;
  overflow: hidden;
}

.hero-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 80% at 50% 0%, var(--c-accent-soft), transparent 70%);
  pointer-events: none;
}

.hero-container {
  position: relative;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

.page-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0 0 14px 0;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--c-text-strong);
}

.page-subtitle {
  font-size: 1.1rem;
  color: var(--c-text-muted);
  margin: 0;
  line-height: 1.45;
}

/* Common Section Styles */
.section-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

.section-title {
  font-size: 1.85rem;
  font-weight: 700;
  text-align: center;
  margin: 0 0 48px 0;
  color: var(--c-text-strong);
  letter-spacing: -0.01em;
}

/* Technology Section */
.technology-section {
  padding: 72px 0;
  background: var(--c-bg-soft);
  border-bottom: 1px solid var(--c-border);
}

.content-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 48px;
  align-items: start;
}

.text-content h3 {
  color: var(--c-text-strong);
  margin: 24px 0 10px 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.text-content p {
  color: var(--c-text-muted);
  line-height: 1.65;
  margin: 0 0 16px 0;
  font-size: 0.95rem;
}

.advantage-list {
  color: var(--c-text-muted);
  line-height: 1.7;
  padding-left: 18px;
  font-size: 0.95rem;
}

.advantage-list li {
  margin-bottom: 6px;
}

.advantage-list strong {
  color: var(--c-text-strong);
}

.stats-panel {
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border);
  padding: 24px;
  border-radius: var(--radius-lg);
}

.stats-panel h3 {
  color: var(--c-text-strong);
  margin: 0 0 14px 0;
  font-size: 1rem;
  font-weight: 600;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 14px 10px;
  background: var(--c-bg-soft);
  border: 1px solid var(--c-divider);
  border-radius: var(--radius-md);
}

.stat-number {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--c-accent);
  margin-bottom: 4px;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--c-text-muted);
}

/* Features Section */
.features-section {
  padding: 72px 0;
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.feature-item {
  text-align: left;
  padding: 24px 22px;
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  transition: border-color 0.2s;
}

.feature-item:hover {
  border-color: var(--c-border-strong);
}

.feature-icon {
  color: var(--c-accent);
  margin-bottom: 14px;
}

.feature-item h4 {
  color: var(--c-text-strong);
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
}

.feature-item p {
  color: var(--c-text-muted);
  line-height: 1.55;
  margin: 0;
  font-size: 0.92rem;
}

/* Tech Stack Section */
.tech-stack-section {
  padding: 72px 0;
  background: var(--c-bg-soft);
  border-bottom: 1px solid var(--c-border);
}

.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.tech-category {
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border);
  padding: 22px;
  border-radius: var(--radius-lg);
}

.tech-category h3 {
  color: var(--c-text-strong);
  margin: 0 0 12px 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-align: left;
  letter-spacing: 0.01em;
}

.tech-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tech-list li {
  color: var(--c-text-muted);
  padding: 7px 0;
  border-bottom: 1px solid var(--c-divider);
  font-size: 0.88rem;
}

.tech-list li:last-child {
  border-bottom: none;
}

/* Applications Section */
.applications-section {
  padding: 72px 0;
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
}

.applications-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.application-card {
  background: var(--c-bg-elev);
  padding: 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent);
}

.application-card h4 {
  color: var(--c-text-strong);
  margin: 0 0 10px 0;
  font-size: 1rem;
  font-weight: 600;
}

.application-card p {
  color: var(--c-text-muted);
  line-height: 1.55;
  margin: 0;
  font-size: 0.92rem;
}

/* Contact Section */
.contact-section {
  padding: 72px 0;
  background: var(--c-bg-soft);
}

.contact-content {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 48px;
  align-items: start;
}

.contact-info h3 {
  color: var(--c-text-strong);
  margin: 0 0 12px 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.contact-info p {
  color: var(--c-text-muted);
  line-height: 1.65;
  margin: 0 0 24px 0;
  font-size: 0.95rem;
}

.contact-methods {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--c-text-muted);
  font-size: 0.95rem;
}

.contact-item .el-icon {
  color: var(--c-accent);
}

.version-info {
  background: var(--c-bg-elev);
  padding: 24px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--c-border);
}

.version-info h3 {
  color: var(--c-text-strong);
  margin: 0 0 14px 0;
  font-size: 1rem;
  font-weight: 600;
}

.version-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--c-divider);
}

.version-item:last-child {
  border-bottom: none;
}

.version-label {
  color: var(--c-text-muted);
  font-size: 0.88rem;
}

.version-value {
  color: var(--c-text-strong);
  font-weight: 600;
  font-size: 0.88rem;
  font-family: var(--font-mono);
}

/* Responsive Design */
@media (max-width: 1024px) {
  .content-grid,
  .contact-content {
    grid-template-columns: 1fr;
    gap: 32px;
  }
}

@media (max-width: 768px) {
  .page-title { font-size: 2rem; }
  .section-title { font-size: 1.55rem; }
  .hero-section { padding: 56px 0 44px; }
  .features-section,
  .technology-section,
  .tech-stack-section,
  .applications-section,
  .contact-section { padding: 56px 0; }
  .stats-grid { grid-template-columns: 1fr; }
  .tech-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .page-title { font-size: 1.7rem; }
  .section-container { padding: 0 16px; }
  .hero-container { padding: 0 16px; }
}
</style>
