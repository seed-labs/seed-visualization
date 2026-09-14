<script setup lang="ts">
import BaseUploadMap from '@/components/BaseUploadMap/index.vue'
import {MapUi, type UploadMapUiOtherConfiguration} from './ui'
import {DataSource} from './datasource'

const uploadMapUiOtherConfiguration: UploadMapUiOtherConfiguration = {}
</script>

<template>
  <BaseUploadMap
      :map-ui-class="MapUi"
      :data-source-class="DataSource"
      :other-config="uploadMapUiOtherConfiguration"
  />
</template>
