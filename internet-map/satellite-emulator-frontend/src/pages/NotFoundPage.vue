<template>
  <main class="not-found-page">
    <section>
      <span>404</span>
      <h1>Page Not Found</h1>
      <RouterLink to="/starlink">Back to Starlink Simulation</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.not-found-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  color: #edf7ff;
  background: #020815;
}

.not-found-page section {
  display: grid;
  gap: 14px;
  text-align: center;
}

.not-found-page span {
  color: #30d5c8;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.not-found-page h1 {
  margin: 0;
  font-size: 28px;
}

.not-found-page a {
  color: #ffcf5a;
  text-decoration: none;
}

.not-found-page a:hover {
  color: #ffe49a;
}
</style>
