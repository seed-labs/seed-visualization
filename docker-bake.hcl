variable "DOCKER_USERNAME" {
  default = "handsonsecurity"
}

variable "EMULATOR_SERVICE_TAG" {
  default = "1.0"
}

variable "INTERNET_TOPLOGY_TAG" {
  default = "1.0"
}

variable "INTERNET_GEOGRAPHIC_TAG" {
  default = "1.0"
}

variable "INTERNET_SATELLITE_TAG" {
  default = "1.0"
}

variable "SATELLITE_EMULATOR_TAG" {
  default = "1.0"
}

variable "TRAFFIC_OBSERVER_TAG" {
  default = "1.0"
}

target "_multiarch" {
  platforms = [
    "linux/amd64",
    "linux/arm64"
  ]

  output = ["type=registry"]
}

group "default" {
  targets = [
    "seedemu_emulator_service",
    "seedemu_internet_map_toplogy",
    "seedemu_internet_map_geographic",
    "seedemu_internet_map_satellite",
    "seedemu_satellite_emulator_service",
    "seedemu_traffic_observer_service"
  ]
}

target "seedemu_emulator_service" {
  inherits = ["_multiarch"]

  tags = [
    "${DOCKER_USERNAME}/seedemu-emulator-service:${EMULATOR_SERVICE_TAG}"
  ]
}

target "seedemu_internet_map_toplogy" {
  inherits = ["_multiarch"]

  tags = [
    "${DOCKER_USERNAME}/seedemu-internet-toplogy:${INTERNET_TOPLOGY_TAG}"
  ]
}

target "seedemu_internet_map_geographic" {
  inherits = ["_multiarch"]

  tags = [
    "${DOCKER_USERNAME}/seedemu-internet-map-geographic:${INTERNET_GEOGRAPHIC_TAG}"
  ]
}

target "seedemu_internet_map_satellite" {
  inherits = ["_multiarch"]

  tags = [
    "${DOCKER_USERNAME}/seedemu-internet-map-satellite:${INTERNET_SATELLITE_TAG}"
  ]
}

target "seedemu_satellite_emulator_service" {
  inherits = ["_multiarch"]

  tags = [
    "${DOCKER_USERNAME}/seedemu-satellite-emulator-service:${SATELLITE_EMULATOR_TAG}"
  ]
}

target "seedemu_traffic_observer_service" {
  inherits = ["_multiarch"]

  tags = [
    "${DOCKER_USERNAME}/seedemu-traffic-observer-service:${TRAFFIC_OBSERVER_TAG}"
  ]
}
