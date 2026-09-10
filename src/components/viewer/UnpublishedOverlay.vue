<template>
  <div class="unpublished-overlay" role="dialog" aria-modal="true" aria-label="Unpublished specimen">
    <div class="overlay-panel">
      <p class="overlay-kicker">Unpublished Data</p>
      <h2 class="overlay-title">This specimen is coming soon</h2>
      <p class="overlay-copy">
        {{ specimenName }} has not been published yet. Internal users can authorize to preview it.
      </p>

      <form v-if="prompting" class="auth-form" @submit.prevent="submitPassword">
        <input
          ref="passwordEl"
          v-model="password"
          type="password"
          class="auth-input"
          placeholder="Internal password"
          aria-label="Internal password"
          :aria-invalid="authFailed"
        />
        <div class="auth-actions">
          <button type="submit" class="auth-submit" :disabled="checking">
            {{ checking ? 'Checking…' : 'Unlock' }}
          </button>
          <button type="button" class="auth-cancel" @click="cancelPrompt">Cancel</button>
        </div>
        <p v-if="authFailed" class="auth-error">Incorrect password.</p>
      </form>
      <button v-else type="button" class="authorize-button" @click="startPrompt">Authorize</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useInternalAccess } from '@/composables/useInternalAccess'

defineProps<{ specimenName: string }>()
const emit = defineEmits<{ authorized: [] }>()

const { authorize } = useInternalAccess()

const prompting = ref(false)
const password = ref('')
const checking = ref(false)
const authFailed = ref(false)
const passwordEl = ref<HTMLInputElement | null>(null)

async function startPrompt() {
  prompting.value = true
  authFailed.value = false
  await nextTick()
  passwordEl.value?.focus()
}

function cancelPrompt() {
  prompting.value = false
  password.value = ''
  authFailed.value = false
}

async function submitPassword() {
  if (checking.value) return
  checking.value = true
  try {
    if (await authorize(password.value)) {
      emit('authorized')
    } else {
      authFailed.value = true
      password.value = ''
      passwordEl.value?.focus()
    }
  } finally {
    checking.value = false
  }
}
</script>

<style scoped>
.unpublished-overlay {
  position: absolute;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--app-bg) 72%, transparent);
  backdrop-filter: blur(26px) saturate(110%);
}

.overlay-panel {
  display: flex;
  max-width: 380px;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 30px;
  border: 1px solid var(--galavi-border);
  background:
    linear-gradient(135deg, var(--galavi-accent-soft), transparent 40%),
    var(--galavi-panel-bg);
  box-shadow: 0 0 18px var(--galavi-accent-soft), var(--shadow-lg);
  clip-path: polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px));
  text-align: center;
}

.overlay-kicker {
  margin: 0;
  color: var(--galavi-accent);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.overlay-title {
  margin: 0;
  color: var(--galavi-text);
  font-size: 18px;
  font-weight: 600;
}

.overlay-copy {
  margin: 0;
  color: var(--galavi-text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.authorize-button,
.auth-submit {
  margin-top: 6px;
  padding: 7px 18px;
  border: 1px solid var(--galavi-accent);
  border-radius: 2px;
  background: var(--galavi-accent-soft);
  color: var(--galavi-text);
  font: inherit;
  cursor: pointer;
}
.authorize-button:hover,
.auth-submit:hover:not(:disabled) {
  box-shadow: 0 0 10px var(--galavi-accent-soft);
}
.auth-submit:disabled {
  cursor: wait;
  opacity: 0.6;
}

.auth-form {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.auth-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  outline: 0;
  background: transparent;
  color: var(--galavi-text);
  font: inherit;
  text-align: center;
}
.auth-input:focus {
  border-color: var(--galavi-accent);
  box-shadow: 0 0 8px var(--galavi-accent-soft);
}
.auth-input[aria-invalid='true'] { border-color: #d0635a; }

.auth-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.auth-submit { margin-top: 0; }
.auth-cancel {
  padding: 7px 12px;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text-dim);
  font: inherit;
  cursor: pointer;
}
.auth-cancel:hover { color: var(--galavi-text); }

.auth-error {
  margin: 0;
  color: #d0635a;
  font-size: 11px;
}
</style>
