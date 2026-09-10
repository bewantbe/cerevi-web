<template>
  <div class="home-page">
    <section class="hero-section" aria-label="Cerevi overview">
      <div
        ref="heroScroller"
        class="hero-scroller"
        @wheel="onHeroWheel"
        @scroll.passive="updateHeroPage"
      >
        <article class="hero-panel hero-panel-intro">
          <div class="hero-panel-inner hero-intro">
            <h1 class="hero-title">{{ heroTitleText }}<span v-if="heroTitleTyping" class="type-caret" aria-hidden="true"></span></h1>
            <p class="hero-subtitle">
              <span class="subtitle-line color-letters">{{ heroPronunciationText }}<span v-if="heroPronunciationTyping" class="type-caret" aria-hidden="true"></span></span>
              <span class="subtitle-line"><span class="color-letters">{{ heroSubtitleText.slice(0, 4) }}</span>{{ heroSubtitleText.slice(4, 9) }}<span class="color-letters">{{ heroSubtitleText.slice(9, 11) }}</span>{{ heroSubtitleText.slice(11) }}<span v-if="heroSubtitleTyping" class="type-caret" aria-hidden="true"></span></span>
            </p>
            <button type="button" class="jump-link" @click="scrollToSpecimens">
              Explore specimens
              <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6l5 5 5-5" /></svg>
            </button>
          </div>
        </article>

        <article class="hero-panel hero-panel-study">
          <div class="hero-panel-inner research-copy">
            <p class="hero-kicker">For domain experts and atlas teams</p>
            <h2>Large-volume fluorescence data, kept navigable.</h2>
            <div class="research-grid">
              <section>
                <h3>Whole-brain scale</h3>
                <p>CereVi supports volumetric acquisition and exploration across intact brain samples, preserving spatial context from overview down to local anatomical detail.</p>
              </section>
              <section>
                <h3>Multi-channel context</h3>
                <p>Co-registered fluorescence channels can be compared directly against region annotations, meshes, and slice planes without switching tools.</p>
              </section>
              <section>
                <h3>Atlas-aware review</h3>
                <p>The viewer is organized for anatomical inspection: synchronized orthogonal slices, volume view, target markers, and atlas overlays share the same specimen state.</p>
              </section>
            </div>
          </div>
        </article>

        <article class="hero-panel hero-panel-method">
          <div class="hero-panel-inner method-copy">
            <p class="hero-kicker">From specimen to interactive atlas</p>
            <h2>Designed around research iteration, not presentation overhead.</h2>
            <div class="method-list">
              <div>
                <span class="method-index">01</span>
                <p>Massive OME-Zarr pyramids load progressively, making high-resolution samples practical to inspect in the browser.</p>
              </div>
              <div>
                <span class="method-index">02</span>
                <p>Specimen, atlas, and region data stay linked, so researchers can move between imaging signal and anatomical reference quickly.</p>
              </div>
              <div>
                <span class="method-index">03</span>
                <p>The interface keeps controls close to the image: channel, contrast, target, and atlas visibility remain visible while the dataset stays central.</p>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div class="hero-progress" aria-label="Hero pages">
        <button
          v-for="idx in heroPanelCount"
          :key="idx"
          type="button"
          :class="{ active: activeHeroPage === idx - 1 }"
          :aria-label="`Go to hero page ${idx}`"
          @click="goToHeroPage(idx - 1)"
        ></button>
      </div>
    </section>

    <section ref="specimensSection" class="specimens-section">
      <div class="specimens-intro">
        <div>
          <h2>Specimens</h2>
        </div>
        <div class="specimen-search">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5" /></svg>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search specimens"
            aria-label="Search specimens"
          />
        </div>
      </div>

      <div class="specimen-gallery-frame">
        <div class="specimen-gallery" aria-label="Specimen gallery">
          <article
            v-for="specimen in filteredSpecimens"
            :key="specimen.id"
            class="specimen-tile"
            :class="{ unpublished: isGated(specimen) }"
            tabindex="0"
            @click="openSpecimen(specimen.id)"
            @keydown.enter="openSpecimen(specimen.id)"
            @keydown.space.prevent="openSpecimen(specimen.id)"
          >
            <div class="specimen-visual">
              <div class="specimen-mark">{{ specimenInitials(specimen.name) }}</div>
              <div class="specimen-hover">
                <p v-if="specimen.species" class="species">{{ specimen.species }}</p>
                <p>{{ specimen.description || 'Open this specimen for synchronized volume, slice, and atlas review.' }}</p>
                <span>Open viewer</span>
              </div>
              <div v-if="isGated(specimen)" class="specimen-cover">
                <span>Unpublished Data</span>
                <small>Coming soon</small>
              </div>
            </div>
            <div class="specimen-summary">
              <h3>{{ specimen.name }}</h3>
            </div>
          </article>

          <div v-if="filteredSpecimens.length === 0 && searchQuery.trim()" class="gallery-empty">
            No specimens match "{{ searchQuery }}".
          </div>
          <div v-else-if="filteredSpecimens.length === 0" class="gallery-empty">
            Specimens are unavailable from the registry.
          </div>
        </div>
      </div>
    </section>

    <Footer />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Footer from '@/components/layout/Footer.vue'
import { useTypewriter } from '@/composables/useTypewriter'
import { useInternalAccess } from '@/composables/useInternalAccess'
import { useCereviStore } from '@/stores/visor'

const router = useRouter()
const visorStore = useCereviStore()
const { isGated } = useInternalAccess()

const heroScroller = ref<HTMLDivElement | null>(null)
const specimensSection = ref<HTMLElement | null>(null)
const activeHeroPage = ref(0)
const searchQuery = ref('')
const heroPanelCount = 3
const { display: heroTitleText, typing: heroTitleTyping } = useTypewriter('CereVi', { interval: 88, delay: 160 })
const { display: heroPronunciationText, typing: heroPronunciationTyping } = useTypewriter("/se.rə.'vi:/", { interval: 48, delay: 760 })
const { display: heroSubtitleText, typing: heroSubtitleTyping } = useTypewriter('Cerebral Visualization Platform', { interval: 32, delay: 1380 })
let heroWheelLocked = false

const filteredSpecimens = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return visorStore.specimens
  return visorStore.specimens.filter((specimen) => {
    return [specimen.name, specimen.species, specimen.description, specimen.id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
})

function onHeroWheel(event: WheelEvent) {
  const scroller = heroScroller.value
  if (!scroller) return
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  const currentPage = activeHeroPage.value
  const nextPage = delta > 0 ? currentPage + 1 : currentPage - 1
  const canPage = nextPage >= 0 && nextPage < heroPanelCount

  if (!canPage) return
  event.preventDefault()
  if (heroWheelLocked) return

  heroWheelLocked = true
  goToHeroPage(nextPage)
  window.setTimeout(() => {
    heroWheelLocked = false
  }, 520)
}

function updateHeroPage() {
  const scroller = heroScroller.value
  if (!scroller) return
  activeHeroPage.value = Math.round(scroller.scrollLeft / Math.max(scroller.clientWidth, 1))
}

function goToHeroPage(page: number) {
  const scroller = heroScroller.value
  if (!scroller) return
  scroller.scrollTo({ left: page * scroller.clientWidth, behavior: 'smooth' })
}

function scrollToSpecimens() {
  specimensSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function openSpecimen(specimenId: string) {
  router.push(`/specimen/${specimenId}`)
}

function specimenInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

onMounted(async () => {
  document.documentElement.classList.add('home-page-active')
  if (visorStore.specimens.length === 0) {
    await visorStore.loadSpecimens()
  }
  await nextTick()
  updateHeroPage()
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('home-page-active')
})
</script>

<style scoped>
.home-page {
  min-height: 100%;
  background: var(--app-bg);
  color: var(--galavi-text);
}

:global(html.home-page-active .main-content) {
  scroll-behavior: smooth;
  scroll-snap-type: y mandatory;
}

.hero-section,
.specimens-section,
:global(html.home-page-active .app-footer) {
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

:global(html.home-page-active .app-footer) {
  min-height: 100vh;
  display: flex;
  align-items: center;
}

.hero-section {
  position: relative;
  z-index: 1001;
  height: 100vh;
  min-height: 620px;
  overflow: hidden;
  background: var(--app-bg);
}

.hero-scroller {
  height: 100%;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
}

.hero-scroller::-webkit-scrollbar {
  display: none;
}

.hero-panel {
  position: relative;
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  scroll-snap-align: start;
  overflow: hidden;
}

.hero-panel-intro::after,
.hero-panel-study::after,
.hero-panel-method::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 46%;
  background: linear-gradient(transparent, var(--app-bg) 86%);
  pointer-events: none;
}

.hero-panel-intro {
  background:
    radial-gradient(55% 70% at 78% 24%, var(--galavi-accent-soft), transparent 68%),
    linear-gradient(135deg, var(--app-bg) 0%, var(--app-bg-soft) 58%, var(--app-bg) 100%);
}

.hero-panel-study {
  background:
    radial-gradient(60% 80% at 82% 18%, rgba(110, 168, 255, 0.16), transparent 68%),
    linear-gradient(135deg, var(--app-bg) 0%, var(--app-bg-soft) 52%, var(--app-bg) 100%);
}

.hero-panel-method {
  background:
    radial-gradient(56% 70% at 20% 25%, rgba(74, 222, 128, 0.11), transparent 70%),
    linear-gradient(135deg, var(--app-bg) 0%, var(--app-bg-soft) 56%, var(--app-bg) 100%);
}

.hero-panel-inner {
  position: relative;
  z-index: 1;
  height: 100%;
  max-width: 1220px;
  margin: 0 auto;
  padding: clamp(52px, 8vw, 96px) clamp(18px, 3vw, 48px);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hero-intro {
  max-width: 780px;
  margin: 0;
  padding-left: clamp(24px, 10vw, 186px);
}

.hero-kicker {
  margin: 0 0 14px;
  color: var(--galavi-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hero-title {
  margin: 0;
  color: var(--galavi-accent);
  font-size: clamp(3rem, 7vw, 5.5rem);
  line-height: 1.05;
  letter-spacing: 0;
  font-weight: 700;
}

.color-letters { color: var(--galavi-accent); }

.type-caret {
  display: inline-block;
  width: 0.52em;
  height: 0.92em;
  margin-left: 0.08em;
  vertical-align: -0.08em;
  background: currentColor;
}

.hero-subtitle {
  max-width: max-content;
  margin: 28px 0 34px;
  color: var(--galavi-text);
  font-size: clamp(1.3rem, 2.2vw, 2.15rem);
  line-height: 1.28;
  font-weight: 500;
}

.subtitle-line {
  display: block;
  white-space: nowrap;
}

.jump-link {
  width: fit-content;
  appearance: none;
  border: 1px solid var(--galavi-border);
  border-radius: 999px;
  padding: 12px 18px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: rgba(7, 10, 15, 0.62);
  color: var(--galavi-text);
  font: inherit;
  font-size: 0.96rem;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(12px);
  transition: transform 0.15s, border-color 0.15s, background 0.15s;
}

.jump-link:hover {
  transform: translateY(-1px);
  border-color: var(--galavi-accent);
  background: rgba(110, 168, 255, 0.14);
}

.research-copy,
.method-copy {
  justify-content: center;
}

.research-copy h2,
.method-copy h2 {
  max-width: 820px;
  margin: 0 0 34px;
  color: var(--galavi-text);
  font-size: clamp(2.1rem, 4vw, 3.8rem);
  line-height: 1.04;
  letter-spacing: 0;
}

.research-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.research-grid section,
.method-list div {
  border-top: 1px solid var(--galavi-border);
  padding-top: 18px;
}

.research-grid h3 {
  margin: 0 0 10px;
  color: var(--galavi-text);
  font-size: 1rem;
}

.research-grid p,
.method-list p {
  margin: 0;
  color: var(--galavi-text-dim);
  font-size: 0.98rem;
  line-height: 1.7;
}

.method-list {
  max-width: 900px;
  display: grid;
  gap: 22px;
}

.method-list div {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.method-index {
  color: var(--galavi-accent);
  font-family: var(--galavi-font-mono);
  font-size: 0.9rem;
}

.hero-progress {
  position: absolute;
  left: 50%;
  bottom: 24px;
  z-index: 3;
  display: flex;
  gap: 10px;
  transform: translateX(-50%);
}

.hero-progress button {
  width: 28px;
  height: 3px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  cursor: pointer;
}

.hero-progress button.active {
  background: var(--galavi-accent);
}

.specimens-section {
  height: 100vh;
  min-height: 720px;
  padding: 70px 0 84px;
  background: var(--app-bg);
  border-top: 1px solid var(--galavi-border);
}

.specimens-intro {
  max-width: 1220px;
  margin: 0 auto 34px;
  padding: 0 clamp(18px, 3vw, 48px);
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(260px, 360px);
  gap: 24px;
  align-items: end;
}

.specimens-intro h2 {
  margin: 0;
  color: var(--galavi-text);
  font-size: clamp(2rem, 3.6vw, 3.6rem);
  line-height: 1;
  letter-spacing: 0;
}

.specimen-search {
  height: 42px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--galavi-border);
  border-radius: 999px;
  background: var(--app-bg-elev);
  color: var(--galavi-text-dim);
}

.specimen-search:focus-within {
  border-color: var(--galavi-accent);
  box-shadow: 0 0 0 3px var(--galavi-accent-soft);
}

.specimen-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--galavi-text);
  font: inherit;
  font-size: 0.92rem;
}

.specimen-search input::placeholder {
  color: var(--galavi-text-dim);
}

.specimen-gallery-frame {
  max-width: 1220px;
  margin: 0 auto;
  padding: 0 clamp(18px, 3vw, 48px);
}

.specimen-gallery {
  --gallery-gap: clamp(18px, 2.2vw, 26px);
  display: flex;
  gap: var(--gallery-gap);
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  padding: 0 0 22px;
  scrollbar-width: thin;
}

.specimen-tile {
  flex: 0 0 calc((100% - (var(--gallery-gap) * 2)) / 3);
  min-width: 0;
  scroll-snap-align: start;
  cursor: pointer;
  outline: none;
}

.specimen-tile:focus-visible .specimen-visual {
  border-color: var(--galavi-accent);
  box-shadow: 0 0 0 3px var(--galavi-accent-soft);
}

.specimen-tile.unpublished .specimen-visual {
  filter: grayscale(0.9) brightness(0.75);
}

.specimen-cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: color-mix(in srgb, var(--app-bg) 62%, transparent);
  backdrop-filter: blur(6px) grayscale(1);
  color: var(--galavi-text-dim);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 11px;
}
.specimen-cover small {
  color: var(--galavi-text-dim);
  letter-spacing: 0.08em;
  font-size: 10px;
}

.specimen-visual {
  position: relative;
  height: 430px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--galavi-border);
  border-radius: var(--radius-md);
  background:
    radial-gradient(60% 70% at 50% 35%, var(--galavi-accent-soft), transparent 72%),
    linear-gradient(145deg, var(--app-bg-soft), var(--app-bg-elev));
}

.specimen-visual::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, transparent 0 44%, var(--galavi-border) 44% 45%, transparent 45% 100%),
    linear-gradient(transparent, rgba(7, 10, 15, 0.34));
  opacity: 0.75;
}

.specimen-mark {
  position: relative;
  z-index: 1;
  width: 92px;
  height: 92px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 10, 15, 0.72);
  border: 1px solid var(--galavi-border);
  color: var(--galavi-text);
  font-size: 1.9rem;
  font-weight: 800;
  backdrop-filter: blur(10px);
}

.specimen-hover {
  position: absolute;
  inset: auto 0 0;
  z-index: 3;
  padding: 24px;
  background: linear-gradient(transparent, rgba(7, 10, 15, 0.94) 22%, rgba(7, 10, 15, 0.98));
  color: var(--galavi-text);
  transform: translateY(calc(100% - 28px));
  transition: transform 0.22s ease;
}

.specimen-tile:hover .specimen-hover,
.specimen-tile:focus-within .specimen-hover,
.specimen-tile:focus .specimen-hover {
  transform: translateY(0);
}

.specimen-hover p {
  margin: 0 0 12px;
  color: var(--galavi-text-dim);
  line-height: 1.55;
}

.specimen-hover .species {
  color: var(--galavi-accent);
  font-style: italic;
  font-weight: 600;
}

.specimen-hover span {
  color: var(--galavi-text);
  font-weight: 700;
  font-size: 0.92rem;
}

.specimen-summary {
  margin: 18px 0 0;
}

.specimen-summary h3 {
  margin: 0;
  color: var(--galavi-text);
  font-size: clamp(0.96rem, 1.1vw, 1.12rem);
  line-height: 1.25;
  letter-spacing: 0;
}

.gallery-empty {
  min-height: 280px;
  flex: 1 0 min(520px, 82vw);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--galavi-border);
  border-radius: var(--radius-md);
  color: var(--galavi-text-dim);
}

@media (max-width: 900px) {
  .hero-section {
    min-height: 580px;
  }

  .hero-intro {
    padding-left: clamp(18px, 3vw, 48px);
  }

  .research-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .specimens-intro {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .specimens-section {
    height: auto;
    min-height: 100vh;
  }

  .specimen-tile {
    flex-basis: calc((100% - var(--gallery-gap)) / 2);
  }
}

@media (max-width: 620px) {
  .hero-section {
    height: auto;
    min-height: 0;
  }

  .hero-scroller {
    min-height: 620px;
  }

  .method-list div {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .specimen-visual {
    height: 340px;
  }

  .specimen-tile {
    flex-basis: min(360px, 82vw);
  }
}
</style>