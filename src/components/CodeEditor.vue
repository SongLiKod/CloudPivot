<template>
  <div ref="host" class="cp-code-editor"></div>
</template>

<script setup lang="ts">
/**
 * 代码编辑器（CodeMirror 6）
 * - 语法高亮（JavaScript / JSON）
 * - 自动缩进、括号匹配
 * - 基础语法错误提示（lint）
 * - 深浅主题自动切换
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { useThemeStore } from '@/store/useThemeStore'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** js | json | auto */
    mode?: 'js' | 'json' | 'auto'
    readonly?: boolean
    height?: string
    placeholder?: string
    /** lint 探测函数：返回错误列表 */
    lint?: (doc: string) => Array<{
      from: number
      to: number
      message: string
      severity?: 'error' | 'warning' | 'info'
    }>
  }>(),
  {
    mode: 'js',
    readonly: false,
    height: '320px',
    placeholder: '// 在此编写代码…',
    lint: undefined
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const host = ref<HTMLDivElement | null>(null)
const themeStore = useThemeStore()

let view: EditorView | null = null

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#e5e7eb' },
    '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid var(--cp-border)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.06)' },
    '.cm-line': { color: '#e5e7eb' }
  },
  { dark: true }
)

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: '#1f2937' },
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid var(--cp-border)' },
  '.cm-activeLine': { backgroundColor: 'rgba(17,24,39,0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(17,24,39,0.06)' },
  '.cm-line': { color: '#1f2937' }
})

function editorTheme() {
  return themeStore.isDark ? [oneDark, darkTheme] : [lightTheme]
}

/** JS 基础语法检查：括号配对 / 引号配对 / 明显语法问题（返回 LintSource 所需 Diagnostic） */
function jsLintToDiagnostics(doc: string): Array<{ from: number; to: number; message: string; severity: 'error' }> {
  const issues: Array<{ from: number; to: number; message: string; severity: 'error' }> = []
  try {
    // 用 Function 构造器做浅语法检查（不执行）
    new Function(doc) // eslint-disable-line no-new-func
  } catch (error) {
    const message = (error as Error).message
    const match = message.match(/position (\d+)/)
    if (match) {
      const pos = Math.min(Number(match[1]), doc.length)
      issues.push({
        from: Math.max(0, pos - 1),
        to: pos,
        message: message.split('\n')[0],
        severity: 'error'
      })
    } else {
      issues.push({ from: 0, to: doc.length, message, severity: 'error' })
    }
  }
  return issues
}

/** JSON 语法检查（返回 LintSource 所需 Diagnostic） */
function jsonLintToDiagnostics(doc: string): Array<{ from: number; to: number; message: string; severity: 'error' }> {
  const issues: Array<{ from: number; to: number; message: string; severity: 'error' }> = []
  try {
    JSON.parse(doc)
  } catch (error) {
    const message = (error as Error).message
    const match = message.match(/position (\d+)/)
    if (match) {
      const pos = Math.min(Number(match[1]), doc.length)
      issues.push({ from: Math.max(0, pos - 1), to: pos, message, severity: 'error' })
    } else {
      issues.push({ from: 0, to: doc.length, message, severity: 'error' })
    }
  }
  return issues
}

function buildExtensions() {
  const lang =
    props.mode === 'json' ? json() : props.mode === 'auto' ? [javascript(), json()] : javascript()

  const lintSource =
    props.lint
      ? linter(
          (view: EditorView) =>
            props
              .lint!(view.state.doc.toString())
              .map((d) => ({ ...d, severity: d.severity ?? 'info' })),
          { delay: 500 }
        )
      : props.mode === 'json'
        ? undefined
        : linter((view: EditorView) => {
            const doc = view.state.doc.toString()
            return props.mode !== 'json' ? jsLintToDiagnostics(doc) : []
          }, { delay: 500 })

  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    indentOnInput(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    ...editorTheme(),
    lang,
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const value = update.state.doc.toString()
        emit('update:modelValue', value)
        emit('change', value)
      }
    })
  ]

  if (lintSource) extensions.push(lintSource)
  if (props.mode === 'json')
    extensions.push(
      linter((view: EditorView) => jsonLintToDiagnostics(view.state.doc.toString()), {
        delay: 400
      }),
      lintGutter()
    )

  return extensions
}

function createEditor() {
  if (!host.value) return
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [...buildExtensions(), EditorState.readOnly.of(props.readonly)]
  })
  view = new EditorView({ state, parent: host.value })
}

function updateDoc(value: string) {
  if (!view) return
  const current = view.state.doc.toString()
  if (current === value) return
  view.dispatch({
    changes: { from: 0, to: current.length, insert: value }
  })
}

watch(
  () => props.modelValue,
  (value) => updateDoc(value)
)

watch(
  () => themeStore.isDark,
  () => {
    if (!view) return
    const doc = view.state.doc.toString()
    view.destroy()
    host.value!.innerHTML = ''
    createEditor()
    // 重建后同步外部内容
    requestAnimationFrame(() => {
      const state = view!.state
      if (doc !== state.doc.toString()) {
        view!.dispatch({ changes: { from: 0, to: state.doc.length, insert: doc } })
      }
    })
  }
)

onMounted(() => {
  createEditor()
  const el = host.value as HTMLDivElement
  el.style.height = props.height
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

defineExpose({
  /** 聚焦编辑器 */
  focus: () => {
    view?.focus()
  },
  /** 清空 */
  clear: () => updateDoc('')
})
</script>

<style scoped lang="scss">
.cp-code-editor {
  width: 100%;
  min-height: 120px;
  overflow: hidden;

  :deep(.cm-editor) {
    height: 100%;
  }

  :deep(.cm-scroller) {
    height: 100%;
    overflow: auto;
  }

  :deep(.cm-gutters) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
}
</style>