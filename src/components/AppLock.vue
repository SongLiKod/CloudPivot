<template>
  <div class="app-lock">
    <!-- 解锁 -->
    <div v-if="mode === 'unlock'" class="app-lock__box">
      <div class="app-lock__logo">云枢</div>
      <h2 class="app-lock__title">应用已锁定</h2>
      <p class="app-lock__hint">请输入口令以解锁</p>

      <el-input
        ref="pinInputRef"
        v-model="pin"
        type="password"
        :show-password="true"
        inputmode="numeric"
        placeholder="输入口令"
        class="app-lock__input"
        :disabled="cooldownLeft > 0"
        @keyup.enter="submit"
      />

      <div class="app-lock__error" v-if="errorText">{{ errorText }}</div>
      <div class="app-lock__cooldown" v-if="cooldownLeft > 0">
        尝试次数过多，请 {{ cooldownLeft }} 秒后重试
      </div>

      <el-button
        type="primary"
        class="app-lock__btn"
        :loading="submitting"
        :disabled="cooldownLeft > 0 || !pin"
        @click="submit"
      >
        解锁
      </el-button>

      <a class="app-lock__link" @click="startReset">忘记口令？通过邮箱重置</a>
    </div>

    <!-- 忘记口令：邮箱验证码重置 -->
    <div v-else class="app-lock__box">
      <div class="app-lock__logo">云枢</div>
      <h2 class="app-lock__title">重置口令</h2>
      <p class="app-lock__hint">
        验证码已发送至 <b class="cp-mono">{{ resetTo }}</b>（10 分钟内有效）
      </p>

      <el-input
        v-model="otp"
        placeholder="邮箱验证码"
        inputmode="numeric"
        class="app-lock__input"
        @keyup.enter="submitReset"
      />
      <el-input
        v-model="resetPin"
        type="password"
        :show-password="true"
        placeholder="新口令（至少 4 位）"
        class="app-lock__input"
        @keyup.enter="submitReset"
      />
      <el-input
        v-model="resetConfirm"
        type="password"
        :show-password="true"
        placeholder="确认新口令"
        class="app-lock__input"
        @keyup.enter="submitReset"
      />

      <div v-if="lockState.hardenMasterKey" class="app-lock__warn">
        已开启「口令加固」，重置后主密钥将重建，所有已保存的 API 凭据需重新配置。
      </div>
      <div class="app-lock__error" v-if="errorText">{{ errorText }}</div>

      <el-button type="primary" class="app-lock__btn" :loading="submitting" @click="submitReset">
        重置口令
      </el-button>
      <el-button text class="app-lock__link" @click="backToUnlock">返回解锁</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  lockState,
  verifyAndUnlock,
  requestPinResetEmail,
  submitPinReset
} from '@/utils/lockService'

const mode = ref<'unlock' | 'reset'>('unlock')
const pin = ref('')
const otp = ref('')
const resetPin = ref('')
const resetConfirm = ref('')
const resetTo = ref('')
const submitting = ref(false)
const errorText = ref('')
const cooldownUntil = ref(0)
const pinInputRef = ref<{ focus: () => void } | null>(null)

const cooldownLeft = computed(() => {
  const left = cooldownUntil.value - Date.now()
  return left > 0 ? Math.ceil(left / 1000) : 0
})

let ticker: ReturnType<typeof setInterval> | null = null

async function submit() {
  if (!pin.value || submitting.value) return
  submitting.value = true
  errorText.value = ''
  try {
    const result = await verifyAndUnlock(pin.value)
    if (!result.ok) {
      if (result.reason === 'cooldown') {
        cooldownUntil.value = lockState.cooldownUntil
        errorText.value = ''
      } else {
        const remaining = Math.max(0, lockState.failLimit - lockState.failCount)
        errorText.value = `口令错误，还可尝试 ${remaining} 次`
      }
      pin.value = ''
      await focus()
    }
  } finally {
    submitting.value = false
  }
}

async function startReset() {
  errorText.value = ''
  submitting.value = true
  try {
    const result = await requestPinResetEmail()
    if (!result.ok) {
      errorText.value = result.message
      return
    }
    resetTo.value = result.to ?? ''
    otp.value = ''
    resetPin.value = ''
    resetConfirm.value = ''
    mode.value = 'reset'
  } finally {
    submitting.value = false
  }
}

function backToUnlock() {
  mode.value = 'unlock'
  errorText.value = ''
  otp.value = ''
  resetPin.value = ''
  resetConfirm.value = ''
  pin.value = ''
  focus()
}

async function submitReset() {
  if (submitting.value) return
  if (resetPin.value.length < 4) {
    errorText.value = '新口令至少 4 位'
    return
  }
  if (resetPin.value !== resetConfirm.value) {
    errorText.value = '两次输入的新口令不一致'
    return
  }
  submitting.value = true
  errorText.value = ''
  try {
    const result = await submitPinReset(otp.value, resetPin.value)
    if (!result.ok) {
      errorText.value = result.message
      return
    }
    // 重置成功即解锁，组件将随 locked=false 卸载
  } finally {
    submitting.value = false
  }
}

async function focus() {
  await nextTick()
  pinInputRef.value?.focus()
}

onMounted(() => {
  cooldownUntil.value = lockState.cooldownUntil
  ticker = setInterval(() => {
    if (cooldownUntil.value > Date.now()) return
    if (cooldownUntil.value !== 0) cooldownUntil.value = 0
  }, 1000)
  focus()
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.app-lock {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cp-bg-page);
  padding: 20px;

  &__box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    max-width: 320px;
    padding: 28px 24px;
    border-radius: $radius-lg;
    background: var(--cp-bg-card);
    border: 1px solid var(--cp-border);
    box-shadow: var(--cp-shadow);
  }

  &__logo {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: #fff;
    font-weight: 700;
    font-size: 20px;
  }

  &__title {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }

  &__hint {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--cp-text-secondary);
    text-align: center;
  }

  &__input {
    width: 100%;
    text-align: center;
  }

  &__error {
    font-size: 12.5px;
    color: var(--cp-danger);
  }

  &__warn {
    font-size: 12px;
    line-height: 1.5;
    color: var(--cp-warning);
    background: var(--cp-warning-bg, rgba(245, 158, 11, 0.1));
    border-radius: $radius-sm;
    padding: 8px 10px;
  }

  &__cooldown {
    font-size: 12.5px;
    color: var(--cp-warning);
  }

  &__btn {
    width: 100%;
  }

  &__link {
    font-size: 12.5px;
    color: var(--cp-primary);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>