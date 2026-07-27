import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import vitest from '@vitest/eslint-plugin'

export default defineConfigWithVueTs(
  {
    ignores: ['dist/', 'node_modules/', 'public/'],
  },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    rules: {
      // 'Footer' is a single-word layout component name kept deliberately.
      'vue/multi-word-component-names': ['error', { ignores: ['Footer'] }],
    },
  },
  {
    files: ['src/**/*.test.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
    },
    languageOptions: {
      globals: vitest.environments.env.globals,
    },
  },
)
