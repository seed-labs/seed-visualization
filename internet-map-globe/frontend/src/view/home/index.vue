<script setup lang="ts">
import map2D from '@/assets/img/map-2d.png'
import map3D from '@/assets/img/map-3d.png'
import upload2D from '@/assets/img/upload-2d.png'
import upload3D from '@/assets/img/upload-3d.png'

</script>

<template>
  <el-row>
    <el-col>
      <section class="jumbotron text-center">
        <div class="container">
          <h1>INTERNET MAP GLOBE</h1>
          <p class="lead text-muted">This is a work-in-progress prototype of the internet-map-globe..</p>
        </div>
      </section>
    </el-col>
  </el-row>
  <el-row class="menu" style="padding: 20px 0" :justify="'center'">
    <el-col :span="22">
      <ul style="
        display: grid;grid-template-columns: repeat(2, 1fr);
        gap: 20px;
        list-style: none;
        padding: 0;
        margin: 0;"
      >
        <li>
          <router-link
              :to="{ name: 'liveEmulatorTopology3D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="Live globe emulator topology loaded from Docker API data, with live packet capture and replay controls."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>LIVE EMULATOR TOPOLOGY 3D</h3>
                </template>
                <el-image :src="map3D" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'emulatorTopology3D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="File-based globe emulator topology loaded from an uploaded Docker Compose file, with saved packet replay support."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>EMULATOR TOPOLOGY 2D</h3>
                </template>
                <el-image :src="upload3D" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'liveEmulatorTopology2D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="Live emulator topology loaded from Docker API data and rendered as a Cesium 2D map."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>LIVE EMULATOR TOPOLOGY 2D</h3>
                </template>
                <el-image :src="map2D" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'emulatorTopology2D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="File-based emulator topology loaded from an uploaded Docker Compose file and rendered as a Cesium 2D map."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>EMULATOR TOPOLOGY 2D</h3>
                </template>
                <el-image :src="upload2D" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
      </ul>
    </el-col>
  </el-row>
</template>

<style scoped lang="scss">
.jumbotron {
  padding: 2rem 1rem;
  margin-bottom: 2rem;
  background-color: #e9ecef;
  border-radius: .3rem;
}

@media (min-width: 576px) {
  .jumbotron {
    padding: 4rem 2rem;
  }
}

.container {
  text-align: center;
}

.menu a {
  text-decoration: none;
}
</style>
