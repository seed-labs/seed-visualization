<template>
  <section class="satellite-list embedded">
    <section class="settings-tab">
      <div class="time-control">
        <div class="time-control-heading">
          <span>System time</span>
          <small>
            {{ settings.paused ? 'Paused' : settings.customTimeEnabled ? 'Custom' : 'Automatic' }}
          </small>
        </div>
        <label for="simulation-timestamp">Unix timestamp (seconds)</label>
        <el-input-number
          id="simulation-timestamp"
          v-model="timestampInput"
          :min="0"
          :max="maxTimestampSeconds"
          :precision="0"
          :step="1"
          controls-position="right"
        />
        <small class="time-preview">{{ timestampPreview }}</small>
        <div class="time-actions">
          <el-button type="primary" :disabled="!validTimestamp" @click="applySystemTime">
            Apply
          </el-button>
          <el-button @click="resetSystemTime">Use current time</el-button>
          <el-button
            :type="settings.paused ? 'success' : 'warning'"
            @click="updateSetting('paused', !settings.paused)"
          >
            {{ settings.paused ? 'Resume' : 'Pause' }}
          </el-button>
        </div>
      </div>

      <div class="control-row">
        <span>Simulation speed</span>
        <el-segmented
          :model-value="settings.speed"
          :options="speedOptions"
          :disabled="speedDisabled"
          @update:model-value="updateSetting('speed', Number($event))"
        />
      </div>

      <div class="switch-grid">
        <el-tooltip
          content="Show or hide satellite nodes<br/>on the globe."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showSatellites"
            active-text="Show satellites"
            @update:model-value="updateSetting('showSatellites', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show or hide ground station<br/>nodes on the globe."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showGroundStations"
            active-text="Show ground stations"
            @update:model-value="updateSetting('showGroundStations', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show orbit paths for selected<br/>or connected satellites."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showOrbits"
            active-text="Orbits"
            @update:model-value="updateSetting('showOrbits', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show name labels for selected<br/>or highlighted satellites."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showLabels"
            active-text="Labels"
            @update:model-value="updateSetting('showLabels', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show details when hovering over a satellite<br/>or ground station."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showSelectionDetails"
            active-text="Hover details"
            @update:model-value="updateSetting('showSelectionDetails', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Use locally calculated nearest-station links<br/>instead of backend ground links."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.useLocalGroundLinks"
            active-text="Local links"
            @update:model-value="updateSetting('useLocalGroundLinks', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Hide every link involving a satellite<br/>excluded by the current filters."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.hideLinksForFilteredSatellites"
            active-text="Hide filtered links"
            @update:model-value="updateSetting('hideLinksForFilteredSatellites', Boolean($event))"
          />
        </el-tooltip>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SimulationSettings } from '@/features/starlink/types';

const props = defineProps<{
  settings: SimulationSettings;
  currentTime: Date;
  speedDisabled?: boolean;
}>();

const emit = defineEmits<{
  updateSettings: [settings: SimulationSettings];
  setSystemTime: [timestampMs: number];
  resetSystemTime: [];
}>();

const timestampInput = ref<number>();
const maxTimestampSeconds = Math.floor(8_640_000_000_000_000 / 1000);
const speedOptions = [
  { label: '1x', value: 1 },
  { label: '10x', value: 10 },
  { label: '60x', value: 60 },
  { label: '600x', value: 600 },
];

const validTimestamp = computed(
  () =>
    typeof timestampInput.value === 'number' &&
    Number.isFinite(timestampInput.value) &&
    timestampInput.value >= 0 &&
    timestampInput.value <= maxTimestampSeconds,
);
const timestampPreview = computed(() => {
  if (!validTimestamp.value) {
    return 'Enter a valid timestamp';
  }

  return `${new Date(Math.trunc(timestampInput.value!) * 1000).toISOString()} UTC`;
});

watch(
  () => props.currentTime,
  () => {
    if (!timestampInput.value) {
      syncTimestampInput();
    }
  },
  { immediate: true },
);

function updateSetting<Key extends keyof SimulationSettings>(
  key: Key,
  value: SimulationSettings[Key],
) {
  emit('updateSettings', {
    ...props.settings,
    [key]: value,
  });
}

function syncTimestampInput() {
  timestampInput.value = Math.floor(props.currentTime.getTime() / 1000);
}

function applySystemTime() {
  if (!validTimestamp.value) {
    return;
  }

  const timestampMs = Math.trunc(timestampInput.value!) * 1000;
  emit('setSystemTime', timestampMs);
  timestampInput.value = timestampMs / 1000;
}

function resetSystemTime() {
  emit('resetSystemTime');
  timestampInput.value = Math.floor(Date.now() / 1000);
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-list.scss"></style>
