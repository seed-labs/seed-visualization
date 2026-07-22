<template>
  <section class="event-timeline" :class="{ collapsed }">
    <header>
      <span v-if="!collapsed">Timeline Events</span>
      <div class="timeline-actions">
        <button v-if="!collapsed" type="button" @click="$emit('toggleList')">
          &#9776; Event List
        </button>
        <button
          type="button"
          class="timeline-collapse-button"
          :aria-label="collapsed ? 'Expand timeline' : 'Collapse timeline'"
          :title="collapsed ? 'Expand timeline' : 'Collapse timeline'"
          @click="$emit('toggleCollapsed')"
        >
          <span v-if="collapsed">&#8963;</span>
          <span v-else>&#8964;</span>
        </button>
      </div>
    </header>

    <div v-if="!collapsed" class="timeline-body">
      <button
        class="timeline-nav timeline-nav-left"
        type="button"
        aria-label="Move timeline left"
        @click="$emit('shiftWindow', -1)"
      >
        &lsaquo;
      </button>

      <div class="timeline-canvas">
        <div class="timeline-current-marker" :style="{ '--x': `${currentTimeLeftPercent}%` }">
          <i></i>
        </div>

        <button
          v-for="event in visibleEvents"
          :key="event.id"
          type="button"
          class="timeline-event-marker"
          :class="[
            `event-${event.kind}`,
            { 'label-hidden': !event.showLabel, 'clustered': event.isCluster },
          ]"
          :style="{
            '--x': `${event.leftPercent}%`,
            '--cluster-width': `${event.clusterWidthPercent}%`,
            '--label-y': `${event.labelLane * -24}px`,
          }"
          :title="event.isCluster ? `${event.clusterCount} events / ${event.isoTime}` : `${event.action} / ${event.detail} / ${event.isoTime}`"
          @click="$emit('selectMarker', event)"
        >
          <span class="event-line"></span>
          <template v-if="event.showLabel">
            <span v-if="event.isCluster" class="cluster-count-badge">
              {{ event.clusterCount }}
            </span>
            <template v-else>
              <strong>{{ event.timeLabel }}</strong>
              <b>{{ event.shortLabel }}</b>
              <em>{{ event.action }} {{ event.detail }}</em>
            </template>
          </template>
        </button>

        <div class="timeline-axis">
          <span
            v-for="tick in ticks"
            :key="tick.timestampMs"
            class="timeline-tick"
            :style="{ '--x': `${tick.leftPercent}%` }"
          >
            <i></i>
            <em>{{ tick.label }}</em>
          </span>
        </div>
      </div>

      <button
        class="timeline-nav timeline-nav-right"
        type="button"
        aria-label="Move timeline right"
        @click="$emit('shiftWindow', 1)"
      >
        &rsaquo;
      </button>
    </div>

    <div v-if="listVisible && !collapsed" class="timeline-event-list">
      <header>
        <span>Event List</span>
        <button type="button" @click="$emit('closeList')">&times;</button>
      </header>
      <div class="timeline-event-table-head">
        <button type="button" class="timeline-sort-button" @click="$emit('toggleSort')">
          <span>Date</span>
          <i :class="{ asc: !sortDescending, desc: sortDescending }"></i>
        </button>
        <span>Type</span>
        <span>Event</span>
      </div>
      <div class="timeline-event-rows">
        <button
          v-for="event in sortedEvents"
          :key="event.id"
          type="button"
          :class="`event-${event.kind}`"
          @click="$emit('selectEvent', event)"
        >
          <strong>{{ event.isoTime }}</strong>
          <span>{{ event.shortLabel }}</span>
          <em>
            <b>{{ event.action }}</b>
            <small>{{ event.detail }}</small>
          </em>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  TimelineDisplayEvent,
  TimelineEvent,
  TimelineTick,
} from '@/features/starlink/types/timeline';

defineProps<{
  collapsed: boolean;
  listVisible: boolean;
  sortDescending: boolean;
  currentTimeLeftPercent: number;
  visibleEvents: TimelineDisplayEvent[];
  sortedEvents: TimelineEvent[];
  ticks: TimelineTick[];
}>();

defineEmits<{
  toggleList: [];
  closeList: [];
  toggleCollapsed: [];
  shiftWindow: [direction: 1 | -1];
  toggleSort: [];
  selectMarker: [event: TimelineDisplayEvent];
  selectEvent: [event: TimelineEvent];
}>();
</script>

<style scoped lang="scss" src="@/features/starlink/styles/timeline-events.scss"></style>
